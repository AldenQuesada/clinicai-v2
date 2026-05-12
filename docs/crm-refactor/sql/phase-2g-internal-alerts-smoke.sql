-- ============================================================================
-- CRM_PHASE_2G · SMOKE TRANSACIONAL · INTERNAL APPOINTMENT ALERTS
-- ============================================================================
-- Padrão BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. Zero envio WhatsApp.
--
-- PRE-REQUISITO: Mig 161 aplicada (tabela + 4 fns existem).
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id        uuid := public._default_clinic_id();
  v_lead_id          uuid;
  v_appt_d_zero_id   uuid;
  v_appt_d_minus_1_id uuid;
  v_appt_arrival_id  uuid;
  v_today_sp         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_tomorrow_sp      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1;
  v_fired_1          int;
  v_fired_2          int;
  v_arrival_1        jsonb;
  v_arrival_2        jsonb;
  v_baseline         jsonb;
  v_validation_nc    jsonb;
  v_idempotency_nc   jsonb;
  v_validation_arr   jsonb;
  v_idempotency_arr  jsonb;
  v_outbox_check     jsonb;
BEGIN
  -- ── Baseline ─────────────────────────────────────────────────────────────
  SELECT jsonb_build_object(
    'appointments_total', (SELECT count(*) FROM public.appointments),
    'app_alerts_total', (SELECT count(*) FROM public.appointment_internal_alerts),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'today_sp', v_today_sp,
    'tomorrow_sp', v_tomorrow_sp,
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71)
  ) INTO v_baseline;

  -- Lead ativo qualquer (não cria lead novo)
  SELECT id INTO v_lead_id FROM public.leads
   WHERE clinic_id = v_clinic_id AND lifecycle_status='ativo' AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRE_FAIL_2G: sem lead ativo para fixture';
  END IF;

  -- ── Fixtures ─────────────────────────────────────────────────────────────
  -- 1. appt D-zero · aguardando_confirmacao
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status, consentimento_img
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2G D0 NotConfirmed', '5544999422944',
    '06757b9f-2a03-43ae-bd37-28021eb6afeb', 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '15:00'::time, '15:30'::time,
    'Smoke 2G D0', 'aguardando_confirmacao', 0, 'pendente', 'pendente'
  ) RETURNING id INTO v_appt_d_zero_id;

  -- 2. appt D-1 · agendado
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status, consentimento_img
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2G D-1 NotConfirmed', '5544999422944',
    '06757b9f-2a03-43ae-bd37-28021eb6afeb', 'ALDEN JULIO QUESADA SIFONTES',
    v_tomorrow_sp, '10:00'::time, '10:30'::time,
    'Smoke 2G D-1', 'agendado', 0, 'pendente', 'pendente'
  ) RETURNING id INTO v_appt_d_minus_1_id;

  -- 3. appt arrival · na_clinica
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status, consentimento_img,
    chegada_em
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2G Arrival', '5544999422944',
    '06757b9f-2a03-43ae-bd37-28021eb6afeb', 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '16:00'::time, '16:30'::time,
    'Smoke 2G Arrival', 'na_clinica', 0, 'pendente', 'pendente',
    now()
  ) RETURNING id INTO v_appt_arrival_id;

  -- ── A · NOT CONFIRMED tick · 1st run ─────────────────────────────────────
  SELECT public._appointment_not_confirmed_alert_tick() INTO v_fired_1;

  SELECT jsonb_build_object(
    'fired_1', v_fired_1,
    'alert_d_zero', (SELECT to_jsonb(a) FROM public.appointment_internal_alerts a WHERE a.appointment_id = v_appt_d_zero_id AND a.alert_kind='not_confirmed_d_zero'),
    'alert_d_minus_1', (SELECT to_jsonb(a) FROM public.appointment_internal_alerts a WHERE a.appointment_id = v_appt_d_minus_1_id AND a.alert_kind='not_confirmed_d_minus_1'),
    'count_d_zero', (SELECT count(*) FROM public.appointment_internal_alerts WHERE appointment_id = v_appt_d_zero_id AND alert_kind='not_confirmed_d_zero'),
    'count_d_minus_1', (SELECT count(*) FROM public.appointment_internal_alerts WHERE appointment_id = v_appt_d_minus_1_id AND alert_kind='not_confirmed_d_minus_1')
  ) INTO v_validation_nc;

  -- ── A · NOT CONFIRMED tick · 2nd run (idempotency) ───────────────────────
  SELECT public._appointment_not_confirmed_alert_tick() INTO v_fired_2;

  SELECT jsonb_build_object(
    'fired_2', v_fired_2,
    'count_d_zero', (SELECT count(*) FROM public.appointment_internal_alerts WHERE appointment_id = v_appt_d_zero_id AND alert_kind='not_confirmed_d_zero'),
    'count_d_minus_1', (SELECT count(*) FROM public.appointment_internal_alerts WHERE appointment_id = v_appt_d_minus_1_id AND alert_kind='not_confirmed_d_minus_1')
  ) INTO v_idempotency_nc;

  -- ── B · ARRIVAL · 1st call ───────────────────────────────────────────────
  SELECT public.appointment_arrival_internal_alert(v_appt_arrival_id) INTO v_arrival_1;

  SELECT jsonb_build_object(
    'arrival_1', v_arrival_1,
    'count_arrival_professional', (SELECT count(*) FROM public.appointment_internal_alerts WHERE appointment_id=v_appt_arrival_id AND alert_kind='arrival' AND target_role='professional'),
    'count_arrival_secretaria',   (SELECT count(*) FROM public.appointment_internal_alerts WHERE appointment_id=v_appt_arrival_id AND alert_kind='arrival' AND target_role='secretaria'),
    'sample_pro_alert', (SELECT to_jsonb(a) FROM public.appointment_internal_alerts a WHERE a.appointment_id=v_appt_arrival_id AND a.target_role='professional'),
    'sample_sec_alert', (SELECT to_jsonb(a) FROM public.appointment_internal_alerts a WHERE a.appointment_id=v_appt_arrival_id AND a.target_role='secretaria')
  ) INTO v_validation_arr;

  -- ── B · ARRIVAL · 2nd call (idempotency) ─────────────────────────────────
  SELECT public.appointment_arrival_internal_alert(v_appt_arrival_id) INTO v_arrival_2;

  SELECT jsonb_build_object(
    'arrival_2', v_arrival_2,
    'count_arrival_professional', (SELECT count(*) FROM public.appointment_internal_alerts WHERE appointment_id=v_appt_arrival_id AND alert_kind='arrival' AND target_role='professional'),
    'count_arrival_secretaria',   (SELECT count(*) FROM public.appointment_internal_alerts WHERE appointment_id=v_appt_arrival_id AND alert_kind='arrival' AND target_role='secretaria')
  ) INTO v_idempotency_arr;

  -- ── C · ZERO WhatsApp side-effect ────────────────────────────────────────
  SELECT jsonb_build_object(
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int,
    'wa_outbox_new_5min', (SELECT count(*) FROM public.wa_outbox WHERE created_at >= now() - interval '5 minutes'),
    'agenda_alerts_log_new_5min', (SELECT count(*) FROM public.agenda_alerts_log WHERE created_at >= now() - interval '5 minutes'),
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71)
  ) INTO v_outbox_check;

  -- ── Force ROLLBACK ───────────────────────────────────────────────────────
  RAISE EXCEPTION 'SMOKE_RESULT_2G:%', jsonb_build_object(
    'baseline', v_baseline,
    'fixtures', jsonb_build_object(
      'd_zero_id', v_appt_d_zero_id,
      'd_minus_1_id', v_appt_d_minus_1_id,
      'arrival_id', v_appt_arrival_id
    ),
    'not_confirmed_run_1', v_validation_nc,
    'not_confirmed_run_2_idempotent', v_idempotency_nc,
    'arrival_run_1', v_validation_arr,
    'arrival_run_2_idempotent', v_idempotency_arr,
    'side_effects_check', v_outbox_check
  )::text;
END
$BLK$;

-- ROLLBACK implícito via RAISE EXCEPTION. Counters de produção retornam ao baseline.
