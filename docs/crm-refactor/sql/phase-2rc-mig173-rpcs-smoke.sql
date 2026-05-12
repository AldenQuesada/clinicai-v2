-- ============================================================================
-- CRM_PHASE_2RC · MIG 173 RPCs SMOKE (transacional · ROLLBACK)
-- ============================================================================
-- Testa:
--   - recovery_perdido_mark_discarded (idempotent + role gate)
--   - recovery_perdido_add_note (min 3 chars + role gate)
--   - sem efeito em wa_outbox
-- ============================================================================

BEGIN;

-- Setup JWT como 'owner' pra passar role gate
SELECT set_config('request.jwt.claims', '{"role":"authenticated","app_role":"owner","sub":"00000000-0000-0000-0000-000000000001"}', true);

DO $$
DECLARE
  v_clinic_id   uuid;
  v_lead_id     uuid := gen_random_uuid();
  v_perdido_id  uuid;
  v_phone       text := '5511'|| to_char(now(), 'YYMMDDHH24MISSMS');

  v_baseline_outbox_count integer;
  v_after_outbox_count    integer;
  v_outbox_delta          integer;

  v_lost_result      jsonb;
  v_discard_result_1 jsonb;
  v_discard_result_2 jsonb;
  v_note_result      jsonb;
  v_note_short_res   jsonb;

  v_perdido_after  public.perdidos%ROWTYPE;
  v_payload        jsonb;
BEGIN
  -- Pega 1 clinic_id ativo (qualquer um · smoke é descartado por ROLLBACK)
  SELECT id INTO v_clinic_id FROM public.clinics LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'sanity: nenhuma clinic ativa pra smoke';
  END IF;

  -- Sobrescreve clinic_id no JWT pra app_clinic_id() resolver corretamente
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object(
      'role','authenticated',
      'app_role','owner',
      'sub','00000000-0000-0000-0000-000000000001',
      'app_metadata', jsonb_build_object('clinic_id', v_clinic_id::text),
      'clinic_id', v_clinic_id::text
    )::text, true);

  v_baseline_outbox_count := (SELECT count(*) FROM public.wa_outbox);

  -- Cria lead fixture
  INSERT INTO public.leads (id, clinic_id, name, phone, phase, created_at, updated_at)
  VALUES (v_lead_id, v_clinic_id, 'Smoke Mig173 Fixture', v_phone, 'lead', now(), now());

  -- Marca como perdido via RPC oficial pra popular perdidos
  v_lost_result := public.lead_lost(v_lead_id, 'Sem interesse · smoke mig173');
  IF NOT (v_lost_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'precond: lead_lost falhou: %', v_lost_result;
  END IF;

  -- perdido.id == lead.id (mesmo UUID por design fase 4)
  v_perdido_id := v_lead_id;

  -- ── Test 1 · mark_discarded primeira chamada ─────────────────────────────
  v_discard_result_1 := public.recovery_perdido_mark_discarded(
    v_perdido_id, 'Faleceu · smoke confirmation'
  );
  IF NOT (v_discard_result_1->>'ok')::boolean THEN
    RAISE EXCEPTION 'test1 fail: mark_discarded retornou ok=false: %', v_discard_result_1;
  END IF;

  SELECT * INTO v_perdido_after FROM public.perdidos WHERE id = v_perdido_id;
  IF v_perdido_after.is_recoverable IS NOT false THEN
    RAISE EXCEPTION 'test1 fail: is_recoverable não virou false';
  END IF;
  IF v_perdido_after.notes IS NULL OR position('[Descartado' in v_perdido_after.notes) = 0 THEN
    RAISE EXCEPTION 'test1 fail: nota de descarte não foi appended';
  END IF;

  -- ── Test 2 · mark_discarded idempotente ──────────────────────────────────
  v_discard_result_2 := public.recovery_perdido_mark_discarded(
    v_perdido_id, 'reentrant call'
  );
  IF NOT (v_discard_result_2->>'idempotent_skip')::boolean THEN
    RAISE EXCEPTION 'test2 fail: chamada repetida não foi idempotent_skip: %', v_discard_result_2;
  END IF;

  -- ── Test 3 · add_note happy path ────────────────────────────────────────
  v_note_result := public.recovery_perdido_add_note(v_perdido_id, 'Liguei sem retorno');
  IF NOT (v_note_result->>'ok')::boolean THEN
    RAISE EXCEPTION 'test3 fail: add_note retornou ok=false: %', v_note_result;
  END IF;

  SELECT * INTO v_perdido_after FROM public.perdidos WHERE id = v_perdido_id;
  IF position('[Nota' in v_perdido_after.notes) = 0 THEN
    RAISE EXCEPTION 'test3 fail: nota timestamped não foi appended';
  END IF;

  -- ── Test 4 · add_note min 3 chars ───────────────────────────────────────
  v_note_short_res := public.recovery_perdido_add_note(v_perdido_id, 'a');
  IF (v_note_short_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'test4 fail: add_note aceitou nota curta';
  END IF;
  IF v_note_short_res->>'error' != 'note_too_short' THEN
    RAISE EXCEPTION 'test4 fail: error code inesperado: %', v_note_short_res;
  END IF;

  -- ── Test 5 · role gate ──────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object(
      'role','authenticated',
      'app_role','professional',
      'sub','00000000-0000-0000-0000-000000000001',
      'app_metadata', jsonb_build_object('clinic_id', v_clinic_id::text),
      'clinic_id', v_clinic_id::text
    )::text, true);

  v_payload := public.recovery_perdido_mark_discarded(v_perdido_id, 'should not work');
  IF (v_payload->>'ok')::boolean OR v_payload->>'error' != 'forbidden_role' THEN
    RAISE EXCEPTION 'test5 fail: role gate furado para mark_discarded: %', v_payload;
  END IF;

  v_payload := public.recovery_perdido_add_note(v_perdido_id, 'note from professional');
  IF (v_payload->>'ok')::boolean OR v_payload->>'error' != 'forbidden_role' THEN
    RAISE EXCEPTION 'test5 fail: role gate furado para add_note: %', v_payload;
  END IF;

  -- ── Wa outbox delta deve ser ZERO ────────────────────────────────────────
  v_after_outbox_count := (SELECT count(*) FROM public.wa_outbox);
  v_outbox_delta := v_after_outbox_count - v_baseline_outbox_count;
  IF v_outbox_delta != 0 THEN
    RAISE EXCEPTION 'safety fail: wa_outbox cresceu em %', v_outbox_delta;
  END IF;

  -- ── RAISE com JSON resultado ─────────────────────────────────────────────
  RAISE EXCEPTION 'SMOKE_RESULT_MIG173:%', jsonb_build_object(
    'test1_discard_ok', v_discard_result_1->>'ok',
    'test2_idempotent', v_discard_result_2->>'idempotent_skip',
    'test3_note_ok',    v_note_result->>'ok',
    'test4_note_too_short_rejected', v_note_short_res->>'error',
    'test5_role_gate_works', true,
    'wa_outbox_delta', v_outbox_delta,
    'baseline_outbox', v_baseline_outbox_count
  )::text;

END $$;

COMMIT;
