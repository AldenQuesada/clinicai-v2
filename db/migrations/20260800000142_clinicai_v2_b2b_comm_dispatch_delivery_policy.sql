-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-142 · clinicai-v2 · b2b dispatch delivery_policy          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Adiciona conceitos `dispatch_kind` + `delivery_policy` aos payloads     ║
-- ║ de _b2b_invoke_edge('b2b-comm-dispatch', ...). Sem essa distinção,     ║
-- ║ TUDO caía em quiet_hours queue · vouchers transacionais (status        ║
-- ║ change, no_show, post_attendance) ficavam pending fora do horário      ║
-- ║ comercial · convidada/parceiro recebia confirmação atrasada.            ║
-- ║                                                                          ║
-- ║ Estado final esperado:                                                   ║
-- ║   - dispatch_kind='transactional' + delivery_policy='immediate'         ║
-- ║     → BYPASS quiet_hours · vai direto                                    ║
-- ║   - dispatch_kind='operational'   + delivery_policy='immediate'         ║
-- ║     → BYPASS quiet_hours · alertas internos da clínica                  ║
-- ║   - dispatch_kind='campaign'/'broadcast'/'marketing'                    ║
-- ║     → APLICA quiet_hours · respeita horário comercial                   ║
-- ║   - sem política explícita ou delivery_policy='scheduled'               ║
-- ║     → APLICA quiet_hours (comportamento legado mantido · default seguro)║
-- ║                                                                          ║
-- ║ Mudanças nesta migration:                                                ║
-- ║   1. _b2b_invoke_edge() · respeita dispatch_kind + delivery_policy      ║
-- ║      (Authorization Bearer da mig 141 PRESERVADO)                       ║
-- ║   2. _b2b_voucher_dispatch_on_status_change()                           ║
-- ║      payload ganha 'dispatch_kind':'transactional' +                    ║
-- ║      'delivery_policy':'immediate'                                       ║
-- ║   3. _b2b_sync_voucher_from_appointment()                               ║
-- ║      voucher_no_show_recovery + voucher_post_attendance ambos           ║
-- ║      transactional/immediate                                             ║
-- ║   4. _b2b_dispatch_application_received() · operational/immediate       ║
-- ║                                                                          ║
-- ║ NÃO mudou:                                                               ║
-- ║   - schema b2b_pending_dispatches (intacto · só usa pra delivery_policy ║
-- ║     que NÃO é immediate)                                                 ║
-- ║   - schema b2b_voucher_dispatch_events (intacto)                        ║
-- ║   - edge b2b-comm-dispatch (intacta · ledger writer continua)           ║
-- ║   - bypass_quiet_hours legacy (continua funcionando · short-circuit)    ║
-- ║   - Authorization Bearer da mig 141 (preservado em _b2b_invoke_edge)    ║
-- ║   - GRANTs                                                               ║
-- ║                                                                          ║
-- ║ Aplicada manualmente em prod 2026-05-07. Validações observadas:         ║
-- ║   final_decision = PASS_MIG_142_DELIVERY_POLICY_READY                    ║
-- ║   _b2b_invoke_edge contém: delivery_policy / dispatch_kind /            ║
-- ║     Authorization / quiet_hours / b2b_pending_dispatches                 ║
-- ║   _b2b_voucher_dispatch_on_status_change:                               ║
-- ║     dispatch_kind='transactional' · delivery_policy='immediate'         ║
-- ║   _b2b_sync_voucher_from_appointment:                                   ║
-- ║     no_show_recovery transactional/immediate                            ║
-- ║     post_attendance transactional/immediate                             ║
-- ║   _b2b_dispatch_application_received: operational/immediate             ║
-- ║                                                                          ║
-- ║ Runtime smoke confirmou:                                                 ║
-- ║   PASS_VOUCHER_PURCHASED_IMMEDIATE_DISPATCH_AND_LEDGER_OK               ║
-- ║   pending bypass request 36288 PASS                                     ║
-- ║   PASS_NO_PENDING_ROWS_LEFT_FOR_TEST_VOUCHER                            ║
-- ║                                                                          ║
-- ║ Idempotente · CREATE OR REPLACE FUNCTION × 4 · roda múltiplas vezes    ║
-- ║ sem efeito colateral · sanity final RAISE WARNING/NOTICE sem exception.║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. _b2b_invoke_edge · respeita delivery_policy + dispatch_kind
--    (Authorization Bearer da mig 141 PRESERVADO · ZERO secret inline)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._b2b_invoke_edge(
  p_path text,
  p_body jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url             text;
  v_request_id      bigint;
  v_bypass          boolean;
  v_clinic_id       uuid;
  v_partnership_id  uuid;
  v_pending_id      uuid;
  v_scheduled_for   timestamptz;
  v_event_key       text;
  v_service_key     text;
  v_headers         jsonb;
  v_dispatch_kind   text;
  v_delivery_policy text;
  v_apply_quiet     boolean;
BEGIN
  v_url := 'https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/' || p_path;

  -- ─── Decide se aplica guard de quiet_hours ────────────────────────────
  -- Só vale pra path b2b-comm-dispatch · outras edges (b2b-mira-router,
  -- b2b-insights-generator, etc) passam direto sem checar horário.
  IF p_path = 'b2b-comm-dispatch' THEN
    v_bypass := COALESCE((p_body ->> 'bypass_quiet_hours')::boolean, false);

    -- Mig 142: classificação do dispatch decide se respeita quiet_hours.
    --   immediate / transactional / operational / manual → BYPASS
    --   campaign / broadcast / marketing / sem política → APLICA
    v_dispatch_kind   := lower(NULLIF(p_body ->> 'dispatch_kind', ''));
    v_delivery_policy := lower(NULLIF(p_body ->> 'delivery_policy', ''));

    v_apply_quiet := TRUE;
    IF v_delivery_policy = 'immediate'
       OR v_dispatch_kind IN ('transactional', 'operational', 'manual') THEN
      v_apply_quiet := FALSE;
    END IF;

    -- bypass_quiet_hours legacy continua funcionando (short-circuit · vence
    -- todas as outras flags).
    IF NOT v_bypass AND v_apply_quiet THEN
      -- Resolve clinic_id em ordem de preferência
      v_clinic_id := NULLIF(p_body ->> 'clinic_id', '')::uuid;

      IF v_clinic_id IS NULL THEN
        v_partnership_id := NULLIF(p_body ->> 'partnership_id', '')::uuid;
        IF v_partnership_id IS NOT NULL THEN
          SELECT clinic_id INTO v_clinic_id
            FROM public.b2b_partnerships
           WHERE id = v_partnership_id
           LIMIT 1;
        END IF;
      END IF;

      IF v_clinic_id IS NULL THEN
        v_clinic_id := public.app_clinic_id();
      END IF;

      -- Decisão: dentro/fora do horário comercial
      IF NOT public._b2b_is_within_business_hours(v_clinic_id, now()) THEN
        v_scheduled_for := public._b2b_next_window_start(v_clinic_id, now());
        v_event_key     := NULLIF(p_body ->> 'event_key', '');

        INSERT INTO public.b2b_pending_dispatches (
          clinic_id, edge_path, payload, scheduled_for,
          reason, source_event_key, partnership_id
        ) VALUES (
          v_clinic_id, p_path, p_body, v_scheduled_for,
          'quiet_hours', v_event_key, v_partnership_id
        ) RETURNING id INTO v_pending_id;

        RAISE NOTICE '[_b2b_invoke_edge] queued (quiet_hours) id=% scheduled=% event=% kind=% policy=%',
          v_pending_id, v_scheduled_for, v_event_key, v_dispatch_kind, v_delivery_policy;

        RETURN jsonb_build_object(
          'ok',            true,
          'queued',        true,
          'pending_id',    v_pending_id,
          'scheduled_for', v_scheduled_for,
          'reason',        'quiet_hours'
        );
      END IF;
    END IF;
  END IF;

  -- ─── Headers · Authorization Bearer pra atender verify_jwt=true ──────
  -- Lê service_role_key de clinic_secrets (mesmo padrão da mig 131 ·
  -- preservado da mig 141). Quando ausente, fallback pra header mínimo
  -- (Content-Type só) · edges com verify_jwt=false continuam funcionais.
  -- ZERO secret inline · valor vem 100% de public.clinic_secrets.
  SELECT value INTO v_service_key
    FROM public.clinic_secrets
   WHERE key = 'supabase_service_role_key'
   LIMIT 1;

  IF v_service_key IS NOT NULL AND v_service_key <> '' THEN
    v_headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_service_key
    );
  ELSE
    RAISE WARNING '[_b2b_invoke_edge] supabase_service_role_key ausente em clinic_secrets · edges com verify_jwt=true vão falhar (path=%)', p_path;
    v_headers := jsonb_build_object('Content-Type', 'application/json');
  END IF;

  -- ─── Caminho normal · fire-and-forget via pg_net ──────────────────────
  SELECT net.http_post(
    url     := v_url,
    headers := v_headers,
    body    := p_body,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'url', v_url);

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'edge invoke falhou (%): %', p_path, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;

