-- ============================================================================
-- CRM_PHASE_2AUX.3 · SMOKE TRANSACIONAL · EDIT APPOINTMENT ROUTE
-- ============================================================================
-- BEGIN implícito · DO block + RAISE EXCEPTION força ROLLBACK + retorna JSON.
-- ZERO efeito persistente. ZERO envio WhatsApp.
--
-- Foco: validar CONTRATO de banco que a rota /editar depende:
--   - SELECT appointment por id ainda funciona em status terminal (para
--     renderizar tela bloqueada com info)
--   - UPDATE direto a campos do appointment terminal NÃO é bloqueado por
--     CHECK constraints (gate de edit é TS action · não DB) · documenta
--     que a defesa principal está em updateAppointmentAction
--   - CHECK constraints continuam rejeitando status zumbi
-- ============================================================================

DO $BLK$
DECLARE
  v_clinic_id     uuid := public._default_clinic_id();
  v_lead_id       uuid;
  v_prof_id       uuid := '06757b9f-2a03-43ae-bd37-28021eb6afeb';
  v_today_sp      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_suffix        text;
  v_baseline      jsonb;

  v_appt_edit_id      uuid;
  v_appt_terminal_id  uuid;

  v_select_ok_terminal  boolean;
  v_zombie_update_caught text;
BEGIN
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
  -- A · Fixture editável (agendado · futuro)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2AUX3 Editable', '55449'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp + 2, '14:00'::time, '14:30'::time,
    'Smoke 2AUX3', 'agendado', 0, 'pendente'
  ) RETURNING id INTO v_appt_edit_id;

  -- ════════════════════════════════════════════════════════════════════
  -- B · Fixture terminal (finalizado · gate de edit fica TS action)
  -- ════════════════════════════════════════════════════════════════════
  INSERT INTO public.appointments (
    clinic_id, lead_id, subject_name, subject_phone,
    professional_id, professional_name,
    scheduled_date, start_time, end_time,
    procedure_name, status, value, payment_status
  ) VALUES (
    v_clinic_id, v_lead_id, 'Smoke 2AUX3 Terminal', '55448'||substring(v_suffix,1,9),
    v_prof_id, 'ALDEN JULIO QUESADA SIFONTES',
    v_today_sp - 1, '10:00'::time, '10:30'::time,
    'Smoke 2AUX3 final', 'finalizado', 100, 'pago'
  ) RETURNING id INTO v_appt_terminal_id;

  -- SELECT terminal funciona (rota /editar SSR consegue ler para mostrar tela bloqueada)
  SELECT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE id = v_appt_terminal_id AND deleted_at IS NULL
  ) INTO v_select_ok_terminal;

  -- ════════════════════════════════════════════════════════════════════
  -- C · Tentar UPDATE direto para status zumbi · CHECK deve rejeitar
  -- ════════════════════════════════════════════════════════════════════
  BEGIN
    UPDATE public.appointments
       SET status = 'em_consulta'
     WHERE id = v_appt_edit_id;
    v_zombie_update_caught := 'NOT_CAUGHT';
  EXCEPTION WHEN OTHERS THEN
    v_zombie_update_caught := 'CAUGHT_' || substring(SQLERRM, 1, 80);
  END;

  -- Force ROLLBACK
  RAISE EXCEPTION 'SMOKE_RESULT_2AUX3:%', jsonb_build_object(
    'baseline', v_baseline,
    'test_a_editable_fixture_id', v_appt_edit_id,
    'test_b_terminal_fixture_id', v_appt_terminal_id,
    'test_b_select_terminal_ok', v_select_ok_terminal,
    'test_c_zombie_update_caught', v_zombie_update_caught,
    'worker71_off_still', (SELECT NOT active FROM cron.job WHERE jobid=71),
    'wa_outbox_delta', (SELECT count(*) FROM public.wa_outbox) - (v_baseline->>'wa_outbox_total')::int,
    'appointments_delta', (SELECT count(*) FROM public.appointments) - (v_baseline->>'appointments_total')::int
  )::text;
END
$BLK$;
