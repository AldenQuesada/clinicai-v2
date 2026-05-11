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
-- Escopo CIRÚRGICO desta migration:
--   1. CREATE OR REPLACE FUNCTION public.appointment_finalize(...) com:
--      - mesma assinatura atual
--      - mantém branches paciente, orcamento, paciente_orcamento
--      - ADICIONA branch perdido que chama lead_lost(lead_id, reason)
--      - appointment só vira 'finalizado' depois de sub-call (ou lead_lost)
--        retornar ok=true
--   2. NOTIFY pgrst, 'reload schema'
--
-- O QUE NÃO ESTÁ NESTA MIG:
--   - Alteração em lead_lost / lead_to_paciente / lead_to_orcamento /
--     appointment_attend / _lead_phase_transition_allowed
--   - Backfill (paciente Alden Teste é arquivamento intencional)
--   - DROP/ALTER TABLE
--   - GRANT/REVOKE (mig 065 já concedeu authenticated/service_role)
--
-- Rollback:
--   - Down: NO-OP defensivo (não restaura função antiga que rejeita perdido).
--   - Rollback real = forward migration nova.
--
-- ⚠️ Antes de apply, comparar este SQL contra
--      SELECT pg_get_functiondef('public.appointment_finalize'::regproc);
--    pra garantir que os branches paciente/orcamento/paciente_orcamento ficam
--    1:1 com o que está no banco real hoje (drift entre mig 065 e prod é
--    conhecido · banco é fonte da verdade).
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
  v_orc_subcall  jsonb;
  v_pac_subcall  jsonb;
  v_lost_call    jsonb;
  v_sub_call     jsonb;
BEGIN
  -- ─────────────────────────────────────────────────────────────────────────
  -- 1. Tenant guard
  -- ─────────────────────────────────────────────────────────────────────────
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 2. Validate outcome (NEW: 'perdido' allowed; 'paciente_orcamento' mantido)
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
  -- 3. Required fields per outcome
  -- ─────────────────────────────────────────────────────────────────────────
  IF p_outcome = 'perdido'
     AND (p_lost_reason IS NULL OR length(trim(p_lost_reason)) = 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lost_reason_required');
  END IF;

  IF p_outcome IN ('orcamento', 'paciente_orcamento')
     AND (p_orcamento_subtotal IS NULL OR p_orcamento_items IS NULL) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'orcamento_items_and_subtotal_required'
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 4. Lock appointment pessimista
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
  -- 5. Idempotência: já finalizado
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_appt.status = 'finalizado' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt.id,
      'idempotent_skip', true,
      'status', v_appt.status
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 6. Status válido para finalizar (na_clinica, em_atendimento)
  --    Bloqueia agendado/confirmado/aguardando/cancelado/no_show/bloqueado
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
  -- 7. Appointment de paciente recorrente (sem lead_id)
  --    Não pode marcar perdido sem lead. Outros outcomes finalizam direto.
  -- ─────────────────────────────────────────────────────────────────────────
  IF v_lead_id IS NULL THEN
    IF p_outcome = 'perdido' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'lost_requires_lead',
        'hint', 'Appointments de paciente recorrente (sem lead_id) não podem ser marcados como perdido por aqui'
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
      'lead_id', NULL,
      'outcome', p_outcome,
      'appointment_finalized', true,
      'note', 'patient_appointment_no_lead_promotion'
    );
  END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- 8. Dispatch per outcome · sub-RPC executada ANTES do UPDATE de finalize
  --    Regra: appointment só vira 'finalizado' se sub-RPC retornar ok=true.
  -- ─────────────────────────────────────────────────────────────────────────
  CASE p_outcome

    ----------------------------------------------------------------------------
    WHEN 'perdido' THEN
      -- Chama lead_lost (escreve lifecycle_status='perdido' · phase preservada
      -- · phase_history registrada pela própria lead_lost).
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

    ----------------------------------------------------------------------------
    WHEN 'paciente' THEN
      v_sub_call := public.lead_to_paciente(
        p_lead_id       := v_lead_id,
        p_total_revenue := COALESCE(p_value, v_appt.value),
        p_first_at      := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
        p_last_at       := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
        p_notes         := p_notes
      );

      IF (v_sub_call->>'ok')::boolean IS NOT TRUE THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'sub_rpc_failed',
          'appointment_finalized', false,
          'sub_call', v_sub_call
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
        'sub_call', v_sub_call
      );

    ----------------------------------------------------------------------------
    WHEN 'orcamento' THEN
      v_sub_call := public.lead_to_orcamento(
        p_lead_id  := v_lead_id,
        p_subtotal := p_orcamento_subtotal,
        p_discount := COALESCE(p_orcamento_discount, 0),
        p_items    := p_orcamento_items,
        p_notes    := p_notes
      );

      IF (v_sub_call->>'ok')::boolean IS NOT TRUE THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'sub_rpc_failed',
          'appointment_finalized', false,
          'sub_call', v_sub_call
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
        'sub_call', v_sub_call
      );

    ----------------------------------------------------------------------------
    WHEN 'paciente_orcamento' THEN
      -- Orçamento primeiro
      v_orc_subcall := public.lead_to_orcamento(
        p_lead_id  := v_lead_id,
        p_subtotal := p_orcamento_subtotal,
        p_discount := COALESCE(p_orcamento_discount, 0),
        p_items    := p_orcamento_items,
        p_notes    := p_notes
      );

      IF (v_orc_subcall->>'ok')::boolean IS NOT TRUE THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'sub_rpc_failed',
          'stage', 'orcamento',
          'appointment_finalized', false,
          'sub_call', v_orc_subcall
        );
      END IF;

      -- Paciente depois
      v_pac_subcall := public.lead_to_paciente(
        p_lead_id       := v_lead_id,
        p_total_revenue := COALESCE(p_value, v_appt.value),
        p_first_at      := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
        p_last_at       := COALESCE(v_appt.chegada_em, v_appt.scheduled_date::timestamptz),
        p_notes         := p_notes
      );

      IF (v_pac_subcall->>'ok')::boolean IS NOT TRUE THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error', 'sub_rpc_failed',
          'stage', 'paciente',
          'appointment_finalized', false,
          'orcamento_call', v_orc_subcall,
          'paciente_call', v_pac_subcall
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
        'outcome', 'paciente_orcamento',
        'appointment_finalized', true,
        'orcamento_call', v_orc_subcall,
        'paciente_call', v_pac_subcall
      );

  END CASE;

  -- Fallback defensivo (não deveria alcançar · CASE cobre todos os outcomes
  -- validados acima)
  RETURN jsonb_build_object(
    'ok', false,
    'error', 'unhandled_outcome',
    'outcome', p_outcome
  );
END $$;

COMMENT ON FUNCTION public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric) IS
  'Finaliza appointment + roteia outcome (paciente|orcamento|paciente_orcamento|perdido). Sub-RPC roda antes do UPDATE de finalize · appointment só vira finalizado se sub-RPC retornar ok=true. Para perdido: chama lead_lost (lifecycle_status, não phase). Atomico por appointment.';

NOTIFY pgrst, 'reload schema';

COMMIT;
