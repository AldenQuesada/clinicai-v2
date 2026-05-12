-- ============================================================================
-- CRM_PHASE_2I.1 · SMOKE TRANSACIONAL · HARD GATE CLINICAL FINALIZATION
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. Zero envio WhatsApp.
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id    uuid := public._default_clinic_id();
  v_prof_id      uuid := '06757b9f-2a03-43ae-bd37-28021eb6afeb';
  v_today_sp     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_actor_uid    uuid;
  v_suffix       text;
  v_baseline     jsonb;

  -- Leads + appointments
  v_lead_warn    uuid;
  v_lead_ok      uuid;
  v_lead_over    uuid;
  v_lead_no_reason uuid;
  v_lead_pacorc  uuid;
  v_appt_warn    uuid;
  v_appt_ok      uuid;
  v_appt_over    uuid;
  v_appt_no_reason uuid;
  v_appt_pacorc  uuid;

  -- Resultados
  v_result_a_warn_blocked   jsonb;
  v_result_b_ok_finalize    jsonb;
  v_result_c_override_ok    jsonb;
  v_result_d_override_no_reason jsonb;
  v_result_e_pacorc_ok      jsonb;

  -- Estado pós
  v_appt_warn_status_after  text;
  v_lead_warn_phase_after   text;
  v_override_count          int;
  v_override_row            record;

  v_jwt          text;
