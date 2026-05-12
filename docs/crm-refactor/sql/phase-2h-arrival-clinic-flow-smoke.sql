-- ============================================================================
-- CRM_PHASE_2H · SMOKE TRANSACIONAL · ARRIVAL + START ATTENDANCE
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. Zero envio WhatsApp.
-- PRE-REQUISITO: RPCs appointment_attend + appointment_change_status existem.
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id        uuid := public._default_clinic_id();
  v_lead_id          uuid;
  v_prof_id          uuid := '06757b9f-2a03-43ae-bd37-28021eb6afeb';
  v_today_sp         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_baseline         jsonb;

  -- Fixtures
  v_appt_ok_id       uuid;  -- happy path: agendado → na_clinica → em_atendimento
  v_appt_cancel_id   uuid;  -- cancelado · attend deve falhar
  v_appt_finalize_id uuid;  -- finalizado · attend deve falhar

  -- Resultados
  v_attend_1         jsonb;
  v_attend_2_idempo  jsonb;
  v_start_atend_1    jsonb;
  v_start_atend_2    jsonb;
  v_attend_blocked_cancel    jsonb;
  v_attend_blocked_finalize  jsonb;
  v_alert_count_after_attend int;
  v_status_after_attend      text;
  v_status_after_start       text;
BEGIN
  -- Baseline safety
  SELECT jsonb_build_object(
    'appointments_total', (SELECT count(*) FROM public.appointments),
    'internal_alerts_total', (SELECT count(*) FROM public.appointment_internal_alerts),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'today_sp', v_today_sp,
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'attend_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_attend'),
    'change_status_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_change_status')
  ) INTO v_baseline;

  SELECT id INTO v_lead_id FROM public.leads
   WHERE clinic_id = v_clinic_id AND lifecycle_status='ativo' AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRE_FAIL_2H: sem lead ativo para fixture';
  END IF;

  -- ────────────────────────────────────────────────────────────────────
  -- TESTE A: marcar chegada (happy path)
  -- ────────────────────────────────────────────────────────────────────
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2H Arrival Happy', '5544999422944',
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '14:00'::time, '14:30'::time,
    'Smoke 2H Arrival', 'agendado', 0, 'pendente'
  ) RETURNING id INTO v_appt_ok_id;

  -- Call 1: attend
  SELECT public.appointment_attend(v_appt_ok_id, NULL) INTO v_attend_1;

  -- Status pós-attend
  SELECT status INTO v_status_after_attend
  FROM public.appointments WHERE id = v_appt_ok_id;

  -- Cria alerta interno arrival (best-effort · simula o que o action faz)
  PERFORM public.appointment_arrival_internal_alert(v_appt_ok_id);

  SELECT count(*) INTO v_alert_count_after_attend
  FROM public.appointment_internal_alerts
  WHERE appointment_id = v_appt_ok_id AND alert_kind = 'arrival';

  -- Call 2: attend idempotente
  SELECT public.appointment_attend(v_appt_ok_id, NULL) INTO v_attend_2_idempo;

  -- ────────────────────────────────────────────────────────────────────
  -- TESTE B: iniciar atendimento (na_clinica → em_atendimento)
  -- ────────────────────────────────────────────────────────────────────
  SELECT public.appointment_change_status(v_appt_ok_id, 'em_atendimento', NULL) INTO v_start_atend_1;

  SELECT status INTO v_status_after_start
  FROM public.appointments WHERE id = v_appt_ok_id;

  -- Idempotência: em_atendimento → em_atendimento (state machine permite)
  SELECT public.appointment_change_status(v_appt_ok_id, 'em_atendimento', NULL) INTO v_start_atend_2;

  -- ────────────────────────────────────────────────────────────────────
  -- TESTE C: bloqueios
  -- ────────────────────────────────────────────────────────────────────
  -- Fixture cancelado
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status,
    cancelado_em, motivo_cancelamento
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2H Cancel Block', '5544999422944',
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '15:00'::time, '15:30'::time,
    'Smoke 2H Cancel', 'cancelado', 0, 'pendente',
    now(), 'smoke fixture'
  ) RETURNING id INTO v_appt_cancel_id;

  BEGIN
    SELECT public.appointment_attend(v_appt_cancel_id, NULL) INTO v_attend_blocked_cancel;
  EXCEPTION WHEN OTHERS THEN
    v_attend_blocked_cancel := jsonb_build_object('ok', false, 'error', 'exception_'||SQLERRM);
  END;

  -- Fixture finalizado
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2H Finalize Block', '5544999422944',
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '16:00'::time, '16:30'::time,
    'Smoke 2H Finalize', 'finalizado', 0, 'pago'
  ) RETURNING id INTO v_appt_finalize_id;

  BEGIN
    SELECT public.appointment_attend(v_appt_finalize_id, NULL) INTO v_attend_blocked_finalize;
  EXCEPTION WHEN OTHERS THEN
    v_attend_blocked_finalize := jsonb_build_object('ok', false, 'error', 'exception_'||SQLERRM);
  END;

  -- ────────────────────────────────────────────────────────────────────
  -- Force ROLLBACK
  -- ────────────────────────────────────────────────────────────────────
  RAISE EXCEPTION 'SMOKE_RESULT_2H:%', jsonb_build_object(
    'baseline', v_baseline,
    'fixtures', jsonb_build_object(
      'ok', v_appt_ok_id,
      'cancel', v_appt_cancel_id,
      'finalize', v_appt_finalize_id
    ),
    'test_a_arrival', jsonb_build_object(
      'attend_1', v_attend_1,
      'status_after_attend', v_status_after_attend,
      'alert_count_after_attend', v_alert_count_after_attend,
      'attend_2_idempotent', v_attend_2_idempo
    ),
    'test_b_start_attendance', jsonb_build_object(
      'start_1', v_start_atend_1,
      'status_after_start', v_status_after_start,
      'start_2_idempotent', v_start_atend_2
    ),
    'test_c_blocked', jsonb_build_object(
      'attend_cancel', v_attend_blocked_cancel,
      'attend_finalize', v_attend_blocked_finalize
    ),
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int
  )::text;
END
$BLK$;