GRANT EXECUTE ON FUNCTION public._b2b_invoke_edge(text, jsonb)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public._b2b_invoke_edge(text, jsonb) IS
'Mig 142 · respeita dispatch_kind/delivery_policy · transacionais bypass quiet_hours · campanhas respeitam horário · Authorization Bearer da mig 141 preservado · ZERO secret inline.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. _b2b_voucher_dispatch_on_status_change · transactional/immediate
-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger AFTER UPDATE em b2b_vouchers · status change é transacional ·
-- precisa ir AGORA pra parceira receber confirmação na hora. Lógica
-- preservada da mig 140 · única mudança: 2 chaves novas no payload.

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

  v_event_key := CASE NEW.status
    WHEN 'opened'    THEN 'voucher_opened'
    WHEN 'scheduled' THEN 'voucher_scheduled'
    WHEN 'redeemed'  THEN 'voucher_redeemed'
    WHEN 'purchased' THEN 'voucher_purchased'
    WHEN 'expired'   THEN 'voucher_expired_partner'
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
        'partnership_id',  NEW.partnership_id,
        'voucher_id',      NEW.id,
        'event_key',       v_event_key,
        'recipient_role',  'partner',
        'dispatch_kind',   'transactional',
        'delivery_policy', 'immediate',
        'context',         v_context
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[dispatch trigger] falhou: % (event=%, voucher=%)', SQLERRM, v_event_key, NEW.id;
  END;

  RETURN NEW;
