-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-140 · clinicai-v2 · b2b-comm-dispatch payload + voucher_id ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Adiciona 'voucher_id' aos payloads que disparam a edge b2b-comm-dispatch ║
-- ║ via _b2b_invoke_edge. Sem isso, a edge não consegue escrever no ledger   ║
-- ║ b2b_voucher_dispatch_events (mig 139) porque não sabe qual voucher.     ║
-- ║                                                                          ║
-- ║ Mudanças:                                                                ║
-- ║   1. _b2b_voucher_dispatch_on_status_change()                            ║
-- ║      - adiciona 'voucher_id', NEW.id no payload                          ║
-- ║      - adiciona 'recipient_role', 'partner' explicitamente               ║
-- ║      (todos os 5 status: opened/scheduled/redeemed/purchased/expired)    ║
-- ║                                                                          ║
-- ║   2. _b2b_sync_voucher_from_appointment()                                ║
-- ║      - adiciona 'voucher_id', v_voucher_row.id no dispatch               ║
-- ║        voucher_no_show_recovery                                          ║
-- ║      - adiciona 'voucher_id', v_voucher_row.id no dispatch               ║
-- ║        voucher_post_attendance                                           ║
-- ║                                                                          ║
-- ║ NÃO altera:                                                              ║
-- ║   - public._b2b_invoke_edge (intacta · mig 88 vence)                     ║
-- ║   - public._b2b_dispatch_application_received (sem voucher · sem mudança)║
-- ║   - mira-voucher-validity-reminder cron (TS · patch separado)            ║
-- ║   - mira-voucher-post-purchase-upsell cron (TS · patch separado)         ║
-- ║   - constraint b2b_partnerships_validity_days_positive (mig 48 já criou) ║
-- ║   - trigger trg_b2b_dispatch_application_received (mig 48 já criou)      ║
-- ║                                                                          ║
-- ║ Aplicada manualmente em prod 2026-05-07. Validação observada:           ║
-- ║   validation_name =                                                      ║
-- ║     migration_140_b2b_comm_dispatch_payload_voucher_id_validation        ║
-- ║   final_decision =                                                       ║
-- ║     PASS_MIG_140_PAYLOADS_NOW_INCLUDE_VOUCHER_ID                         ║
-- ║                                                                          ║
-- ║ Idempotente · CREATE OR REPLACE FUNCTION · pode rodar múltiplas vezes   ║
-- ║ sem efeito colateral · sanity final RAISE WARNING/NOTICE sem exception. ║
-- ║                                                                          ║
-- ║ ADR-029: SECURITY DEFINER + SET search_path                              ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · pgrst reload          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. _b2b_voucher_dispatch_on_status_change · adiciona voucher_id + recipient_role
-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger AFTER UPDATE em b2b_vouchers · mapeia status → event_key e dispara
-- b2b-comm-dispatch via _b2b_invoke_edge. Lógica preservada da mig 48 ·
-- únicas mudanças: 2 chaves novas no jsonb_build_object do payload.

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
        'voucher_id',     NEW.id,
        'event_key',      v_event_key,
        'recipient_role', 'partner',
        'context',        v_context
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[dispatch trigger] falhou: % (event=%, voucher=%)', SQLERRM, v_event_key, NEW.id;
  END;

  RETURN NEW;
END $function$;

