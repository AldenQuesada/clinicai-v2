-- ============================================================================
-- CRM_PHASE_2RC.1 · RECOVERY WORKFLOW DRY-RUN SMOKE (transacional · ROLLBACK)
-- ============================================================================
-- Cobre 13 cenários · todos com role gate via JWT injetado.
-- ROLLBACK forçado por RAISE EXCEPTION P0001 no final.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_clinic_id      uuid;
  v_lead_id        uuid := gen_random_uuid();
  v_perdido_id     uuid;
  v_phone          text := '5511'|| to_char(now(), 'YYMMDDHH24MISSMS');

  v_baseline_outbox integer;
  v_after_outbox    integer;
  v_outbox_delta    integer;

  v_lost_result        jsonb;
  v_create_1           jsonb;
  v_create_2           jsonb;
  v_stage_change       jsonb;
  v_priority_change    jsonb;
  v_next_action        jsonb;
  v_note_ok            jsonb;
  v_note_short         jsonb;
  v_suggestion_lost    text;
  v_suggestion_cancel  text;
  v_suggestion_noshow  text;
  v_suggestion_orc     text;
  v_recovered          jsonb;
  v_recovered_idem     jsonb;
  v_discard_attempt    jsonb;
  v_role_gate_block    jsonb;

  v_workflow_id        uuid;
  v_events_count       integer;
