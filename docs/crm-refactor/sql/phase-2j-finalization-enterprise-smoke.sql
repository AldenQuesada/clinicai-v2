-- ============================================================================
-- CRM_PHASE_2J · SMOKE TRANSACIONAL · ENTERPRISE FINALIZATION
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. Zero envio WhatsApp.
-- PRE-REQUISITO: appointment_finalize aceita 4 outcomes (paciente, orcamento,
-- paciente_orcamento, perdido). UI oficial expoe 3 (paciente, orcamento,
-- paciente_orcamento). 'perdido' permanece valido no DB para path dedicado.
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id        uuid := public._default_clinic_id();
  v_prof_id          uuid := '06757b9f-2a03-43ae-bd37-28021eb6afeb';
  v_today_sp         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_baseline         jsonb;

  -- Lead fixtures (cada outcome precisa de lead novo para nao colidir
  -- com idempotencia de promocao)
  v_lead_pac_id      uuid;  -- paciente
  v_lead_orc_id      uuid;  -- orcamento
  v_lead_pacorc_id   uuid;  -- paciente_orcamento
  v_lead_lost_id     uuid;  -- perdido (path dedicado)

  -- Appointment fixtures
  v_appt_pac_id      uuid;
  v_appt_orc_id      uuid;
  v_appt_pacorc_id   uuid;
  v_appt_no_em_id    uuid;  -- bloqueio: status agendado (nao em_atendimento)

  -- Resultados RPC
  v_result_pac       jsonb;
  v_result_orc       jsonb;
  v_result_pacorc    jsonb;
  v_result_perdido_invalido jsonb;
  v_result_no_em     jsonb;
  v_result_pac_idem  jsonb;

  -- Snapshots pos
  v_phase_pac        text;
  v_phase_orc        text;
  v_phase_pacorc     text;
  v_lifecycle_pac    text;
  v_lifecycle_orc    text;
  v_orc_count_orc    int;
  v_orc_count_pacorc int;
  v_phase_history_pac    int;
  v_phase_history_pacorc int;

  -- JWT claim para tenant guard
  v_jwt              text;
  v_suffix           text;
  v_actor_uid        uuid;
