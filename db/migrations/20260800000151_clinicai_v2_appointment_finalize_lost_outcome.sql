-- ============================================================================
-- Migration 151 · clinicai-v2 · appointment_finalize aceita outcome='perdido'
-- ============================================================================
--
-- Propósito: corrigir DRIFT entre UI/TS (que oferecem outcome='perdido' no
-- FinalizeWizard) e a RPC public.appointment_finalize, que hoje aceita
-- apenas paciente|orcamento|paciente_orcamento e responde 'invalid_outcome'
-- quando recebe perdido.
--
-- Contrato real do banco (via pg_get_functiondef · fonte da verdade):
--   - Ordem: sub-RPC PRIMEIRO · valida ok=true · só então UPDATE appointment.
--   - Se sub-RPC falhar: appointment NÃO finaliza · retorna erro tipado.
--   - Payload de retorno usa chaves `patient_call`, `budget_call`, `lost_call`
--     (não `sub_call` genérico).
--   - Erros tipados: patient_conversion_failed, budget_creation_failed,
--     patient_conversion_failed_after_budget, lead_lost_failed.
--   - payment_status aceita: pendente | parcial | pago | cortesia | isento.
--
-- Diagnóstico revisado das demais RPCs (banco real · não mig 065):
--   - lead_lost                       · OK · escreve lifecycle_status='perdido'
--                                       (não phase), preenche lost_from_phase,
--                                       lost_reason, lost_at, lost_by,
--                                       espelha public.perdidos.
--   - lead_to_paciente                · OK · aceita agendado/orcamento/paciente,
--                                       não soft-deleta lead.
--   - lead_to_orcamento               · OK · aceita agendado/paciente/orcamento,
--                                       não soft-deleta lead, preserva
--                                       phase='paciente' quando aplicável.
--   - appointment_attend              · OK · não toca leads.phase nem deleted_at.
--   - _lead_phase_transition_allowed  · suficiente · NÃO alterada nesta mig.
--   - appointment_finalize            · ÚNICO ALVO DESTA MIG · falta branch perdido.
--
-- Alteração ADITIVA EXCLUSIVA desta mig:
--   * p_outcome aceita 'perdido' (além dos 3 atuais).
--   * p_lost_reason obrigatório quando outcome='perdido'.
--   * Branch 'perdido' chama public.lead_lost ANTES do UPDATE (mesmo padrão
--     que os outros branches no banco real).
--   * v_lead_id IS NULL + outcome='perdido' → lost_requires_lead.
--
-- ESCOPO QUE NÃO ESTÁ NESTA MIG:
--   - Alteração em lead_lost / lead_to_paciente / lead_to_orcamento /
--     appointment_attend / _lead_phase_transition_allowed
--   - Backfill (paciente Alden Teste é arquivamento intencional)
--   - DROP/ALTER TABLE
--   - GRANT/REVOKE (CREATE OR REPLACE preserva grants existentes)
--
-- Rollback:
--   - Down: NO-OP defensivo (não restaura função antiga que rejeita perdido).
--   - Rollback real = forward migration nova.
--
-- ⚠️ Antes de apply, comparar este SQL contra
--      SELECT pg_get_functiondef('public.appointment_finalize'::regproc);
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.appointment_finalize(
  p_appointment_id     uuid,
  p_outcome            text,
  p_value              numeric     DEFAULT NULL,
  p_payment_status     text        DEFAULT NULL,
  p_notes              text        DEFAULT NULL,
  p_lost_reason        text        DEFAULT NULL,
  p_orcamento_items    jsonb       DEFAULT NULL,
  p_orcamento_subtotal numeric     DEFAULT NULL,
  p_orcamento_discount numeric     DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id    uuid;
  v_appt         public.appointments%ROWTYPE;
  v_lead_id      uuid;
  v_now          timestamptz := now();
  v_patient_call jsonb;
  v_budget_call  jsonb;
  v_lost_call    jsonb;
  v_orc_total    numeric(12,2);
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────
  -- 1. Tenant guard
  -- ─────────────────────────────────────────────────────────────────────────
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 2. Validate outcome (ADICIONA 'perdido' · mantém os 3 existentes)
  -- ─────────────────────────────────────────────────────────────────────────
  IF p_outcome IS NULL
     OR p_outcome NOT IN ('paciente', 'orcamento', 'paciente_orcamento', 'perdido') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_outcome',
      'hint', 'outcome deve ser paciente|orcamento|paciente_orcamento|perdido'
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 3. Validate p_lost_reason (NEW · obrigatório quando perdido)
  -- ─────────────────────────────────────────────────────────────────────────
  IF p_outcome = 'perdido'
     AND (p_lost_reason IS NULL OR length(trim(p_lost_reason)) = 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lost_reason_required');
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 4. Validate p_payment_status (preservado 1:1 do banco real)
  -- ─────────────────────────────────────────────────────────────────────────
  IF p_payment_status IS NOT NULL
     AND p_payment_status NOT IN ('pendente','parcial','pago','cortesia','isento')
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_payment_status',
      'got', p_payment_status
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 5. Validate orcamento payload (preservado 1:1 do banco real)
  -- ─────────────────────────────────────────────────────────────────────────
  IF p_outcome IN ('orcamento','paciente_orcamento') THEN
    IF p_orcamento_subtotal IS NULL OR p_orcamento_subtotal < 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'orcamento_subtotal_required'
      );
    END IF;

    IF p_orcamento_items IS NULL
       OR jsonb_typeof(p_orcamento_items) <> 'array'
    THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'orcamento_items_array_required'
      );
    END IF;

    IF p_orcamento_discount IS NULL OR p_orcamento_discount < 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'invalid_orcamento_discount'
      );
    END IF;
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 6. Lock appointment pessimista (preservado 1:1)
  -- ─────────────────────────────────────────────────────────────────────────
  SELECT * INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 7. Idempotência preservada do banco real: appointment já finalizado
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_appt.status = 'finalizado' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'idempotent_skip', true,
      'status', 'finalizado'
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 8. Status válido para finalizar (preservado 1:1 · na_clinica, em_atendimento)
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_appt.status NOT IN ('na_clinica', 'em_atendimento') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status_for_finalize',
      'current_status', v_appt.status,
      'hint', 'Chame appointment_attend antes (status deve ser na_clinica ou em_atendimento)'
    );
  END IF;

  v_lead_id := v_appt.lead_id;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 8. Appointment de paciente recorrente (sem lead_id) · preservado 1:1
  --    - perdido (NOVO)            → lost_requires_lead
  --    - orcamento/paciente_orc.   → cannot_create_budget_without_lead
  --    - paciente                  → finaliza appt sem promoção
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_lead_id IS NULL THEN
    IF p_outcome = 'perdido' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'lost_requires_lead',
        'hint', 'Appointments de paciente recorrente não podem ser marcados como perdido por aqui'
      );
    END IF;

    IF p_outcome IN ('orcamento', 'paciente_orcamento') THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'cannot_create_budget_without_lead'
      );
    END IF;

    -- outcome='paciente' (paciente recorrente): finaliza appt sem promover lead
    UPDATE public.appointments
       SET status         = 'finalizado',
           value          = COALESCE(p_value, value),
           payment_status = COALESCE(p_payment_status, payment_status),
           obs            = COALESCE(p_notes, obs),
           updated_at     = v_now
     WHERE id = v_appt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'lead_id', NULL,
      'outcome', p_outcome,
      'note', 'patient_appointment_no_lead_promotion'
    );
  END IF;

  -- ═════════════════════════════════════════════════════════════════════════
  -- 9. Roteamento por outcome · sub-RPC PRIMEIRO · UPDATE só se ok=true
  --    (preserva ordem ATUAL do banco real para os 3 branches existentes ·
  --     branch perdido segue o mesmo padrão)
  -- ═════════════════════════════════════════════════════════════════════════

  -- ─────────────────────────────────────────────────────────────────────────
  -- 9.1 BRANCH 'perdido' (NOVO · única adição funcional desta mig)
  --     Regra: chama lead_lost · se falhar appt NÃO finaliza · payload `lost_call`.
  --     NÃO altera leads.phase, leads.deleted_at, patient, orçamento,
  --     phase_history (lead_lost cuida).
  -- ─────────────────────────────────────────────────────────────────────────
  IF p_outcome = 'perdido' THEN
    v_lost_call := public.lead_lost(
      p_lead_id := v_lead_id,
      p_reason  := p_lost_reason
    );

    IF (v_lost_call->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'lead_lost_failed',
        'appointment_finalized', false,
        'lost_call', v_lost_call
      );
    END IF;

    UPDATE public.appointments
       SET status         = 'finalizado',
           value          = COALESCE(p_value, value),
           payment_status = COALESCE(p_payment_status, payment_status),
           obs            = COALESCE(p_notes, obs),
           updated_at     = v_now
     WHERE id = v_appt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'lead_id', v_lead_id,
      'outcome', 'perdido',
      'appointment_finalized', true,
      'lost_call', v_lost_call
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 9.2 BRANCH 'paciente' (preservado 1:1 · payload `patient_call`)
  -- ─────────────────────────────────────────────────────────────────────────
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
        'ok', false,
        'error', 'patient_conversion_failed',
        'appointment_finalized', false,
        'patient_call', v_patient_call
      );
    END IF;

    UPDATE public.appointments
       SET status         = 'finalizado',
           value          = COALESCE(p_value, value),
           payment_status = COALESCE(p_payment_status, payment_status),
           obs            = COALESCE(p_notes, obs),
           updated_at     = v_now
     WHERE id = v_appt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'lead_id', v_lead_id,
      'outcome', 'paciente',
      'appointment_finalized', true,
      'patient_call', v_patient_call
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 9.3 BRANCH 'orcamento' (preservado 1:1 · payload `budget_call`)
  -- ─────────────────────────────────────────────────────────────────────────
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
        'ok', false,
        'error', 'budget_creation_failed',
        'appointment_finalized', false,
        'budget_call', v_budget_call
      );
    END IF;

    UPDATE public.appointments
       SET status         = 'finalizado',
           value          = COALESCE(p_value, value),
           payment_status = COALESCE(p_payment_status, payment_status),
           obs            = COALESCE(p_notes, obs),
           updated_at     = v_now
     WHERE id = v_appt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'lead_id', v_lead_id,
      'outcome', 'orcamento',
      'appointment_finalized', true,
      'budget_call', v_budget_call
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 9.4 BRANCH 'paciente_orcamento' (preservado 1:1)
  --     Sequência: orçamento PRIMEIRO · se falhar, appt NÃO finaliza.
  --                paciente DEPOIS · se falhar (orçamento já criado), appt NÃO
  --                finaliza · erro = patient_conversion_failed_after_budget.
  --     Apt só finaliza se AMBOS sub-RPCs retornarem ok=true.
  -- ─────────────────────────────────────────────────────────────────────────
  IF p_outcome = 'paciente_orcamento' THEN
    -- 9.4.a Orçamento primeiro
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
        'ok', false,
        'error', 'budget_creation_failed',
        'appointment_finalized', false,
        'budget_call', v_budget_call
      );
    END IF;

    -- 9.4.b Paciente depois
    v_patient_call := public.lead_to_paciente(
      p_lead_id       := v_lead_id,
      p_total_revenue := COALESCE(p_value, v_appt.value),
      p_first_at      := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
      p_last_at       := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
      p_notes         := p_notes
    );

    IF (v_patient_call->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'patient_conversion_failed_after_budget',
        'appointment_finalized', false,
        'budget_call', v_budget_call,
        'patient_call', v_patient_call
      );
    END IF;

    -- 9.4.c Ambos OK · finaliza appointment
    UPDATE public.appointments
       SET status         = 'finalizado',
           value          = COALESCE(p_value, value),
           payment_status = COALESCE(p_payment_status, payment_status),
           obs            = COALESCE(p_notes, obs),
           updated_at     = v_now
     WHERE id = v_appt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'lead_id', v_lead_id,
      'outcome', 'paciente_orcamento',
      'appointment_finalized', true,
      'budget_call', v_budget_call,
      'patient_call', v_patient_call
    );
  END IF;

  -- Fallback defensivo (CASE acima cobre todos outcomes validados)
  RETURN jsonb_build_object('ok', false, 'error', 'unhandled_outcome', 'outcome', p_outcome);
END $$;

COMMENT ON FUNCTION public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric) IS
  'Finaliza appointment + roteia outcome (paciente|orcamento|paciente_orcamento|perdido). Sub-RPC PRIMEIRO · appointment só finaliza se sub-RPC ok=true. Payloads: patient_call, budget_call, lost_call. Erros tipados: patient_conversion_failed, budget_creation_failed, patient_conversion_failed_after_budget, lead_lost_failed. Perdido: chama lead_lost (lifecycle_status, não phase).';

NOTIFY pgrst, 'reload schema';

COMMIT;
