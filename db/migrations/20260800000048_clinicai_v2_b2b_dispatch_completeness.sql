-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-48 · clinicai-v2 · completar disparos B2B (auditoria      ║
-- ║   2026-04-27 · Alden pediu cobrir todos os 13 gaps)                     ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ 1. ENRIQUECE _b2b_voucher_dispatch_on_status_change · branch 'opened'   ║
-- ║    (parceira recebe template voucher_opened quando convidada abre).     ║
-- ║                                                                          ║
-- ║ 2. ENRIQUECE _b2b_sync_voucher_from_appointment · dispatch direto pra   ║
-- ║    convidada (beneficiary) em 2 cenarios novos:                          ║
-- ║      - appt status='no_show' → voucher_no_show_recovery (gap 8)         ║
-- ║      - appt status='finalizado' → voucher_post_attendance (gap 9)       ║
-- ║                                                                          ║
-- ║ 3. NOVA TRIGGER · INSERT b2b_partnership_applications · dispara         ║
-- ║    admin_application_received pra Mirian (gap 11).                       ║
-- ║                                                                          ║
-- ║ 4. CHECK CONSTRAINT · voucher_validity_days >= 1 (gap 13).              ║
-- ║                                                                          ║
-- ║ Idempotente · CREATE OR REPLACE + IF NOT EXISTS.                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. _b2b_voucher_dispatch_on_status_change · adiciona branch opened
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._b2b_voucher_dispatch_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $function$
DECLARE
  v_event_key text;
  v_context jsonb;
  v_first_name text;
  v_appointment_text text;