BEGIN
  -- Pega um app_user real pra honrar FK em orcamentos.created_by (auth.uid())
  SELECT id INTO v_actor_uid FROM public.app_users
   WHERE clinic_id = v_clinic_id LIMIT 1;
  IF v_actor_uid IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRE_FAIL_2J: sem app_user para fixture';
  END IF;

  -- Setar JWT claim pra app_clinic_id() resolver corretamente
  v_jwt := jsonb_build_object(
    'clinic_id', v_clinic_id::text,
    'role', 'authenticated',
    'sub', v_actor_uid::text
  )::text;
  PERFORM set_config('request.jwt.claims', v_jwt, true);

  -- Sufixo unico pra evitar colisao com leads de smokes anteriores
  v_suffix := to_char(now(), 'YYMMDDHH24MISSMS');

  -- Baseline safety
  SELECT jsonb_build_object(
    'appointments_total', (SELECT count(*) FROM public.appointments),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'phase_history_total', (SELECT count(*) FROM public.phase_history),
    'today_sp', v_today_sp,
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'finalize_fn_exists', EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  ) INTO v_baseline;

  -- ────────────────────────────────────────────────────────────────────
  -- Criar 4 leads ativos · 1 por outcome (evita interferencia idempotencia)
  -- ────────────────────────────────────────────────────────────────────
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2J Pac', '55449'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_pac_id;

  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2J Orc', '55448'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_orc_id;

  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2J PacOrc', '55447'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_pacorc_id;

  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2J NoEm', '55446'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_lost_id;

  -- ────────────────────────────────────────────────────────────────────
  -- Criar 4 appointments em_atendimento (status valido pra finalize)
  -- ────────────────────────────────────────────────────────────────────
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_pac_id, 'Smoke 2J Pac', '5544900000001',
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '09:00'::time, '09:30'::time,
    'Smoke 2J Pac proc', 'em_atendimento', 500, 'pago'
  ) RETURNING id INTO v_appt_pac_id;

  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_orc_id, 'Smoke 2J Orc', '5544900000002',
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '10:00'::time, '10:30'::time,
    'Smoke 2J Orc proc', 'em_atendimento', 0, 'pendente'
  ) RETURNING id INTO v_appt_orc_id;

  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_pacorc_id, 'Smoke 2J PacOrc', '5544900000003',
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '11:00'::time, '11:30'::time,
    'Smoke 2J PacOrc proc', 'em_atendimento', 800, 'pago'
  ) RETURNING id INTO v_appt_pacorc_id;

  -- Bloqueio: appointment em status invalido pra finalize
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_lost_id, 'Smoke 2J NoEm', '5544900000005',
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp, '12:00'::time, '12:30'::time,
    'Smoke 2J NoEm proc', 'agendado', 0, 'pendente'
  ) RETURNING id INTO v_appt_no_em_id;

  -- ════════════════════════════════════════════════════════════════════
  -- A. paciente
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_pac_id,
    p_outcome := 'paciente',
    p_value := 500,
    p_payment_status := 'pago',
    p_notes := 'Smoke 2J paciente'
  ) INTO v_result_pac;

  SELECT phase, lifecycle_status INTO v_phase_pac, v_lifecycle_pac
  FROM public.leads WHERE id = v_lead_pac_id;

  SELECT count(*) INTO v_phase_history_pac
  FROM public.phase_history WHERE lead_id = v_lead_pac_id;

  -- Idempotencia: chamar de novo deve retornar idempotent_skip
  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_pac_id,
    p_outcome := 'paciente',
    p_value := 500,
    p_payment_status := 'pago',
    p_notes := 'Smoke 2J paciente idempotente'
  ) INTO v_result_pac_idem;

  -- ════════════════════════════════════════════════════════════════════
  -- B. orcamento
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_orc_id,
    p_outcome := 'orcamento',
    p_orcamento_subtotal := 1200,
    p_orcamento_discount := 100,
    p_orcamento_items := '[{"name":"Botox","qty":1,"unit_price":1200,"subtotal":1200}]'::jsonb,
    p_notes := 'Smoke 2J orcamento'
  ) INTO v_result_orc;

  SELECT phase, lifecycle_status INTO v_phase_orc, v_lifecycle_orc
  FROM public.leads WHERE id = v_lead_orc_id;

  SELECT count(*) INTO v_orc_count_orc
  FROM public.orcamentos WHERE lead_id = v_lead_orc_id AND deleted_at IS NULL;

  -- ════════════════════════════════════════════════════════════════════
  -- C. paciente_orcamento
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_pacorc_id,
    p_outcome := 'paciente_orcamento',
    p_value := 800,
    p_payment_status := 'pago',
    p_orcamento_subtotal := 2500,
    p_orcamento_discount := 0,
    p_orcamento_items := '[{"name":"Tratamento completo","qty":1,"unit_price":2500,"subtotal":2500}]'::jsonb,
    p_notes := 'Smoke 2J paciente_orcamento'
  ) INTO v_result_pacorc;

  SELECT phase INTO v_phase_pacorc
  FROM public.leads WHERE id = v_lead_pacorc_id;

  SELECT count(*) INTO v_orc_count_pacorc
  FROM public.orcamentos WHERE lead_id = v_lead_pacorc_id AND deleted_at IS NULL;

  SELECT count(*) INTO v_phase_history_pacorc
  FROM public.phase_history WHERE lead_id = v_lead_pacorc_id;

  -- ════════════════════════════════════════════════════════════════════
  -- D. perdido com outcome invalido (UI nao oferece · DB aceita mas precisa lost_reason)
  --    Aqui testamos passar perdido SEM lost_reason · deve falhar com lost_reason_required
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_no_em_id,
    p_outcome := 'perdido',
    p_lost_reason := NULL
  ) INTO v_result_perdido_invalido;

  -- ════════════════════════════════════════════════════════════════════
  -- E. bloqueio: status invalido (agendado · nao na_clinica nem em_atendimento)
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.appointment_finalize(
    p_appointment_id := v_appt_no_em_id,
    p_outcome := 'paciente',
    p_value := 0,
    p_payment_status := 'pendente'
  ) INTO v_result_no_em;

  -- ════════════════════════════════════════════════════════════════════
  -- Force ROLLBACK
  -- ════════════════════════════════════════════════════════════════════
  RAISE EXCEPTION 'SMOKE_RESULT_2J:%', jsonb_build_object(
    'baseline', v_baseline,
    'fixtures', jsonb_build_object(
      'lead_pac', v_lead_pac_id,
      'lead_orc', v_lead_orc_id,
      'lead_pacorc', v_lead_pacorc_id,
      'lead_lost', v_lead_lost_id
    ),
    'test_a_paciente', jsonb_build_object(
      'result', v_result_pac,
      'phase_after', v_phase_pac,
      'lifecycle_after', v_lifecycle_pac,
      'phase_history_rows', v_phase_history_pac,
      'idempotent_result', v_result_pac_idem
    ),
    'test_b_orcamento', jsonb_build_object(
      'result', v_result_orc,
      'phase_after', v_phase_orc,
      'lifecycle_after', v_lifecycle_orc,
      'orcamento_rows', v_orc_count_orc
    ),
    'test_c_paciente_orcamento', jsonb_build_object(
      'result', v_result_pacorc,
      'phase_after', v_phase_pacorc,
      'orcamento_rows', v_orc_count_pacorc,
      'phase_history_rows', v_phase_history_pacorc
    ),
    'test_d_perdido_sem_motivo', v_result_perdido_invalido,
    'test_e_status_invalido', v_result_no_em,
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int
  )::text;
END
$BLK$;