BEGIN
  -- Actor real (FK orcamentos.created_by)
  SELECT id INTO v_actor_uid FROM public.app_users
   WHERE clinic_id = v_clinic_id LIMIT 1;
  IF v_actor_uid IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRE_FAIL_2I1: sem app_user';
  END IF;

  -- JWT com clinic_id (tenant guard). is_admin() vem de GUC app.app_role
  -- (read by app_role() · canonical fonte 1).
  v_jwt := jsonb_build_object(
    'clinic_id', v_clinic_id::text,
    'role', 'authenticated',
    'sub', v_actor_uid::text,
    'app_metadata', jsonb_build_object('app_role', 'owner')
  )::text;
  PERFORM set_config('request.jwt.claims', v_jwt, true);
  -- Fallback GUC (fonte 1 de app_role · garante is_admin()=true pro teste C)
  PERFORM set_config('app.app_role', 'owner', true);

  v_suffix := to_char(now(), 'YYMMDDHH24MISSMS');

  SELECT jsonb_build_object(
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'is_admin_check', public.is_admin(),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'overrides_total', (SELECT count(*) FROM public.appointment_clinical_gate_overrides)
  ) INTO v_baseline;

  -- Helper inline: cria lead + appointment em_atendimento
  -- (sem anamnese, sem consent · gate=warning por padrão)
  CREATE TEMP TABLE _smoke_fixtures (kind text, lead_id uuid, appt_id uuid) ON COMMIT DROP;

  -- ════════════════════════════════════════════════════════════════════
  -- A. Gate warning sem override → BLOQUEIO
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2I1 Warn', '55449'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_warn;

  INSERT INTO public.appointments (clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name, scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status)
  VALUES (v_clinic_id, v_lead_warn, 'Smoke 2I1 Warn', '55449'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '09:00'::time, '09:30'::time,
    'Smoke 2I1', 'em_atendimento', 500, 'pendente')
  RETURNING id INTO v_appt_warn;

  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_warn,
    p_outcome := 'paciente',
    p_value := 500,
    p_payment_status := 'pago'
  ) INTO v_result_a_warn_blocked;

  -- Verifica que appt + lead permanecem intactos
  SELECT status INTO v_appt_warn_status_after FROM public.appointments WHERE id=v_appt_warn;
  SELECT phase INTO v_lead_warn_phase_after FROM public.leads WHERE id=v_lead_warn;

  -- ════════════════════════════════════════════════════════════════════
  -- B. Gate OK (anamnese complete + consent signed) → finalize success
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2I1 OK', '55448'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_ok;

  INSERT INTO public.appointments (clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name, scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status)
  VALUES (v_clinic_id, v_lead_ok, 'Smoke 2I1 OK', '55448'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '10:00'::time, '10:30'::time,
    'Smoke 2I1 OK', 'em_atendimento', 600, 'pendente')
  RETURNING id INTO v_appt_ok;

  PERFORM public.appointment_anamnesis_upsert(v_appt_ok, '{"chief_complaint":"smoke"}'::jsonb);
  PERFORM public.appointment_anamnesis_mark_complete(v_appt_ok);
  PERFORM public.appointment_consent_accept(v_appt_ok, 'tcle_estetica', 'v1.0', 'TCLE', 'Smoke Patient OK', '{}'::jsonb);

  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_ok,
    p_outcome := 'paciente',
    p_value := 600,
    p_payment_status := 'pago'
  ) INTO v_result_b_ok_finalize;

  -- ════════════════════════════════════════════════════════════════════
  -- C. Override com motivo válido → finalize success + audit row
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2I1 Over', '55447'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_over;

  INSERT INTO public.appointments (clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name, scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status)
  VALUES (v_clinic_id, v_lead_over, 'Smoke 2I1 Over', '55447'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '11:00'::time, '11:30'::time,
    'Smoke 2I1 Over', 'em_atendimento', 700, 'pendente')
  RETURNING id INTO v_appt_over;

  -- Sem anamnese/consent · gate warning · usa override
  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_over,
    p_outcome := 'paciente',
    p_value := 700,
    p_payment_status := 'pago',
    p_clinical_override := true,
    p_clinical_override_reason := 'Emergência aprovada pela Dra · audit-2I1'
  ) INTO v_result_c_override_ok;

  SELECT count(*) INTO v_override_count
  FROM public.appointment_clinical_gate_overrides
  WHERE appointment_id = v_appt_over;

  SELECT outcome, reason, gate_status_prev, actor_id INTO v_override_row
  FROM public.appointment_clinical_gate_overrides
  WHERE appointment_id = v_appt_over;

  -- ════════════════════════════════════════════════════════════════════
  -- D. Override sem reason → falha override_reason_required
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2I1 NoRe', '55446'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_no_reason;

  INSERT INTO public.appointments (clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name, scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status)
  VALUES (v_clinic_id, v_lead_no_reason, 'Smoke 2I1 NoRe', '55446'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '12:00'::time, '12:30'::time,
    'Smoke 2I1 NoRe', 'em_atendimento', 800, 'pendente')
  RETURNING id INTO v_appt_no_reason;

  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_no_reason,
    p_outcome := 'paciente',
    p_clinical_override := true,
    p_clinical_override_reason := NULL  -- sem motivo
  ) INTO v_result_d_override_no_reason;

  -- ════════════════════════════════════════════════════════════════════
  -- E. paciente_orcamento com gate OK → finalize success (compat 2J)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2I1 PacOrc', '55445'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_pacorc;

  INSERT INTO public.appointments (clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name, scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status)
  VALUES (v_clinic_id, v_lead_pacorc, 'Smoke 2I1 PacOrc', '55445'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '13:00'::time, '13:30'::time,
    'Smoke 2I1 PacOrc', 'em_atendimento', 900, 'pendente')
  RETURNING id INTO v_appt_pacorc;

  PERFORM public.appointment_anamnesis_upsert(v_appt_pacorc, '{"chief_complaint":"pacorc"}'::jsonb);
  PERFORM public.appointment_anamnesis_mark_complete(v_appt_pacorc);
  PERFORM public.appointment_consent_accept(v_appt_pacorc, 'tcle_estetica', 'v1.0', 'TCLE', 'PacOrc Patient', '{}'::jsonb);

  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_pacorc,
    p_outcome := 'paciente_orcamento',
    p_value := 900,
    p_payment_status := 'pago',
    p_orcamento_subtotal := 1500,
    p_orcamento_discount := 0,
    p_orcamento_items := '[{"name":"Pacote","qty":1,"unit_price":1500,"subtotal":1500}]'::jsonb
  ) INTO v_result_e_pacorc_ok;

  -- Force ROLLBACK
  RAISE EXCEPTION 'SMOKE_RESULT_2I1:%', jsonb_build_object(
    'baseline', v_baseline,
    'test_a_warn_blocked', jsonb_build_object(
      'result', v_result_a_warn_blocked,
      'appt_status_after', v_appt_warn_status_after,
      'lead_phase_after', v_lead_warn_phase_after
    ),
    'test_b_gate_ok', v_result_b_ok_finalize,
    'test_c_override', jsonb_build_object(
      'result', v_result_c_override_ok,
      'override_row_count', v_override_count,
      'override_row', row_to_json(v_override_row)
    ),
    'test_d_override_no_reason', v_result_d_override_no_reason,
    'test_e_paciente_orcamento', v_result_e_pacorc_ok,
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int
  )::text;
END
$BLK$;