BEGIN
  -- Bootstrap: pega 1 clinic ativa
  SELECT id INTO v_clinic_id FROM public.clinics LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'sanity: nenhuma clinic disponível pra smoke';
  END IF;

  -- JWT como owner
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object(
      'role', 'authenticated',
      'app_role', 'owner',
      'sub', '00000000-0000-0000-0000-000000000001',
      'clinic_id', v_clinic_id::text
    )::text, true);

  v_baseline_outbox := (SELECT count(*) FROM public.wa_outbox);

  -- Cria lead fixture
  INSERT INTO public.leads (id, clinic_id, name, phone, phase, created_at, updated_at)
  VALUES (v_lead_id, v_clinic_id, 'Smoke 2RC1 Workflow', v_phone, 'lead', now(), now());

  v_lost_result := public.lead_lost(v_lead_id, 'Sem resposta · smoke 2RC.1');
  IF NOT (v_lost_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'precond: lead_lost falhou: %', v_lost_result;
  END IF;
  v_perdido_id := v_lead_id;

  -- ── TEST A · create_or_get (cria) ────────────────────────────────────────
  v_create_1 := public.commercial_recovery_workflow_create_or_get(
    'lead_lost', v_perdido_id, v_lead_id, NULL, NULL, 'alta'
  );
  IF NOT (v_create_1->>'ok')::boolean THEN
    RAISE EXCEPTION 'A fail: create_or_get retornou ok=false: %', v_create_1;
  END IF;
  IF (v_create_1->>'existed')::boolean THEN
    RAISE EXCEPTION 'A fail: existed=true em primeira chamada';
  END IF;
  IF v_create_1->>'stage' != 'novo' OR v_create_1->>'priority' != 'alta' THEN
    RAISE EXCEPTION 'A fail: defaults inesperados: %', v_create_1;
  END IF;
  v_workflow_id := (v_create_1->>'id')::uuid;

  -- ── TEST B · create_or_get idempotente ─────────────────────────────────
  v_create_2 := public.commercial_recovery_workflow_create_or_get(
    'lead_lost', v_perdido_id, v_lead_id, NULL, NULL, 'media'
  );
  IF NOT (v_create_2->>'existed')::boolean THEN
    RAISE EXCEPTION 'B fail: existed=false em segunda chamada';
  END IF;
  IF v_create_2->>'id' != v_workflow_id::text THEN
    RAISE EXCEPTION 'B fail: id divergente · expected=% got=%', v_workflow_id, v_create_2->>'id';
  END IF;

  -- ── TEST C · update_stage ──────────────────────────────────────────────
  v_stage_change := public.commercial_recovery_workflow_update_stage(
    v_workflow_id, 'primeira_tentativa', 'Liguei sem retorno'
  );
  IF NOT (v_stage_change->>'ok')::boolean THEN
    RAISE EXCEPTION 'C fail: update_stage: %', v_stage_change;
  END IF;
  IF v_stage_change->>'stage' != 'primeira_tentativa' THEN
    RAISE EXCEPTION 'C fail: stage não persistiu';
  END IF;

  -- ── TEST D · update_priority ───────────────────────────────────────────
  v_priority_change := public.commercial_recovery_workflow_update_priority(v_workflow_id, 'urgente');
  IF NOT (v_priority_change->>'ok')::boolean THEN
    RAISE EXCEPTION 'D fail: update_priority: %', v_priority_change;
  END IF;

  -- ── TEST E · set_next_action ───────────────────────────────────────────
  v_next_action := public.commercial_recovery_workflow_set_next_action(
    v_workflow_id, 'ligar', now() + interval '2 days', NULL
  );
  IF NOT (v_next_action->>'ok')::boolean THEN
    RAISE EXCEPTION 'E fail: set_next_action: %', v_next_action;
  END IF;

  -- ── TEST F · add_note happy path ───────────────────────────────────────
  v_note_ok := public.commercial_recovery_workflow_add_note(v_workflow_id, 'Tentativa #1 sem sucesso');
  IF NOT (v_note_ok->>'ok')::boolean THEN
    RAISE EXCEPTION 'F fail: add_note: %', v_note_ok;
  END IF;

  -- ── TEST G · add_note nota curta rejeitada ─────────────────────────────
  v_note_short := public.commercial_recovery_workflow_add_note(v_workflow_id, 'ok');
  IF (v_note_short->>'ok')::boolean OR v_note_short->>'error' != 'note_too_short' THEN
    RAISE EXCEPTION 'G fail: nota curta não foi rejeitada: %', v_note_short;
  END IF;

  -- ── TEST H · suggest_message para 4 source_types ───────────────────────
  v_suggestion_lost   := public.commercial_recovery_workflow_suggest_message('lead_lost', 'Maria', 'sem resposta');
  v_suggestion_cancel := public.commercial_recovery_workflow_suggest_message('appointment_cancelled', 'João', NULL);
  v_suggestion_noshow := public.commercial_recovery_workflow_suggest_message('appointment_no_show', 'Ana', NULL);
  v_suggestion_orc    := public.commercial_recovery_workflow_suggest_message('orcamento_frio', 'Carlos', NULL);

  IF position('Maria' in v_suggestion_lost) = 0
     OR position('João' in v_suggestion_cancel) = 0
     OR position('Ana' in v_suggestion_noshow) = 0
     OR position('Carlos' in v_suggestion_orc) = 0 THEN
    RAISE EXCEPTION 'H fail: suggestions não interpolaram nome';
  END IF;

  -- ── TEST I · mark_recovered ────────────────────────────────────────────
  v_recovered := public.commercial_recovery_workflow_mark_recovered(v_workflow_id, 'Voltou agendar');
  IF NOT (v_recovered->>'ok')::boolean OR v_recovered->>'status' != 'recuperado' THEN
    RAISE EXCEPTION 'I fail: mark_recovered: %', v_recovered;
  END IF;

  -- ── TEST J · mark_recovered idempotente ────────────────────────────────
  v_recovered_idem := public.commercial_recovery_workflow_mark_recovered(v_workflow_id, 'reentrant');
  IF NOT (v_recovered_idem->>'idempotent_skip')::boolean THEN
    RAISE EXCEPTION 'J fail: mark_recovered não foi idempotent_skip: %', v_recovered_idem;
  END IF;

  -- ── TEST K · discard sobre item já recuperado (transição permitida no SQL) ──
  -- Cria 2º item pra teste de discard
  DECLARE
    v_lead2_id  uuid := gen_random_uuid();
    v_phone2    text := '5511'|| to_char(now() + interval '1 second', 'YYMMDDHH24MISSMS');
    v_perdido2  uuid;
    v_create_3  jsonb;
    v_workflow2 uuid;
  BEGIN
    INSERT INTO public.leads (id, clinic_id, name, phone, phase, created_at, updated_at)
    VALUES (v_lead2_id, v_clinic_id, 'Smoke 2RC1 Discard', v_phone2, 'lead', now(), now());
    PERFORM public.lead_lost(v_lead2_id, 'Faleceu · smoke discard');
    v_perdido2 := v_lead2_id;

    v_create_3 := public.commercial_recovery_workflow_create_or_get(
      'lead_lost', v_perdido2, v_lead2_id, NULL, NULL, 'baixa'
    );
    v_workflow2 := (v_create_3->>'id')::uuid;

    v_discard_attempt := public.commercial_recovery_workflow_discard(v_workflow2, 'Faleceu confirmado');
    IF NOT (v_discard_attempt->>'ok')::boolean OR v_discard_attempt->>'status' != 'descartado' THEN
      RAISE EXCEPTION 'K fail: discard: %', v_discard_attempt;
    END IF;
  END;

  -- ── TEST L · role gate · professional bloqueado ────────────────────────
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object(
      'role', 'authenticated',
      'app_role', 'professional',
      'sub', '00000000-0000-0000-0000-000000000001',
      'clinic_id', v_clinic_id::text
    )::text, true);

  v_role_gate_block := public.commercial_recovery_workflow_update_stage(v_workflow_id, 'arquivado', NULL);
  IF (v_role_gate_block->>'ok')::boolean OR v_role_gate_block->>'error' != 'forbidden_role' THEN
    RAISE EXCEPTION 'L fail: role gate não bloqueou professional: %', v_role_gate_block;
  END IF;

  -- Volta pra owner pra checks finais
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object(
      'role', 'authenticated',
      'app_role', 'owner',
      'sub', '00000000-0000-0000-0000-000000000001',
      'clinic_id', v_clinic_id::text
    )::text, true);

  -- ── TEST M · events audit trail ────────────────────────────────────────
  SELECT count(*) INTO v_events_count
    FROM public.commercial_recovery_events
   WHERE recovery_id = v_workflow_id;
  IF v_events_count < 5 THEN
    RAISE EXCEPTION 'M fail: events trail < 5 eventos · count=%', v_events_count;
  END IF;

  -- ── SAFETY · wa_outbox delta ZERO ──────────────────────────────────────
  v_after_outbox := (SELECT count(*) FROM public.wa_outbox);
  v_outbox_delta := v_after_outbox - v_baseline_outbox;
  IF v_outbox_delta != 0 THEN
    RAISE EXCEPTION 'safety fail: wa_outbox cresceu em %', v_outbox_delta;
  END IF;

  -- ── RAISE com JSON resultado ───────────────────────────────────────────
  RAISE EXCEPTION 'SMOKE_RESULT_2RC1:%', jsonb_build_object(
    'A_create_ok',          v_create_1->>'ok',
    'B_create_idempotent',  v_create_2->>'existed',
    'C_stage_changed',      v_stage_change->>'stage',
    'D_priority_changed',   v_priority_change->>'priority',
    'E_next_action_set',    v_next_action->>'action_type',
    'F_note_ok',            v_note_ok->>'ok',
    'G_note_short_rejected', v_note_short->>'error',
    'H_suggestions', jsonb_build_object(
      'lead_lost_starts_with_oi', position('Oi, Maria' in v_suggestion_lost) > 0,
      'appt_cancel_has_horario',  position('horário' in v_suggestion_cancel) > 0,
      'appt_noshow_has_horario',  position('horário' in v_suggestion_noshow) > 0,
      'orcamento_has_alternativ', position('alternativ' in v_suggestion_orc) > 0
    ),
    'I_recovered_status',   v_recovered->>'status',
    'J_recovered_idempotent', v_recovered_idem->>'idempotent_skip',
    'K_discard_status',     v_discard_attempt->>'status',
    'L_role_gate_blocked',  v_role_gate_block->>'error',
    'M_events_count',       v_events_count,
    'wa_outbox_delta',      v_outbox_delta,
    'baseline_outbox',      v_baseline_outbox,
    'worker71_off_still',   (SELECT NOT active FROM cron.job WHERE jobid=71)
  )::text;
END $$;

COMMIT;
