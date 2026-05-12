-- ============================================================================
-- CRM_PHASE_2AUX · SMOKE TRANSACIONAL · APPOINTMENT MODAL VALIDATION
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. ZERO envio WhatsApp.
--
-- NOTA: Smoke testa CONTRATOS de BANCO (CHECK constraints + RPC native fns).
-- Validações TS extras (duração 15-240min, data >= hoje, status terminal
-- bloqueia edit) ficam em testes unitários TS + UI · não cobertas aqui.
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id      uuid := public._default_clinic_id();
  v_lead_id        uuid;
  v_prof_id        uuid := '06757b9f-2a03-43ae-bd37-28021eb6afeb';
  v_today_sp       date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_baseline       jsonb;
  v_suffix         text;

  -- Fixtures
  v_appt_ok_id        uuid;
  v_appt_conflict_id  uuid;
  v_appt_finalize_id  uuid;
  v_appt_other_prof_id uuid;
  v_other_prof_id     uuid;

  -- Resultados
  v_invalid_status_caught text;
  v_invalid_subject_caught text;
  v_no_subject_xor_caught text;
BEGIN
  -- Seleciona um segundo profissional (diferente do v_prof_id) se existir
  SELECT id INTO v_other_prof_id
  FROM public.professional_profiles
  WHERE id <> v_prof_id
  LIMIT 1;
  IF v_other_prof_id IS NULL THEN
    v_other_prof_id := v_prof_id; -- fallback · mesmo prof (smoke ainda valida outros casos)
  END IF;

  SELECT id INTO v_lead_id FROM public.leads
   WHERE clinic_id = v_clinic_id AND lifecycle_status='ativo' AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;
  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_PRE_FAIL_2AUX: sem lead ativo';
  END IF;

  v_suffix := to_char(now(), 'YYMMDDHH24MISSMS');

  SELECT jsonb_build_object(
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'appointments_total', (SELECT count(*) FROM public.appointments)
  ) INTO v_baseline;

  -- ════════════════════════════════════════════════════════════════════
  -- A · Criar appointment válido (futuro · subject · status canônico)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2AUX OK', '55449'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp + 1, '09:00'::time, '09:30'::time,
    'Smoke 2AUX', 'agendado', 0, 'pendente'
  ) RETURNING id INTO v_appt_ok_id;

  -- ════════════════════════════════════════════════════════════════════
  -- B · Status inválido (zumbi) · CHECK constraint deve rejeitar
  -- ════════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO public.appointments (
      clinic_id, lead_id, subject_name, subject_phone,
      professional_id, professional_name,
      scheduled_date, start_time, end_time,
      procedure_name, status, value, payment_status
    ) VALUES (
      v_clinic_id, v_lead_id, 'Smoke 2AUX Zombie', '55448'||substring(v_suffix,1,9),
      v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
      v_today_sp + 2, '10:00'::time, '10:30'::time,
      'Smoke 2AUX zombie', 'em_consulta', 0, 'pendente'
    );
    v_invalid_status_caught := 'NOT_CAUGHT';
  EXCEPTION WHEN OTHERS THEN
    v_invalid_status_caught := 'CAUGHT_'||substring(SQLERRM, 1, 80);
  END;

  -- ════════════════════════════════════════════════════════════════════
  -- C · Subject XOR violation (lead_id E patient_id NULL · status agendado)
  -- ════════════════════════════════════════════════════════════════════
  BEGIN
    INSERT INTO public.appointments (
      clinic_id, subject_name, subject_phone,
      professional_id, professional_name,
      scheduled_date, start_time, end_time,
      procedure_name, status, value, payment_status
    ) VALUES (
      v_clinic_id, 'Smoke 2AUX NoSubj', '55447'||substring(v_suffix,1,9),
      v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
      v_today_sp + 3, '11:00'::time, '11:30'::time,
      'Smoke 2AUX nosubj', 'agendado', 0, 'pendente'
    );
    v_no_subject_xor_caught := 'NOT_CAUGHT';
  EXCEPTION WHEN OTHERS THEN
    v_no_subject_xor_caught := 'CAUGHT_'||substring(SQLERRM, 1, 80);
  END;

  -- ════════════════════════════════════════════════════════════════════
  -- D · Block time válido (status='bloqueado' SEM subject)
  -- ════════════════════════════════════════════════════════════════════
  -- Apenas valida que o CHECK aceita esse caso especial
  INSERT INTO public.appointments (
    clinic_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, 'Bloqueado · almoço', NULL,
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp + 4, '12:00'::time, '13:00'::time,
    'almoco', 'bloqueado', 0, 'pendente'
  );

  -- ════════════════════════════════════════════════════════════════════
  -- E · Appointment outro profissional, mesmo horário · NÃO conflito
  -- ════════════════════════════════════════════════════════════════════
  -- Cria appt 1 com v_prof_id
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2AUX Conflict A', '55446'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp + 5, '14:00'::time, '15:00'::time,
    'A', 'agendado', 0, 'pendente'
  ) RETURNING id INTO v_appt_conflict_id;

  -- Se v_other_prof_id != v_prof_id, cria appt 2 mesmo horário, outro prof
  IF v_other_prof_id <> v_prof_id THEN
    INSERT INTO public.appointments (
      clinic_id, lead_id, subject_name, subject_phone,
      professional_id, professional_name,
      scheduled_date, start_time, end_time,
      procedure_name, status, value, payment_status
    ) VALUES (
      v_clinic_id, v_lead_id, 'Smoke 2AUX Other Prof', '55445'||substring(v_suffix,1,9),
      v_other_prof_id, 'OUTRO PROF',
      v_today_sp + 5, '14:00'::time, '15:00'::time,
      'B', 'agendado', 0, 'pendente'
    ) RETURNING id INTO v_appt_other_prof_id;
  END IF;

  -- ════════════════════════════════════════════════════════════════════
  -- F · Status terminal · update permitido a nível DB (gate é TS action)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2AUX Final', '55444'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp - 1, '08:00'::time, '08:30'::time,
    'Final', 'finalizado', 0, 'pago'
  ) RETURNING id INTO v_appt_finalize_id;

  -- Force ROLLBACK
  RAISE EXCEPTION 'SMOKE_RESULT_2AUX:%', jsonb_build_object(
    'baseline', v_baseline,
    'test_a_valid_create_id', v_appt_ok_id,
    'test_b_invalid_status_caught_em_consulta', v_invalid_status_caught,
    'test_c_no_subject_xor_caught', v_no_subject_xor_caught,
    'test_d_block_time_id', v_appt_conflict_id,
    'test_e_other_prof_id', v_appt_other_prof_id,
    'test_e_other_prof_distinct', v_other_prof_id <> v_prof_id,
    'test_f_finalized_fixture_id', v_appt_finalize_id,
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int,
    'appointments_delta', (SELECT count(*) FROM public.appointments) - (v_baseline->>'appointments_total')::int
  )::text;
END
$BLK$;