BEGIN
  IF COALESCE(NEW.is_demo, false) THEN RETURN NEW; END IF;
  IF NEW.partnership_id IS NULL THEN RETURN NEW; END IF;

  -- Map status → event_key (parceira)
  v_event_key := CASE NEW.status
    WHEN 'opened'    THEN 'voucher_opened'        -- gap 3 fix
    WHEN 'scheduled' THEN 'voucher_scheduled'
    WHEN 'redeemed'  THEN 'voucher_redeemed'
    WHEN 'purchased' THEN 'voucher_purchased'
    WHEN 'expired'   THEN 'voucher_expired_partner' -- gap 4 fix
    ELSE NULL
  END;

  IF v_event_key IS NULL THEN RETURN NEW; END IF;

  v_first_name := split_part(COALESCE(NEW.recipient_name, 'convidada'), ' ', 1);

  IF NEW.redeemed_by_appointment_id IS NOT NULL THEN
    BEGIN
      SELECT to_char(appointment_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
        INTO v_appointment_text
        FROM public.appointments
       WHERE id = NEW.redeemed_by_appointment_id
       LIMIT 1;
    EXCEPTION WHEN undefined_table OR undefined_column THEN v_appointment_text := NULL;
    END;
  END IF;

  v_context := jsonb_build_object(
    'convidada_first', v_first_name,
    'convidada',       NEW.recipient_name,
    'appointment_at',  COALESCE(v_appointment_text, ''),
    'procedimento',    COALESCE(NEW.combo, '')
  );

  BEGIN
    PERFORM public._b2b_invoke_edge(
      'b2b-comm-dispatch',
      jsonb_build_object(
        'partnership_id', NEW.partnership_id,
        'event_key',      v_event_key,
        'context',        v_context
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[dispatch trigger] falhou: % (event=%, voucher=%)', SQLERRM, v_event_key, NEW.id;
  END;

  RETURN NEW;
END $function$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. _b2b_sync_voucher_from_appointment · dispatch direto pra beneficiary
--    nos cenarios de no_show e post-atendimento (gaps 8 e 9)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._b2b_sync_voucher_from_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_phone_clean    text;
  v_target_status  text;
  v_attr           record;
  v_voucher_status text;
  v_revenue        numeric;
  v_voucher_row    record;
BEGIN
  v_phone_clean := regexp_replace(COALESCE(NEW.patient_phone, ''), '\D', '', 'g');
  IF length(v_phone_clean) < 10 THEN
    RETURN NEW;
  END IF;

  SELECT a.id, a.voucher_id, a.clinic_id
    INTO v_attr
    FROM public.b2b_attributions a
   WHERE right(regexp_replace(COALESCE(a.lead_phone, ''), '\D', '', 'g'), 8)
       = right(v_phone_clean, 8)
     AND a.voucher_id IS NOT NULL
   ORDER BY a.created_at DESC
   LIMIT 1;

  IF v_attr.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Carrega voucher pra contexto + dispatch beneficiary
  SELECT id, status, recipient_name, recipient_phone, partnership_id, combo
    INTO v_voucher_row
    FROM public.b2b_vouchers
   WHERE id = v_attr.voucher_id;

  IF v_voucher_row.id IS NULL THEN RETURN NEW; END IF;

  -- ═══ Branch 1 · no_show ═══
  IF NEW.status = 'no_show' THEN
    UPDATE public.b2b_attributions
       SET status = 'no_show', updated_at = now()
     WHERE id = v_attr.id;
    -- gap 8 fix · dispara voucher_no_show_recovery (beneficiary)
    BEGIN
      PERFORM public._b2b_invoke_edge(
        'b2b-comm-dispatch',
        jsonb_build_object(
          'partnership_id', v_voucher_row.partnership_id,
          'event_key',      'voucher_no_show_recovery',
          'recipient_role', 'beneficiary',
          'recipient_phone', v_voucher_row.recipient_phone,
          'context',        jsonb_build_object(
            'convidada_first', split_part(COALESCE(v_voucher_row.recipient_name,'convidada'),' ',1),
            'convidada',       v_voucher_row.recipient_name
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[no_show dispatch] %', SQLERRM;
    END;
    RETURN NEW;
  END IF;

  -- ═══ Branch 2 · cancelado ═══
  IF NEW.status = 'cancelado' THEN
    UPDATE public.b2b_attributions
       SET status = 'cancelled', updated_at = now()
     WHERE id = v_attr.id;
    RETURN NEW;
  END IF;

  -- Mapeia status normal
  IF NEW.status IN ('agendado', 'aguardando_confirmacao', 'confirmado') THEN
    v_target_status := 'scheduled';
  ELSIF NEW.status = 'finalizado' THEN
    IF NEW.payment_status = 'pago' THEN
      v_target_status := 'purchased';
    ELSE
      v_target_status := 'redeemed';
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  v_voucher_status := v_voucher_row.status;

  IF public._b2b_voucher_status_rank(v_voucher_status) >= public._b2b_voucher_status_rank(v_target_status)
     OR v_voucher_status IN ('expired', 'cancelled') THEN
    RETURN NEW;
  END IF;

  UPDATE public.b2b_vouchers
     SET status = v_target_status, updated_at = now()
   WHERE id = v_attr.voucher_id;

  v_revenue := COALESCE((
    SELECT SUM(COALESCE((p->>'valor')::numeric, 0))
      FROM jsonb_array_elements(COALESCE(NEW.pagamentos, '[]'::jsonb)) p
  ), 0);

  IF v_target_status = 'scheduled' THEN
    UPDATE public.b2b_attributions
       SET first_appointment_id = COALESCE(first_appointment_id, NEW.id::text),
           first_appointment_at = COALESCE(first_appointment_at, NEW.created_at),
           scheduled_at         = COALESCE(scheduled_at, now()),
           status               = 'scheduled',
           updated_at           = now()
     WHERE id = v_attr.id;
  ELSIF v_target_status = 'redeemed' THEN
    UPDATE public.b2b_attributions
       SET attended_at = COALESCE(attended_at, now()),
           status      = 'attended',
           updated_at  = now()
     WHERE id = v_attr.id;
    -- gap 9 fix · dispara voucher_post_attendance (beneficiary)
    BEGIN
      PERFORM public._b2b_invoke_edge(
        'b2b-comm-dispatch',
        jsonb_build_object(
          'partnership_id', v_voucher_row.partnership_id,
          'event_key',      'voucher_post_attendance',
          'recipient_role', 'beneficiary',
          'recipient_phone', v_voucher_row.recipient_phone,
          'context',        jsonb_build_object(
            'convidada_first', split_part(COALESCE(v_voucher_row.recipient_name,'convidada'),' ',1)
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[post_attendance dispatch] %', SQLERRM;
    END;
  ELSIF v_target_status = 'purchased' THEN
    UPDATE public.b2b_attributions
       SET attended_at             = COALESCE(attended_at, now()),
           converted_at            = now(),
           converted_appointment_id = NEW.id::text,
           converted_amount_brl    = v_revenue,
           revenue_brl             = COALESCE(revenue_brl, 0) + v_revenue,
           status                  = 'converted',
           updated_at              = now()
     WHERE id = v_attr.id;
  END IF;

  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Trigger em b2b_partnership_applications INSERT · gap 11
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._b2b_dispatch_application_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  BEGIN
    PERFORM public._b2b_invoke_edge(
      'b2b-comm-dispatch',
      jsonb_build_object(
        'event_key',      'admin_application_received',
        'recipient_role', 'admin',
        'context',        jsonb_build_object(
          'application_id',  NEW.id::text,
          'candidate_name',  COALESCE(NEW.contact_name, NEW.business_name, 'candidata'),
          'partnership_name', COALESCE(NEW.business_name, NEW.contact_name, 'novo cadastro'),
          'pillar',          COALESCE(NEW.pillar, '—')
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[application_received dispatch] %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_dispatch_application_received ON public.b2b_partnership_applications;
CREATE TRIGGER trg_b2b_dispatch_application_received
AFTER INSERT ON public.b2b_partnership_applications
FOR EACH ROW
EXECUTE FUNCTION public._b2b_dispatch_application_received();

-- ═══════════════════════════════════════════════════════════════════════
-- 4. CHECK constraint · validity_days > 0 (gap 13)
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname='b2b_partnerships_validity_days_positive'
  ) THEN
    ALTER TABLE public.b2b_partnerships
      ADD CONSTRAINT b2b_partnerships_validity_days_positive
      CHECK (voucher_validity_days IS NULL OR voucher_validity_days > 0);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_b2b_dispatch_application_received') THEN
    RAISE EXCEPTION 'ASSERT FAIL: trigger application_received nao criado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='b2b_partnerships_validity_days_positive') THEN
    RAISE EXCEPTION 'ASSERT FAIL: constraint validity_days nao criado';
  END IF;
  RAISE NOTICE '✅ Mig 800-48 OK · 4 fixes (opened+expired dispatch · no_show+post_attendance pra beneficiary · application_received · validity_days CHECK)';
END $$;

COMMIT;
