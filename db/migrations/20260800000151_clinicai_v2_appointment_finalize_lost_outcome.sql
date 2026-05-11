-- ============================================================================
-- Migration 151 · clinicai-v2 · appointment_finalize aceita outcome='perdido'
-- ============================================================================
--
-- Propósito: corrigir DRIFT entre UI/TS (que oferecem outcome='perdido' no
-- FinalizeWizard) e a RPC public.appointment_finalize, que hoje aceita
-- apenas paciente|orcamento|paciente_orcamento e responde 'invalid_outcome'
-- quando recebe perdido.
--
-- Diagnóstico revisado (banco real via pg_get_functiondef · não da mig 065):
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
-- Contrato preservado 1:1 vs banco real para outcomes existentes:
--   * paciente / orcamento / paciente_orcamento mantêm:
--     - validações originais (payment_status, orcamento_subtotal>=0,
--       orcamento_items jsonb array, orcamento_discount>=0)
--     - lock FOR UPDATE
--     - status válido: na_clinica, em_atendimento
--     - tratamento v_lead_id IS NULL:
--         orcamento|paciente_orcamento → cannot_create_budget_without_lead
--         paciente                     → finaliza appt de paciente recorrente
--     - ordem ATUAL: UPDATE appointment ANTES das sub-RPC (apontado pela
--       revisão · sub-RPC pode falhar mas appt já está finalizado)
--     - chamadas atuais para lead_to_paciente / lead_to_orcamento
--     - regra paciente_orcamento: orçamento primeiro, paciente depois
--
-- Alteração ADITIVA EXCLUSIVA desta mig:
--   * p_outcome aceita 'perdido' (além dos 3 atuais)
--   * p_lost_reason obrigatório quando outcome='perdido'
--   * Branch 'perdido' chama public.lead_lost(v_lead_id, p_lost_reason)
--     ANTES do UPDATE de finalize. Se lead_lost retornar ok != true,
--     appointment NÃO finaliza. Se ok=true, UPDATE status='finalizado'.
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
  v_sub_call     jsonb;
  v_orc_subcall  jsonb;
  v_pac_subcall  jsonb;
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
  -- 4. Validate p_payment_status (preservado 1:1)
  -- ─────────────────────────────────────────────────────────────────────────
  IF p_payment_status IS NOT NULL
     AND p_payment_status NOT IN ('pendente', 'parcial', 'pago', 'isento') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payment_status');
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 5. Validate orcamento payload (preservado 1:1 · só pra outcomes que criam orçamento)
  -- ─────────────────────────────────────────────────────────────────────────
  IF p_outcome IN ('orcamento', 'paciente_orcamento') THEN
    IF p_orcamento_subtotal IS NULL OR p_orcamento_subtotal < 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'invalid_orcamento_subtotal',
        'hint', 'orcamento_subtotal obrigatório e >= 0'
      );
    END IF;
    IF p_orcamento_items IS NULL OR jsonb_typeof(p_orcamento_items) <> 'array' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'invalid_orcamento_items',
        'hint', 'Esperado jsonb array'
      );
    END IF;
    IF p_orcamento_discount IS NOT NULL AND p_orcamento_discount < 0 THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'invalid_orcamento_discount',
        'hint', 'orcamento_discount >= 0'
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
  -- 7. Status válido para finalizar (preservado 1:1 · na_clinica, em_atendimento)
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
  -- 8. Appointment de paciente recorrente (sem lead_id)
  --    Comportamento preservado 1:1 para paciente · novo guard para perdido ·
  --    erro existente para orcamento/paciente_orcamento.
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
  -- 9. BRANCH 'perdido' (NOVO · única adição funcional desta mig)
  --    Regra: sub-RPC ANTES do UPDATE · appointment só finaliza se ok=true.
  --    NÃO altera leads.phase, leads.deleted_at, patient, orçamento,
  --    phase_history (lead_lost cuida).
  -- ═════════════════════════════════════════════════════════════════════════
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

  -- ═════════════════════════════════════════════════════════════════════════
  -- 10. Branches paciente / orcamento / paciente_orcamento (preservado 1:1)
  --     Ordem ATUAL: UPDATE appointment ANTES das sub-RPC · sub-RPC pode
  --     falhar mas appt já está finalizado (terminal). UI trata via
  --     sub_call.ok / appointment_finalized=true.
  -- ═════════════════════════════════════════════════════════════════════════

  -- 10.1 Finaliza appointment
  UPDATE public.appointments
     SET status         = 'finalizado',
         value          = COALESCE(p_value, value),
         payment_status = COALESCE(p_payment_status, payment_status),
         obs            = COALESCE(p_notes, obs),
         updated_at     = v_now
   WHERE id = v_appt.id;

  -- 10.2 Roteamento por outcome → sub-RPC
  CASE p_outcome
    WHEN 'paciente' THEN
      v_sub_call := public.lead_to_paciente(
        p_lead_id       := v_lead_id,
        p_total_revenue := COALESCE(p_value, v_appt.value),
        p_first_at      := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
        p_last_at       := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
        p_notes         := p_notes
      );

    WHEN 'orcamento' THEN
      v_orc_total := GREATEST(0, p_orcamento_subtotal - COALESCE(p_orcamento_discount, 0));
      v_sub_call := public.lead_to_orcamento(
        p_lead_id  := v_lead_id,
        p_subtotal := p_orcamento_subtotal,
        p_discount := COALESCE(p_orcamento_discount, 0),
        p_items    := p_orcamento_items,
        p_notes    := p_notes
      );

    WHEN 'paciente_orcamento' THEN
      -- Orçamento primeiro
      v_orc_total := GREATEST(0, p_orcamento_subtotal - COALESCE(p_orcamento_discount, 0));
      v_orc_subcall := public.lead_to_orcamento(
        p_lead_id  := v_lead_id,
        p_subtotal := p_orcamento_subtotal,
        p_discount := COALESCE(p_orcamento_discount, 0),
        p_items    := p_orcamento_items,
        p_notes    := p_notes
      );
      -- Paciente depois
      v_pac_subcall := public.lead_to_paciente(
        p_lead_id       := v_lead_id,
        p_total_revenue := COALESCE(p_value, v_appt.value),
        p_first_at      := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
        p_last_at       := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
        p_notes         := p_notes
      );
  END CASE;

  -- 10.3 Resposta · paciente_orcamento agrega 2 sub-calls
  IF p_outcome = 'paciente_orcamento' THEN
    IF (v_orc_subcall->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'sub_rpc_failed',
        'stage', 'orcamento',
        'appointment_finalized', true,
        'orcamento_call', v_orc_subcall,
        'paciente_call',  v_pac_subcall
      );
    END IF;
    IF (v_pac_subcall->>'ok')::boolean IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'sub_rpc_failed',
        'stage', 'paciente',
        'appointment_finalized', true,
        'orcamento_call', v_orc_subcall,
        'paciente_call',  v_pac_subcall
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'lead_id', v_lead_id,
      'outcome', 'paciente_orcamento',
      'orcamento_call', v_orc_subcall,
      'paciente_call',  v_pac_subcall
    );
  END IF;

  -- 10.4 Resposta · paciente / orcamento (sub-call único)
  IF v_sub_call IS NOT NULL AND (v_sub_call->>'ok')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'sub_rpc_failed',
      'appointment_finalized', true,
      'sub_call', v_sub_call
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_appt.id,
    'lead_id', v_lead_id,
    'outcome', p_outcome,
    'sub_call', v_sub_call
  );

END $$;

COMMENT ON FUNCTION public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric) IS
  'Finaliza appointment + roteia outcome (paciente|orcamento|paciente_orcamento|perdido). Branches existentes preservados 1:1 (UPDATE antes da sub-RPC). Branch perdido: chama lead_lost ANTES; appt só finaliza se lead_lost ok=true. lead_lost escreve lifecycle_status=perdido (não phase).';

NOTIFY pgrst, 'reload schema';

COMMIT;
