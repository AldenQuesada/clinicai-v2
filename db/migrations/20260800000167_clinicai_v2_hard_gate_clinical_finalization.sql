-- ============================================================================
-- Migration 167 · clinicai-v2 · HARD GATE CLINICAL FINALIZATION
-- ============================================================================
--
-- Propósito (CRM_PHASE_2I.1):
--   Transformar o gate clínico de warning-only (2I) em REGRA OPERACIONAL.
--   appointment_finalize agora bloqueia quando gate=warning, exceto se
--   override admin com motivo for explicitamente passado.
--
-- Mudanças:
--   1. Nova tabela `appointment_clinical_gate_overrides` (audit trail)
--   2. DROP + CREATE de `appointment_finalize` com 2 args novos no fim:
--      - p_clinical_override boolean DEFAULT false
--      - p_clinical_override_reason text DEFAULT NULL
--   3. Lógica injetada antes do roteamento por outcome:
--      - chama appointment_clinical_gate_status internamente
--      - se gate=warning AND NOT override: retorna {ok:false, error:'clinical_gate_required', details:...}
--      - se override: valida is_admin() + reason >= 5 chars + registra audit
--
-- Backward compat:
--   - Defaults nos 2 args novos garantem que callers existentes (TS action
--     antes da fase 2I.1) continuam funcionando · gate aplica sem override.
--   - DROP é seguro: zero callers em pg_proc/views/triggers (verificado).
--
-- Estado seguro pós-apply:
--   - Tabela override vazia
--   - Função finalize com gate ativo (warning bloqueia)
--   - Worker 71 segue OFF · ban gate 2L preservado · zero envio real
--
-- Fora de escopo:
--   - sub-RPCs (lead_to_paciente, lead_to_orcamento, lead_lost) · intactas
--   - tabelas clinical (anamnese/consent) · intactas
--   - wa_outbox · zero touch
--   - cron.job · zero touch
--
-- Rollback: down DROP + recriar versão 2J da finalize.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. TABELA appointment_clinical_gate_overrides
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_clinical_gate_overrides (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid        NOT NULL DEFAULT public._default_clinic_id(),
  appointment_id    uuid        NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  actor_id          uuid,
  outcome           text        NOT NULL,
  reason            text        NOT NULL,
  gate_status_prev  text        NOT NULL,
  gate_details      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_clin_override_reason_min CHECK (length(trim(reason)) >= 5),
  CONSTRAINT chk_clin_override_outcome CHECK (
    outcome IN ('paciente','orcamento','paciente_orcamento','perdido')
  ),
  CONSTRAINT chk_clin_override_gate CHECK (
    gate_status_prev IN ('ok','warning')
  )
);

CREATE INDEX IF NOT EXISTS idx_clin_override_clinic_created
  ON public.appointment_clinical_gate_overrides (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clin_override_appt
  ON public.appointment_clinical_gate_overrides (appointment_id);

COMMENT ON TABLE public.appointment_clinical_gate_overrides IS
  'Mig 167 (CRM_PHASE_2I.1) · audit trail de overrides do gate clínico em '
  'appointment_finalize. Cada row = uma finalização que ignorou warning '
  'de anamnese/consent · exige is_admin() + reason mínimo 5 chars.';

-- RLS
ALTER TABLE public.appointment_clinical_gate_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clin_override_select_same_clinic ON public.appointment_clinical_gate_overrides;
CREATE POLICY clin_override_select_same_clinic
  ON public.appointment_clinical_gate_overrides
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

-- INSERT/DELETE somente via RPC SECURITY DEFINER (não há UPDATE de override)
GRANT SELECT ON public.appointment_clinical_gate_overrides TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.appointment_clinical_gate_overrides TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. DROP da appointment_finalize antiga (zero callers internos · safe)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric);