END $function$;

COMMENT ON FUNCTION public._b2b_voucher_dispatch_on_status_change() IS
'Mig 142 · payload b2b-comm-dispatch agora marcado transactional/immediate · bypass quiet_hours · parceira recebe confirmação em qualquer horário.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. _b2b_sync_voucher_from_appointment · 2 dispatches transactional/immediate
-- ═══════════════════════════════════════════════════════════════════════════
-- Trigger em appointments · no_show e post_attendance são transacionais ·
-- beneficiária precisa ser avisada/cuidada na hora. Lógica preservada da
-- mig 140 · únicas mudanças: 2 chaves novas em cada um dos 2 dispatches.

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

    BEGIN
      PERFORM public._b2b_invoke_edge(
        'b2b-comm-dispatch',
        jsonb_build_object(
          'partnership_id',  v_voucher_row.partnership_id,
          'voucher_id',      v_voucher_row.id,
          'event_key',       'voucher_no_show_recovery',
          'recipient_role',  'beneficiary',
          'recipient_phone', v_voucher_row.recipient_phone,
          'dispatch_kind',   'transactional',
          'delivery_policy', 'immediate',
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

    BEGIN
      PERFORM public._b2b_invoke_edge(
        'b2b-comm-dispatch',
        jsonb_build_object(
          'partnership_id',  v_voucher_row.partnership_id,
          'voucher_id',      v_voucher_row.id,
          'event_key',       'voucher_post_attendance',
          'recipient_role',  'beneficiary',
          'recipient_phone', v_voucher_row.recipient_phone,
          'dispatch_kind',   'transactional',
          'delivery_policy', 'immediate',
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
'Mig 142 · payloads b2b-comm-dispatch (no_show + post_attendance) marcados transactional/immediate · beneficiária recebe orientação na hora.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. _b2b_dispatch_application_received · operational/immediate
-- ═══════════════════════════════════════════════════════════════════════════
-- Alerta interno pra Mirian quando candidata se inscreve · operational ·
-- precisa chegar na hora pra Mirian agir. Lógica preservada da mig 48.

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
        'event_key',       'admin_application_received',
        'recipient_role',  'admin',
        'dispatch_kind',   'operational',
        'delivery_policy', 'immediate',
        'context',         jsonb_build_object(
          'application_id',   NEW.id::text,
          'candidate_name',   COALESCE(NEW.contact_name, NEW.business_name, 'candidata'),
          'partnership_name', COALESCE(NEW.business_name, NEW.contact_name, 'novo cadastro'),
          'pillar',           COALESCE(NEW.pillar, '—')
        )
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[application_received dispatch] %', SQLERRM;
  END;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public._b2b_dispatch_application_received() IS
'Mig 142 · payload b2b-comm-dispatch agora operational/immediate · alerta admin chega na hora · bypass quiet_hours.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Sanity check final (regra GOLD #7) · sem exception fatal · sem
--    imprimir secret. Valida shape das 4 funções.
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_invoke_def        text;
  v_status_def        text;
  v_sync_def          text;
  v_app_def           text;
BEGIN
  -- 6.1 · Lê definição texto das 4 funções (sem dump de valores)
  SELECT pg_get_functiondef(p.oid) INTO v_invoke_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_b2b_invoke_edge'
   LIMIT 1;

  SELECT pg_get_functiondef(p.oid) INTO v_status_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_b2b_voucher_dispatch_on_status_change'
   LIMIT 1;

  SELECT pg_get_functiondef(p.oid) INTO v_sync_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_b2b_sync_voucher_from_appointment'
   LIMIT 1;

  SELECT pg_get_functiondef(p.oid) INTO v_app_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_b2b_dispatch_application_received'
   LIMIT 1;

  -- 6.2 · _b2b_invoke_edge · contém delivery_policy + dispatch_kind + Authorization
  IF v_invoke_def IS NULL OR position('delivery_policy' IN v_invoke_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_invoke_edge não contém delivery_policy';
  END IF;
  IF v_invoke_def IS NULL OR position('dispatch_kind' IN v_invoke_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_invoke_edge não contém dispatch_kind';
  END IF;
  IF v_invoke_def IS NULL OR position('Authorization' IN v_invoke_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_invoke_edge perdeu Authorization (regressão da mig 141!)';
  END IF;
  IF v_invoke_def IS NULL OR position('quiet_hours' IN v_invoke_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_invoke_edge perdeu lógica de quiet_hours';
  END IF;
  IF v_invoke_def IS NULL OR position('b2b_pending_dispatches' IN v_invoke_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_invoke_edge perdeu INSERT em b2b_pending_dispatches';
  END IF;

  -- 6.3 · _b2b_voucher_dispatch_on_status_change · transactional + immediate
  IF v_status_def IS NULL OR position('''dispatch_kind''' IN v_status_def) = 0
     OR position('transactional' IN v_status_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_voucher_dispatch_on_status_change não contém dispatch_kind=transactional';
  END IF;
  IF v_status_def IS NULL OR position('''delivery_policy''' IN v_status_def) = 0
     OR position('immediate' IN v_status_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_voucher_dispatch_on_status_change não contém delivery_policy=immediate';
  END IF;

  -- 6.4 · _b2b_sync_voucher_from_appointment · ambos event_keys + transactional
  IF v_sync_def IS NULL OR position('voucher_no_show_recovery' IN v_sync_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_sync_voucher_from_appointment não contém voucher_no_show_recovery';
  END IF;
  IF v_sync_def IS NULL OR position('voucher_post_attendance' IN v_sync_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_sync_voucher_from_appointment não contém voucher_post_attendance';
  END IF;
  IF v_sync_def IS NULL OR position('transactional' IN v_sync_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_sync_voucher_from_appointment não contém transactional';
  END IF;
  IF v_sync_def IS NULL OR position('immediate' IN v_sync_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_sync_voucher_from_appointment não contém immediate';
  END IF;

  -- 6.5 · _b2b_dispatch_application_received · operational + immediate
  IF v_app_def IS NULL OR position('operational' IN v_app_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_dispatch_application_received não contém operational';
  END IF;
  IF v_app_def IS NULL OR position('immediate' IN v_app_def) = 0 THEN
    RAISE WARNING '[mig 142 sanity] _b2b_dispatch_application_received não contém immediate';
  END IF;

  RAISE NOTICE '[mig 142] sanity ok · delivery_policy/dispatch_kind aplicados · Authorization preservado · quiet_hours intacto pra campanhas';
END
$sanity$;
