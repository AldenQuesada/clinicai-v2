-- ============================================================================
-- CRM_PHASE_2R.2 · SMOKE TRANSACIONAL · APPOINTMENT OUTCOMES
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. ZERO envio WhatsApp.
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id     uuid := public._default_clinic_id();
  v_lead_id       uuid;
  v_prof_id       uuid := '06757b9f-2a03-43ae-bd37-28021eb6afeb';
  v_actor_uid     uuid;
  v_jwt           text;
  v_today_sp      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_suffix        text;
  v_baseline      jsonb;

  -- Fixtures
  v_appt_cancel_id   uuid;
  v_appt_noshow_id   uuid;
  v_appt_terminal_id uuid;

  -- Resultados
  v_result_cancel_ok        jsonb;
  v_result_cancel_no_reason jsonb;
  v_result_noshow_ok        jsonb;
  v_result_noshow_terminal  jsonb;
  v_result_zombie_caught    text;

  -- Estado pós
  v_appt_cancel_after  record;
  v_appt_noshow_after  record;
BEGIN
  SELECT id INTO v_actor_uid FROM public.app_users WHERE clinic_id = v_clinic_id LIMIT 1;

  v_jwt := jsonb_build_object(
    'clinic_id', v_clinic_id::text,
    'role', 'authenticated',
    'sub', v_actor_uid::text
  )::text;
  PERFORM set_config('request.jwt.claims', v_jwt, true);

  SELECT id INTO v_lead_id FROM public.leads
   WHERE clinic_id = v_clinic_id AND lifecycle_status='ativo' AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;

  v_suffix := to_char(now(), 'YYMMDDHH24MISSMS');

  SELECT jsonb_build_object(
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'appointments_total', (SELECT count(*) FROM public.appointments)
  ) INTO v_baseline;

  -- ════════════════════════════════════════════════════════════════════
  -- TESTE A · Cancel válido (via appointment_change_status)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2R2 Cancel', '55449'||substring(v_suffix,1,9),
    v_prof_id, 'PROF',
    v_today_sp + 1, '09:00'::time, '09:30'::time,
    'Smoke 2R2', 'agendado', 0, 'pendente'
  ) RETURNING id INTO v_appt_cancel_id;

  SELECT public.appointment_change_status(
    v_appt_cancel_id, 'cancelado', 'Paciente desistiu: smoke 2R2 test'
  ) INTO v_result_cancel_ok;

  SELECT status, motivo_cancelamento, cancelado_em IS NOT NULL AS has_ts
    INTO v_appt_cancel_after
  FROM public.appointments WHERE id = v_appt_cancel_id;

  -- ════════════════════════════════════════════════════════════════════
  -- TESTE B · Cancel SEM motivo · deve falhar (RPC valida reason)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2R2 No Reason', '55448'||substring(v_suffix,1,9),
    v_prof_id, 'PROF',
    v_today_sp + 2, '10:00'::time, '10:30'::time,
    'Smoke 2R2 nr', 'agendado', 0, 'pendente'
  );

  SELECT public.appointment_change_status(
    v_appt_cancel_id, 'cancelado', NULL
  ) INTO v_result_cancel_no_reason;
  -- Nota: appointment já está cancelado · RPC pode retornar idempotent_skip
  -- mas se receber reason NULL deveria falhar invalid_reason

  -- ════════════════════════════════════════════════════════════════════
  -- TESTE C · No-show válido
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2R2 NoShow', '55447'||substring(v_suffix,1,9),
    v_prof_id, 'PROF',
    v_today_sp - 1, '11:00'::time, '11:30'::time,
    'Smoke 2R2 ns', 'confirmado', 0, 'pendente'
  ) RETURNING id INTO v_appt_noshow_id;

  SELECT public.appointment_change_status(
    v_appt_noshow_id, 'no_show', 'Não compareceu (sem aviso): smoke'
  ) INTO v_result_noshow_ok;

  SELECT status, motivo_no_show, no_show_em IS NOT NULL AS has_ts
    INTO v_appt_noshow_after
  FROM public.appointments WHERE id = v_appt_noshow_id;

  -- ════════════════════════════════════════════════════════════════════
  -- TESTE D · No-show em finalizado · transição inválida
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2R2 Final', '55446'||substring(v_suffix,1,9),
    v_prof_id, 'PROF',
    v_today_sp - 2, '12:00'::time, '12:30'::time,
    'Smoke 2R2 final', 'finalizado', 100, 'pago'
  ) RETURNING id INTO v_appt_terminal_id;

  SELECT public.appointment_change_status(
    v_appt_terminal_id, 'no_show', 'Tentativa invalida: smoke'
  ) INTO v_result_noshow_terminal;

  -- ════════════════════════════════════════════════════════════════════
  -- TESTE E · Status zumbi rejected by CHECK
  -- ════════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.appointments
       SET status = 'em_consulta'
     WHERE id = v_appt_cancel_id;
    v_result_zombie_caught := 'NOT_CAUGHT';
  EXCEPTION WHEN OTHERS THEN
    v_result_zombie_caught := 'CAUGHT_' || substring(SQLERRM, 1, 80);
  END;

  -- Force ROLLBACK
  RAISE EXCEPTION 'SMOKE_RESULT_2R2:%', jsonb_build_object(
    'baseline', v_baseline,
    'test_a_cancel_ok', jsonb_build_object(
      'result', v_result_cancel_ok,
      'status_after', v_appt_cancel_after.status,
      'motivo', v_appt_cancel_after.motivo_cancelamento,
      'has_timestamp', v_appt_cancel_after.has_ts
    ),
    'test_b_cancel_no_reason', v_result_cancel_no_reason,
    'test_c_noshow_ok', jsonb_build_object(
      'result', v_result_noshow_ok,
      'status_after', v_appt_noshow_after.status,
      'motivo', v_appt_noshow_after.motivo_no_show,
      'has_timestamp', v_appt_noshow_after.has_ts
    ),
    'test_d_noshow_terminal_rejected', v_result_noshow_terminal,
    'test_e_zombie_caught', v_result_zombie_caught,
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int
  )::text;
END
$BLK$;