-- ────────────────────────────────────────────────────────────────────────────
-- 3. CREATE appointment_finalize com hard gate clínico
--    (+ 2 args novos no fim · backward compat via DEFAULT)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.appointment_finalize(
  p_appointment_id            uuid,
  p_outcome                   text,
  p_value                     numeric DEFAULT NULL::numeric,
  p_payment_status            text    DEFAULT NULL::text,
  p_notes                     text    DEFAULT NULL::text,
  p_lost_reason               text    DEFAULT NULL::text,
  p_orcamento_items           jsonb   DEFAULT NULL::jsonb,
  p_orcamento_subtotal        numeric DEFAULT NULL::numeric,
  p_orcamento_discount        numeric DEFAULT 0,
  p_clinical_override         boolean DEFAULT false,
  p_clinical_override_reason  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_clinic_id    uuid;
  v_appt         public.appointments%ROWTYPE;
  v_lead_id      uuid;
  v_now          timestamptz := now();
  v_patient_call jsonb;
  v_budget_call  jsonb;
  v_lost_call    jsonb;
  v_orc_total    numeric(12,2);
  -- CRM_PHASE_2I.1 · gate state
  v_gate         jsonb;
  v_gate_status  text;
  v_actor_uid    uuid;
BEGIN
  -- 1. Tenant guard
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  -- 2. Validate outcome
  IF p_outcome IS NULL
     OR p_outcome NOT IN ('paciente', 'orcamento', 'paciente_orcamento', 'perdido') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_outcome',
      'hint', 'outcome deve ser paciente|orcamento|paciente_orcamento|perdido'
    );
  END IF;

  -- 3. Validate p_lost_reason
  IF p_outcome = 'perdido'
     AND (p_lost_reason IS NULL OR length(trim(p_lost_reason)) = 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lost_reason_required');
  END IF;

  -- 4. Validate p_payment_status
  IF p_payment_status IS NOT NULL
     AND p_payment_status NOT IN ('pendente','parcial','pago','cortesia','isento')
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_payment_status',
      'got', p_payment_status
    );
  END IF;

  -- 5. Validate orcamento payload
  IF p_outcome IN ('orcamento','paciente_orcamento') THEN
    IF p_orcamento_subtotal IS NULL OR p_orcamento_subtotal < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'orcamento_subtotal_required');
    END IF;
    IF p_orcamento_items IS NULL OR jsonb_typeof(p_orcamento_items) <> 'array' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'orcamento_items_array_required');
    END IF;
    IF p_orcamento_discount IS NULL OR p_orcamento_discount < 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_orcamento_discount');
    END IF;
  END IF;

  -- 6. Lock appointment pessimista
  SELECT * INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  -- 7. Idempotência: finalizado retorna noop
  IF v_appt.status = 'finalizado' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'idempotent_skip', true,
      'status', 'finalizado'
    );
  END IF;

  -- 8. Status válido para finalizar
  IF v_appt.status NOT IN ('na_clinica', 'em_atendimento') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status_for_finalize',
      'current_status', v_appt.status,
      'hint', 'Chame appointment_attend antes (status deve ser na_clinica ou em_atendimento)'
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════
  -- 9. HARD GATE CLÍNICO (CRM_PHASE_2I.1)
  -- ═══════════════════════════════════════════════════════════════════════
  v_gate := public.appointment_clinical_gate_status(p_appointment_id);
  v_gate_status := COALESCE(v_gate->>'gate_status', 'warning');

  IF v_gate_status = 'warning' THEN
    IF NOT p_clinical_override THEN
      -- Bloqueio · sem override → falha clean
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'clinical_gate_required',
        'gate', v_gate,
        'hint', 'Preencha anamnese e registre consentimento OU finalize com override admin + motivo'
      );
    END IF;

    -- Override solicitado · validações
    IF p_clinical_override_reason IS NULL
       OR length(trim(p_clinical_override_reason)) < 5 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'override_reason_required',
        'hint', 'Motivo do override obrigatório (mínimo 5 caracteres)'
      );
    END IF;

    IF NOT public.is_admin() THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'override_permission_denied',
        'hint', 'Apenas owner/admin pode usar override do gate clínico'
      );
    END IF;

    -- Override válido · registra audit row
    v_actor_uid := auth.uid();
    INSERT INTO public.appointment_clinical_gate_overrides (
      clinic_id, appointment_id, actor_id, outcome, reason,
      gate_status_prev, gate_details
    ) VALUES (
      v_clinic_id, p_appointment_id, v_actor_uid, p_outcome,
      trim(p_clinical_override_reason), v_gate_status,
      COALESCE(v_gate, '{}'::jsonb)
    );
  END IF;

  v_lead_id := v_appt.lead_id;

  -- 10. Appointment de paciente recorrente (sem lead_id)
  IF v_lead_id IS NULL THEN
    IF p_outcome = 'perdido' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'lost_requires_lead');
    END IF;
    IF p_outcome IN ('orcamento', 'paciente_orcamento') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'cannot_create_budget_without_lead');
    END IF;

    UPDATE public.appointments
       SET status = 'finalizado',
           value = COALESCE(p_value, value),
           payment_status = COALESCE(p_payment_status, payment_status),
           obs = COALESCE(p_notes, obs),
           updated_at = v_now
     WHERE id = v_appt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'lead_id', NULL,
      'outcome', p_outcome,
      'note', 'patient_appointment_no_lead_promotion'
    );
  END IF;

  -- 11. Roteamento por outcome
  IF p_outcome = 'perdido' THEN
    v_lost_call := public.lead_lost(p_lead_id := v_lead_id, p_reason := p_lost_reason);
    IF (v_lost_call->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'lead_lost_failed',
        'appointment_finalized', false, 'lost_call', v_lost_call
      );
    END IF;
    UPDATE public.appointments
       SET status='finalizado', value=COALESCE(p_value, value),
           payment_status=COALESCE(p_payment_status, payment_status),
           obs=COALESCE(p_notes, obs), updated_at=v_now
     WHERE id = v_appt.id;
    RETURN jsonb_build_object(
      'ok', true, 'appointment_id', v_appt.id, 'lead_id', v_lead_id,
      'outcome', 'perdido', 'appointment_finalized', true, 'lost_call', v_lost_call
    );
  END IF;

  IF p_outcome = 'paciente' THEN
    v_patient_call := public.lead_to_paciente(
      p_lead_id       := v_lead_id,
      p_total_revenue := COALESCE(p_value, v_appt.value),
      p_first_at      := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
      p_last_at       := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
      p_notes         := p_notes
    );
    IF (v_patient_call->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'patient_conversion_failed',
        'appointment_finalized', false, 'patient_call', v_patient_call
      );
    END IF;
    UPDATE public.appointments
       SET status='finalizado', value=COALESCE(p_value, value),
           payment_status=COALESCE(p_payment_status, payment_status),
           obs=COALESCE(p_notes, obs), updated_at=v_now
     WHERE id = v_appt.id;
    RETURN jsonb_build_object(
      'ok', true, 'appointment_id', v_appt.id, 'lead_id', v_lead_id,
      'outcome', 'paciente', 'appointment_finalized', true, 'patient_call', v_patient_call
    );
  END IF;

  IF p_outcome = 'orcamento' THEN
    v_orc_total := GREATEST(0, p_orcamento_subtotal - COALESCE(p_orcamento_discount, 0));
    v_budget_call := public.lead_to_orcamento(
      p_lead_id  := v_lead_id,
      p_subtotal := p_orcamento_subtotal,
      p_discount := COALESCE(p_orcamento_discount, 0),
      p_items    := p_orcamento_items,
      p_notes    := p_notes
    );
    IF (v_budget_call->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'budget_creation_failed',
        'appointment_finalized', false, 'budget_call', v_budget_call
      );
    END IF;
    UPDATE public.appointments
       SET status='finalizado', value=COALESCE(p_value, value),
           payment_status=COALESCE(p_payment_status, payment_status),
           obs=COALESCE(p_notes, obs), updated_at=v_now
     WHERE id = v_appt.id;
    RETURN jsonb_build_object(
      'ok', true, 'appointment_id', v_appt.id, 'lead_id', v_lead_id,
      'outcome', 'orcamento', 'appointment_finalized', true, 'budget_call', v_budget_call
    );
  END IF;

  IF p_outcome = 'paciente_orcamento' THEN
    v_orc_total := GREATEST(0, p_orcamento_subtotal - COALESCE(p_orcamento_discount, 0));
    v_budget_call := public.lead_to_orcamento(
      p_lead_id  := v_lead_id,
      p_subtotal := p_orcamento_subtotal,
      p_discount := COALESCE(p_orcamento_discount, 0),
      p_items    := p_orcamento_items,
      p_notes    := p_notes
    );
    IF (v_budget_call->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'budget_creation_failed',
        'appointment_finalized', false, 'budget_call', v_budget_call
      );
    END IF;

    v_patient_call := public.lead_to_paciente(
      p_lead_id       := v_lead_id,
      p_total_revenue := COALESCE(p_value, v_appt.value),
      p_first_at      := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
      p_last_at       := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
      p_notes         := p_notes
    );
    IF (v_patient_call->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false, 'error', 'patient_conversion_failed_after_budget',
        'appointment_finalized', false,
        'budget_call', v_budget_call, 'patient_call', v_patient_call
      );
    END IF;

    UPDATE public.appointments
       SET status='finalizado', value=COALESCE(p_value, value),
           payment_status=COALESCE(p_payment_status, payment_status),
           obs=COALESCE(p_notes, obs), updated_at=v_now
     WHERE id = v_appt.id;
    RETURN jsonb_build_object(
      'ok', true, 'appointment_id', v_appt.id, 'lead_id', v_lead_id,
      'outcome', 'paciente_orcamento', 'appointment_finalized', true,
      'budget_call', v_budget_call, 'patient_call', v_patient_call
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'unhandled_outcome', 'outcome', p_outcome);
END $function$;

