-- ============================================================================
-- CRM_PHASE_2J.1 · SMOKE TRANSACIONAL · DEDICATED LEAD LOST FLOW
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. ZERO envio WhatsApp.
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id      uuid := public._default_clinic_id();
  v_actor_uid      uuid;
  v_suffix         text;
  v_jwt            text;
  v_baseline       jsonb;

  -- Fixtures
  v_lead_active_id uuid;
  v_lead_paciente_id uuid;  -- já é paciente (lifecycle ativo, phase paciente)
  v_appt_id        uuid;

  -- Resultados
  v_result_a_lost          jsonb;
  v_result_b_no_reason     jsonb;
  v_result_c_already_lost  jsonb;
  v_result_d_paciente_lost jsonb;

  -- Pós-estados
  v_lead_active_after  record;
  v_lead_paciente_after record;
  v_phase_history_rows int;
  v_perdidos_rows      int;
BEGIN
  SELECT id INTO v_actor_uid FROM public.app_users WHERE clinic_id = v_clinic_id LIMIT 1;

  v_jwt := jsonb_build_object(
    'clinic_id', v_clinic_id::text,
    'role', 'authenticated',
    'sub', v_actor_uid::text
  )::text;
  PERFORM set_config('request.jwt.claims', v_jwt, true);

  v_suffix := to_char(now(), 'YYMMDDHH24MISSMS');

  SELECT jsonb_build_object(
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'leads_perdido_phase', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND phase='perdido'),
    'leads_perdido_lifecycle', (SELECT count(*) FROM public.leads WHERE deleted_at IS NULL AND lifecycle_status='perdido'),
    'perdidos_total', (SELECT count(*) FROM public.perdidos)
  ) INTO v_baseline;

  -- Fixture A · lead ativo (lifecycle=ativo, phase=lead)
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2J1 Ativo', '55449'||substring(v_suffix,1,9), 'ativo', 'lead')
  RETURNING id INTO v_lead_active_id;

  -- Fixture B · lead já paciente (lifecycle=ativo, phase=paciente)
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2J1 Paciente', '55448'||substring(v_suffix,1,9), 'ativo', 'paciente')
  RETURNING id INTO v_lead_paciente_id;

  -- Fixture C · appointment vinculado ao lead ativo (em_atendimento)
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_active_id, 'Smoke 2J1 Appt', '55449'||substring(v_suffix,1,9),
    '06757b9f-2a03-43ae-bd37-28021eb6afeb', 'ALDEN JULIO QUESADA SIFONTES',
    (now() AT TIME ZONE 'America/Sao_Paulo')::date,
    '09:00'::time, '09:30'::time,
    'Smoke 2J1', 'agendado', 0, 'pendente'
  ) RETURNING id INTO v_appt_id;

  -- ════════════════════════════════════════════════════════════════════
  -- A · Lead ativo perdido (happy path)
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.lead_lost(v_lead_active_id, 'Sem resposta: smoke 2J1 test') INTO v_result_a_lost;

  SELECT lifecycle_status, phase, lost_reason, lost_from_phase, lost_at IS NOT NULL AS has_lost_at
    INTO v_lead_active_after
  FROM public.leads WHERE id = v_lead_active_id;

  SELECT count(*) INTO v_phase_history_rows
  FROM public.phase_history WHERE lead_id = v_lead_active_id;

  SELECT count(*) INTO v_perdidos_rows
  FROM public.perdidos WHERE lead_id = v_lead_active_id;

  -- ════════════════════════════════════════════════════════════════════
  -- B · Sem motivo · deve falhar reason_required
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2J1 NoReason', '55447'||substring(v_suffix,1,9), 'ativo', 'lead')
  RETURNING id INTO v_lead_active_id;  -- reusa var · fixture isolado

  SELECT public.lead_lost(v_lead_active_id, '') INTO v_result_b_no_reason;

  -- ════════════════════════════════════════════════════════════════════
  -- C · Idempotência · chamar de novo com mesma reason
  -- ════════════════════════════════════════════════════════════════════
  -- Reusa o lead 1 (já perdido)
  -- ... busca o primeiro lead perdido criado em A pra testar idempotência
  PERFORM public.lead_lost(
    (SELECT id FROM public.leads WHERE name='Smoke 2J1 Ativo' AND lifecycle_status='perdido' LIMIT 1),
    'Sem resposta: smoke 2J1 test'
  );
  -- Pega resultado
  SELECT public.lead_lost(
    (SELECT id FROM public.leads WHERE name='Smoke 2J1 Ativo' AND lifecycle_status='perdido' LIMIT 1),
    'Sem resposta: smoke 2J1 test'
  ) INTO v_result_c_already_lost;

  -- ════════════════════════════════════════════════════════════════════
  -- D · Lead já paciente · marcar como perdido (regra: RPC PERMITE,
  --     mas UI bloqueia · documentar comportamento)
  -- ════════════════════════════════════════════════════════════════════
  SELECT public.lead_lost(v_lead_paciente_id, 'Outro motivo: smoke test') INTO v_result_d_paciente_lost;

  SELECT lifecycle_status, phase
    INTO v_lead_paciente_after
  FROM public.leads WHERE id = v_lead_paciente_id;

  -- ════════════════════════════════════════════════════════════════════
  -- Force ROLLBACK
  -- ════════════════════════════════════════════════════════════════════
  RAISE EXCEPTION 'SMOKE_RESULT_2J1:%', jsonb_build_object(
    'baseline', v_baseline,
    'test_a_lead_ativo_lost', jsonb_build_object(
      'result', v_result_a_lost,
      'lifecycle_after', v_lead_active_after.lifecycle_status,
      'phase_after', v_lead_active_after.phase,
      'lost_reason', v_lead_active_after.lost_reason,
      'lost_from_phase', v_lead_active_after.lost_from_phase,
      'has_lost_at', v_lead_active_after.has_lost_at,
      'phase_history_rows', v_phase_history_rows,
      'perdidos_rows', v_perdidos_rows,
      'phase_preserved', v_lead_active_after.phase = 'lead',
      'lifecycle_changed', v_lead_active_after.lifecycle_status = 'perdido',
      'phase_NOT_perdido', v_lead_active_after.phase <> 'perdido'
    ),
    'test_b_no_reason', v_result_b_no_reason,
    'test_c_idempotent', v_result_c_already_lost,
    'test_d_paciente_can_be_lost_at_rpc_level', jsonb_build_object(
      'result', v_result_d_paciente_lost,
      'lifecycle_after', v_lead_paciente_after.lifecycle_status,
      'phase_after_preserved', v_lead_paciente_after.phase
    ),
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int
  )::text;
END
$BLK$;