COMMENT ON FUNCTION public._b2b_voucher_dispatch_on_status_change() IS
'Mig 140 · payload b2b-comm-dispatch agora inclui voucher_id + recipient_role explícito · habilita escrita no ledger b2b_voucher_dispatch_events.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. _b2b_sync_voucher_from_appointment · adiciona voucher_id em 2 dispatches
-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger em appointments · sincroniza b2b_vouchers status pelo appointment.
-- Lógica preservada da mig 48 · únicas mudanças: 1 chave nova ('voucher_id')
-- nos 2 jsonb_build_object dos dispatches voucher_no_show_recovery e
-- voucher_post_attendance.

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
          'partnership_id',  v_voucher_row.partnership_id,
          'voucher_id',      v_voucher_row.id,
          'event_key',       'voucher_no_show_recovery',
          'recipient_role',  'beneficiary',
          'recipient_phone', v_voucher_row.recipient_phone,
          'context',         jsonb_build_object(
            'convidada_first', split_part(COALESCE(v_voucher_row.recipient_name, 'convidada'), ' ', 1),
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
          'partnership_id',  v_voucher_row.partnership_id,
          'voucher_id',      v_voucher_row.id,
          'event_key',       'voucher_post_attendance',
          'recipient_role',  'beneficiary',
          'recipient_phone', v_voucher_row.recipient_phone,
          'context',         jsonb_build_object(
            'convidada_first', split_part(COALESCE(v_voucher_row.recipient_name, 'convidada'), ' ', 1)
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

COMMENT ON FUNCTION public._b2b_sync_voucher_from_appointment() IS
'Mig 140 · payloads b2b-comm-dispatch (no_show + post_attendance) agora incluem voucher_id · habilita escrita no ledger b2b_voucher_dispatch_events.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Sanity check final (regra GOLD #7) · RAISE WARNING/NOTICE · sem exception
--    Sobrevive a replay em ambiente já provisionado · valida shape do payload
--    via inspeção de pg_get_functiondef (texto da função).
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_dispatch_def text;
  v_sync_def     text;
  v_dispatch_found int;
  v_sync_found     int;
BEGIN
  -- 4.1 · _b2b_voucher_dispatch_on_status_change existe
  SELECT count(*) INTO v_dispatch_found
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = '_b2b_voucher_dispatch_on_status_change';
  IF v_dispatch_found < 1 THEN
    RAISE WARNING '[mig 140 sanity] _b2b_voucher_dispatch_on_status_change ausente';
    RETURN;
  END IF;

  -- 4.2 · _b2b_sync_voucher_from_appointment existe
  SELECT count(*) INTO v_sync_found
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = '_b2b_sync_voucher_from_appointment';
  IF v_sync_found < 1 THEN
    RAISE WARNING '[mig 140 sanity] _b2b_sync_voucher_from_appointment ausente';
    RETURN;
  END IF;

  -- 4.3 · Lê definição texto das 2 funções
  SELECT pg_get_functiondef(p.oid) INTO v_dispatch_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = '_b2b_voucher_dispatch_on_status_change'
   LIMIT 1;

  SELECT pg_get_functiondef(p.oid) INTO v_sync_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = '_b2b_sync_voucher_from_appointment'
   LIMIT 1;

  -- 4.4 · _b2b_voucher_dispatch_on_status_change deve conter voucher_id + recipient_role
  IF v_dispatch_def IS NULL OR position('''voucher_id'',     NEW.id' IN v_dispatch_def) = 0 THEN
    RAISE WARNING '[mig 140 sanity] _b2b_voucher_dispatch_on_status_change NÃO contém ''voucher_id'', NEW.id';
  END IF;

  IF v_dispatch_def IS NULL OR position('''recipient_role'', ''partner''' IN v_dispatch_def) = 0 THEN
    RAISE WARNING '[mig 140 sanity] _b2b_voucher_dispatch_on_status_change NÃO contém ''recipient_role'', ''partner''';
  END IF;

  -- 4.5 · _b2b_sync_voucher_from_appointment deve conter voucher_id + ambos event_keys
  IF v_sync_def IS NULL OR position('''voucher_id'',      v_voucher_row.id' IN v_sync_def) = 0 THEN
    RAISE WARNING '[mig 140 sanity] _b2b_sync_voucher_from_appointment NÃO contém ''voucher_id'', v_voucher_row.id';
  END IF;

  IF v_sync_def IS NULL OR position('voucher_no_show_recovery' IN v_sync_def) = 0 THEN
    RAISE WARNING '[mig 140 sanity] _b2b_sync_voucher_from_appointment NÃO contém voucher_no_show_recovery';
  END IF;

  IF v_sync_def IS NULL OR position('voucher_post_attendance' IN v_sync_def) = 0 THEN
    RAISE WARNING '[mig 140 sanity] _b2b_sync_voucher_from_appointment NÃO contém voucher_post_attendance';
  END IF;

  RAISE NOTICE '[mig 140] sanity ok · payloads b2b-comm-dispatch incluem voucher_id';
END
$sanity$;