COMMENT ON FUNCTION public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric, boolean, text) IS
  'Mig 167 (CRM_PHASE_2I.1) · finalização enterprise + hard gate clínico. '
  'Bloqueia se appointment_clinical_gate_status = warning · admin pode '
  'override com motivo (mín 5 chars) que registra audit em '
  'appointment_clinical_gate_overrides.';

GRANT EXECUTE ON FUNCTION public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric, boolean, text)
  TO authenticated, service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO BLOCK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_table_ok    boolean;
  v_fn_ok       boolean;
  v_fn_args     text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='appointment_clinical_gate_overrides') INTO v_table_ok;
  IF NOT v_table_ok THEN RAISE EXCEPTION 'sanity: appointment_clinical_gate_overrides não criada'; END IF;

  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize') INTO v_fn_ok;
  IF NOT v_fn_ok THEN RAISE EXCEPTION 'sanity: appointment_finalize não existe'; END IF;

  SELECT pg_get_function_identity_arguments(p.oid) INTO v_fn_args
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='appointment_finalize';

  IF v_fn_args NOT LIKE '%p_clinical_override%' THEN
    RAISE EXCEPTION 'sanity: appointment_finalize sem p_clinical_override · args=%', v_fn_args;
  END IF;

  RAISE NOTICE 'mig 167 · tabela + fn finalize com hard gate criadas';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
