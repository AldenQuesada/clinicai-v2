-- ============================================================================
-- CRM_PHASE_2G.3 · SMOKE TRANSACIONAL · INTERNAL ALERTS COMPLETION
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. Zero envio WhatsApp.
-- PRE-REQUISITO: Mig 163 aplicada (2 tick fns existem).
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id      uuid := public._default_clinic_id();
  v_lead_id        uuid;
  v_prof_id        uuid := '06757b9f-2a03-43ae-bd37-28021eb6afeb';
  v_appt_np_id     uuid;  -- next_patient
  v_appt_ar_phone_id uuid; -- attention_required (no_phone)
  -- nota: apenas o fixture no_phone é insertável. Constraints atuais (chk_appt_subject_xor
  -- e professional_name NOT NULL) impedem fixtures no_subject_link e no_professional.
  -- Essas reasons ficam como defesa no tick fn caso constraints relaxem no futuro.
  v_today_sp       date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_baseline       jsonb;
  v_fired_np_1     int;
  v_fired_np_2     int;
  v_fired_ar_1     int;
  v_fired_ar_2     int;
  v_np_validation  jsonb;
  v_ar_validation  jsonb;
  v_np_idempotency jsonb;
  v_ar_idempotency jsonb;
  v_start_time     time;
BEGIN
  -- Baseline
  SELECT jsonb_build_object(
    'appointments_total', (SELECT count(*) FROM public.appointments),
    'internal_alerts_total', (SELECT count(*) FROM public.appointment_internal_alerts),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'today_sp', v_today_sp,
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'np_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_next_patient_internal_alert_tick'),
    'ar_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='_appointment_attention_required_alert_tick')
  ) INTO v_baseline;

  -- Lead ativo
  SELECT id INTO v_lead_id FROM public.leads
   WHERE clinic_id = v_clinic_id AND lifecycle_status='ativo' AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRE_FAIL_2G3: sem lead ativo para fixture';
  END IF;

  -- ────────────────────────────────────────────────────────────────────
  -- TESTE 1: next_patient
  -- ────────────────────────────────────────────────────────────────────
  -- Calcula start_time relativo a now() em America/Sao_Paulo + 30min
  -- (centro da janela 25-35min, garante hit no tick)
  v_start_time := ((now() AT TIME ZONE 'America/Sao_Paulo') + interval '30 minutes')::time;

  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2G3 Next Patient', '5544999422944',
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    ((now() AT TIME ZONE 'America/Sao_Paulo') + interval '30 minutes')::date,
    v_start_time,
    (v_start_time + interval '30 minutes')::time,
    'Smoke 2G3 NP', 'agendado', 0, 'pendente'
  ) RETURNING id INTO v_appt_np_id;

  -- Tick 1
  SELECT public._appointment_next_patient_internal_alert_tick() INTO v_fired_np_1;

  SELECT jsonb_build_object(
    'fired_1', v_fired_np_1,
    'alerts_for_appt', (
      SELECT jsonb_agg(jsonb_build_object(
        'kind', a.alert_kind,
        'target_role', a.target_role,
        'target_user_id', a.target_user_id,
        'payload_has_subject', (a.payload ? 'subject_name'),
        'payload_has_appointment_id', (a.payload ? 'appointment_id'),
        'payload_has_start_time', (a.payload ? 'start_time')
      ))
      FROM public.appointment_internal_alerts a
      WHERE a.appointment_id = v_appt_np_id
    ),
    'count_secretaria', (SELECT count(*) FROM public.appointment_internal_alerts
                          WHERE appointment_id=v_appt_np_id
                            AND alert_kind='next_patient'
                            AND target_role='secretaria'),
    'count_professional', (SELECT count(*) FROM public.appointment_internal_alerts
                            WHERE appointment_id=v_appt_np_id
                              AND alert_kind='next_patient'
                              AND target_role='professional'
                              AND target_user_id=v_prof_id)
  ) INTO v_np_validation;

  -- Tick 2 (idempotency)
  SELECT public._appointment_next_patient_internal_alert_tick() INTO v_fired_np_2;

  SELECT jsonb_build_object(
    'fired_2', v_fired_np_2,
    'count_secretaria_after_2nd', (SELECT count(*) FROM public.appointment_internal_alerts
                                     WHERE appointment_id=v_appt_np_id
                                       AND alert_kind='next_patient'
                                       AND target_role='secretaria'),
    'count_professional_after_2nd', (SELECT count(*) FROM public.appointment_internal_alerts
                                       WHERE appointment_id=v_appt_np_id
                                         AND alert_kind='next_patient'
                                         AND target_role='professional')
  ) INTO v_np_idempotency;


  -- ────────────────────────────────────────────────────────────────────
  -- TESTE 2: attention_required
  -- ────────────────────────────────────────────────────────────────────
  -- Fixture A: no_phone (sem telefone)
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2G3 AR no_phone', '',
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp + 2, '15:00'::time, '15:30'::time,
    'Smoke 2G3 AR-Phone', 'agendado', 0, 'pendente'
  ) RETURNING id INTO v_appt_ar_phone_id;

  -- Fixture B (REMOVIDO): no_subject_link · chk_appt_subject_xor impede
  --   appointments com lead_id AND patient_id ambos NULL.
  -- Fixture C (REMOVIDO): no_professional · professional_name é NOT NULL no schema.
  -- Ambas reasons permanecem no tick fn como código defensivo.

  -- Tick 1
  SELECT public._appointment_attention_required_alert_tick() INTO v_fired_ar_1;

  SELECT jsonb_build_object(
    'fired_1', v_fired_ar_1,
    'alert_no_phone', (
      SELECT jsonb_build_object(
        'exists', count(*) > 0,
        'reasons', (jsonb_agg(a.payload->'reasons'))->0
      )
      FROM public.appointment_internal_alerts a
      WHERE a.appointment_id = v_appt_ar_phone_id
        AND a.alert_kind = 'attention_required'
    )
  ) INTO v_ar_validation;

  -- Tick 2 (idempotency)
  SELECT public._appointment_attention_required_alert_tick() INTO v_fired_ar_2;

  SELECT jsonb_build_object(
    'fired_2', v_fired_ar_2,
    'count_ar_phone_after_2nd', (SELECT count(*) FROM public.appointment_internal_alerts
                                   WHERE appointment_id=v_appt_ar_phone_id
                                     AND alert_kind='attention_required')
  ) INTO v_ar_idempotency;


  -- Force ROLLBACK
  RAISE EXCEPTION 'SMOKE_RESULT_2G3:%', jsonb_build_object(
    'baseline', v_baseline,
    'fixtures', jsonb_build_object(
      'np', v_appt_np_id,
      'ar_phone', v_appt_ar_phone_id
    ),
    'next_patient', jsonb_build_object(
      'validation_run_1', v_np_validation,
      'idempotency_run_2', v_np_idempotency
    ),
    'attention_required', jsonb_build_object(
      'validation_run_1', v_ar_validation,
      'idempotency_run_2', v_ar_idempotency
    ),
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int
  )::text;
END
$BLK$;
