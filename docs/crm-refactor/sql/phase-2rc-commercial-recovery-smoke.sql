-- ============================================================================
-- CRM_PHASE_2RC · SMOKE TRANSACIONAL · COMMERCIAL RECOVERY FOUNDATION
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. ZERO envio WhatsApp.
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id      uuid := public._default_clinic_id();
  v_actor_uid      uuid;
  v_jwt            text;
  v_today_sp       date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_suffix         text;
  v_baseline       jsonb;

  -- Fixtures
  v_lead_lost_id   uuid;
  v_lead_cancel_id uuid;
  v_lead_noshow_id uuid;
  v_appt_cancel_id uuid;
  v_appt_noshow_id uuid;

  -- Verificação queue view
  v_perdidos_in_view int;
  v_cancel_in_view   int;
  v_noshow_in_view   int;
  v_view_sample      jsonb;

  -- Recovery via RPC
  v_recovery_result  jsonb;
  v_lead_after       record;
  v_perdido_after    record;
BEGIN
  SELECT id INTO v_actor_uid FROM public.app_users WHERE clinic_id = v_clinic_id LIMIT 1;

  v_jwt := jsonb_build_object(
    'clinic_id', v_clinic_id::text,
    'role', 'authenticated',
    'sub', v_actor_uid::text
  )::text;
  PERFORM set_config('request.jwt.claims', v_jwt, true);
  PERFORM set_config('app.app_role', 'owner', true);

  v_suffix := to_char(now(), 'YYMMDDHH24MISSMS');

  SELECT jsonb_build_object(
    'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_total', (SELECT count(*) FROM public.wa_outbox),
    'perdidos_total', (SELECT count(*) FROM public.perdidos WHERE deleted_at IS NULL),
    'view_total', (SELECT count(*) FROM public.commercial_recovery_queue_view)
  ) INTO v_baseline;

  -- ════════════════════════════════════════════════════════════════════
  -- TESTE A · Lead perdido aparece na view com status=aberto
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2RC Lost', '55449'||substring(v_suffix,1,9), 'ativo', 'lead')
  RETURNING id INTO v_lead_lost_id;

  PERFORM public.lead_lost(v_lead_lost_id, 'Sem resposta: smoke 2RC test');

  SELECT count(*) INTO v_perdidos_in_view
  FROM public.commercial_recovery_queue_view
  WHERE source_type='lead_lost' AND lead_id = v_lead_lost_id AND status='aberto';

  -- ════════════════════════════════════════════════════════════════════
  -- TESTE B · Appointment cancelado entra na view
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2RC Cancel', '55448'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_cancel_id;

  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status,
    cancelado_em, motivo_cancelamento
  ) VALUES (
    v_clinic_id, v_lead_cancel_id, 'Smoke 2RC Cancel',
    '55448'||substring(v_suffix,1,9),
    '06757b9f-2a03-43ae-bd37-28021eb6afeb', 'PROF',
    v_today_sp + 3, '10:00'::time, '10:30'::time,
    'Smoke 2RC', 'cancelado', 0, 'pendente',
    now(), 'Paciente desistiu: smoke'
  ) RETURNING id INTO v_appt_cancel_id;

  SELECT count(*) INTO v_cancel_in_view
  FROM public.commercial_recovery_queue_view
  WHERE source_type='appointment_cancelled' AND appointment_id = v_appt_cancel_id;

  -- ════════════════════════════════════════════════════════════════════
  -- TESTE C · Appointment no_show entra na view
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.leads (clinic_id, name, phone, lifecycle_status, phase)
  VALUES (v_clinic_id, 'Smoke 2RC NoShow', '55447'||substring(v_suffix,1,9), 'ativo', 'agendado')
  RETURNING id INTO v_lead_noshow_id;

  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status,
    no_show_em, motivo_no_show
  ) VALUES (
    v_clinic_id, v_lead_noshow_id, 'Smoke 2RC NoShow',
    '55447'||substring(v_suffix,1,9),
    '06757b9f-2a03-43ae-bd37-28021eb6afeb', 'PROF',
    v_today_sp - 1, '11:00'::time, '11:30'::time,
    'Smoke 2RC ns', 'no_show', 0, 'pendente',
    now(), 'Não compareceu (sem aviso): smoke'
  ) RETURNING id INTO v_appt_noshow_id;

  SELECT count(*) INTO v_noshow_in_view
  FROM public.commercial_recovery_queue_view
  WHERE source_type='appointment_no_show' AND appointment_id = v_appt_noshow_id;

  -- ════════════════════════════════════════════════════════════════════
  -- TESTE D · Sample da view (verificar shape + masking)
  -- ════════════════════════════════════════════════════════════════════
  SELECT jsonb_agg(jsonb_build_object(
    'source_type', source_type,
    'display_name', display_name,
    'phone_last4', phone_last4,
    'priority', priority,
    'status', status,
    'reason_truncated', substring(COALESCE(reason, ''), 1, 50)
  )) INTO v_view_sample
  FROM public.commercial_recovery_queue_view
  WHERE clinic_id = v_clinic_id
    AND display_name LIKE 'Smoke 2RC%';

  -- ════════════════════════════════════════════════════════════════════
  -- TESTE E · Reativar lead perdido via lead_recover (wraps perdido_to_lead)
  -- ════════════════════════════════════════════════════════════════════
  -- Args: p_lead_id · p_to_phase ∈ {lead, agendado, orcamento} · p_reason.
  -- Role gate: owner/admin/receptionist (smoke setou app_role='owner').
  SELECT public.lead_recover(
    v_lead_lost_id,
    'lead',
    'Smoke 2RC · reativar para campanha follow-up'
  ) INTO v_recovery_result;

  SELECT lifecycle_status, phase INTO v_lead_after
  FROM public.leads WHERE id = v_lead_lost_id;

  SELECT recovered_at IS NOT NULL AS recovered, recovered_to_phase, is_recoverable
    INTO v_perdido_after
  FROM public.perdidos WHERE lead_id = v_lead_lost_id;

  -- Force ROLLBACK
  RAISE EXCEPTION 'SMOKE_RESULT_2RC:%', jsonb_build_object(
    'baseline', v_baseline,
    'fixtures', jsonb_build_object(
      'lead_lost', v_lead_lost_id,
      'appt_cancel', v_appt_cancel_id,
      'appt_noshow', v_appt_noshow_id
    ),
    'test_a_lost_in_view_count', v_perdidos_in_view,
    'test_b_cancel_in_view_count', v_cancel_in_view,
    'test_c_noshow_in_view_count', v_noshow_in_view,
    'test_d_view_sample', v_view_sample,
    'test_e_reactivate', jsonb_build_object(
      'result', v_recovery_result,
      'lead_lifecycle_after', v_lead_after.lifecycle_status,
      'lead_phase_after', v_lead_after.phase,
      'phase_NOT_perdido', v_lead_after.phase <> 'perdido',
      'perdido_recovered', v_perdido_after.recovered,
      'perdido_recovered_to_phase', v_perdido_after.recovered_to_phase,
      'perdido_still_recoverable', v_perdido_after.is_recoverable
    ),
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int
  )::text;
END
$BLK$;
