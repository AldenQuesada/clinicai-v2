-- ============================================================================
-- CRM_PHASE_2K · SMOKE TRANSACIONAL · D_AFTER POST-CONSULTATION
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. Zero envio WhatsApp.
-- PRE-REQUISITO: Mig 162 aplicada (fn _agenda_alert_d_after_tick existe).
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id      uuid := public._default_clinic_id();
  v_lead_id        uuid;
  v_appt_d1_id     uuid;
  v_appt_d3_id     uuid;
  v_appt_d7_id     uuid;
  v_today_sp       date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_fired_1        int;
  v_fired_2        int;
  v_baseline       jsonb;
  v_validation     jsonb;
  v_idempotency    jsonb;
BEGIN
  -- Baseline
  SELECT jsonb_build_object(
    'appointments_total', (SELECT count(*) FROM public.appointments),
    'agenda_alerts_log_total', (SELECT count(*) FROM public.agenda_alerts_log),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'today_sp', v_today_sp,
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71)
  ) INTO v_baseline;

  -- Lead ativo
  SELECT id INTO v_lead_id FROM public.leads
   WHERE clinic_id = v_clinic_id AND lifecycle_status='ativo' AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRE_FAIL_2K: sem lead ativo para fixture';
  END IF;

  -- Fixtures: 3 appointments finalizados em D+1, D+3, D+7 (datas no passado)
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status, consentimento_img
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2K D+1 Post', '5544999422944',
    '06757b9f-2a03-43ae-bd37-28021eb6afeb', 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp - 1, '10:00'::time, '10:30'::time,
    'Smoke 2K Post D1', 'finalizado', 0, 'pago', 'assinado'
  ) RETURNING id INTO v_appt_d1_id;

  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status, consentimento_img
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2K D+3 Post', '5544999422944',
    '06757b9f-2a03-43ae-bd37-28021eb6afeb', 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp - 3, '11:00'::time, '11:30'::time,
    'Smoke 2K Post D3', 'finalizado', 0, 'pago', 'assinado'
  ) RETURNING id INTO v_appt_d3_id;

  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status, consentimento_img
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2K D+7 Post NPS', '5544999422944',
    '06757b9f-2a03-43ae-bd37-28021eb6afeb', 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp - 7, '14:00'::time, '14:30'::time,
    'Smoke 2K Post D7', 'finalizado', 0, 'pago', 'assinado'
  ) RETURNING id INTO v_appt_d7_id;

  -- Tick 1
  SELECT public._agenda_alert_d_after_tick() INTO v_fired_1;

  SELECT jsonb_build_object(
    'fired_1', v_fired_1,
    'log_d1', (SELECT jsonb_agg(to_jsonb(l)) FROM public.agenda_alerts_log l WHERE l.appt_id = v_appt_d1_id::text),
    'log_d3', (SELECT jsonb_agg(to_jsonb(l)) FROM public.agenda_alerts_log l WHERE l.appt_id = v_appt_d3_id::text),
    'log_d7', (SELECT jsonb_agg(to_jsonb(l)) FROM public.agenda_alerts_log l WHERE l.appt_id = v_appt_d7_id::text),
    'outbox_d1', (SELECT jsonb_agg(jsonb_build_object('id', o.id, 'phone', o.phone, 'lead_id', o.lead_id, 'status', o.status, 'rule_id', o.rule_id, 'content_len', length(o.content), 'content_not_empty', (o.content IS NOT NULL AND length(o.content)>0), 'content_preview', substring(o.content from 1 for 80))) FROM public.wa_outbox o WHERE o.appt_ref = v_appt_d1_id::text),
    'outbox_d3', (SELECT jsonb_agg(jsonb_build_object('id', o.id, 'phone', o.phone, 'lead_id', o.lead_id, 'status', o.status, 'rule_id', o.rule_id, 'content_len', length(o.content), 'content_not_empty', (o.content IS NOT NULL AND length(o.content)>0), 'content_preview', substring(o.content from 1 for 80))) FROM public.wa_outbox o WHERE o.appt_ref = v_appt_d3_id::text),
    'outbox_d7', (SELECT jsonb_agg(jsonb_build_object('id', o.id, 'phone', o.phone, 'lead_id', o.lead_id, 'status', o.status, 'rule_id', o.rule_id, 'content_len', length(o.content), 'content_not_empty', (o.content IS NOT NULL AND length(o.content)>0), 'content_preview', substring(o.content from 1 for 80))) FROM public.wa_outbox o WHERE o.appt_ref = v_appt_d7_id::text)
  ) INTO v_validation;

  -- Tick 2 (idempotency)
  SELECT public._agenda_alert_d_after_tick() INTO v_fired_2;

  SELECT jsonb_build_object(
    'fired_2', v_fired_2,
    'log_d1_count_after_2nd', (SELECT count(*) FROM public.agenda_alerts_log WHERE appt_id = v_appt_d1_id::text),
    'log_d3_count_after_2nd', (SELECT count(*) FROM public.agenda_alerts_log WHERE appt_id = v_appt_d3_id::text),
    'log_d7_count_after_2nd', (SELECT count(*) FROM public.agenda_alerts_log WHERE appt_id = v_appt_d7_id::text),
    'outbox_d1_count_after_2nd', (SELECT count(*) FROM public.wa_outbox WHERE appt_ref = v_appt_d1_id::text),
    'outbox_d3_count_after_2nd', (SELECT count(*) FROM public.wa_outbox WHERE appt_ref = v_appt_d3_id::text),
    'outbox_d7_count_after_2nd', (SELECT count(*) FROM public.wa_outbox WHERE appt_ref = v_appt_d7_id::text)
  ) INTO v_idempotency;

  -- Force ROLLBACK
  RAISE EXCEPTION 'SMOKE_RESULT_2K:%', jsonb_build_object(
    'baseline', v_baseline,
    'fixtures', jsonb_build_object('d1', v_appt_d1_id, 'd3', v_appt_d3_id, 'd7', v_appt_d7_id),
    'validation_run_1', v_validation,
    'idempotency_run_2', v_idempotency,
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71)
  )::text;
END
$BLK$;
