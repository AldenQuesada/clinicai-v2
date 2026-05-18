-- =============================================================================
-- Rollback · CRM_PARITY_R1_PHASE_F_HOTFIX · Migration 192
-- =============================================================================
--
-- ⚠️ DO NOT USE FOR PRODUCTION unless rolling back migration 192 intentionally.
--
-- Este down restaura a função `lead_to_paciente` ao estado pós-mig-191 (com
-- soft-delete reintroduzido). Reverte o canon Phase 1C operacional: leads
-- promovidos a paciente ficariam invisíveis em `crm_operational_view`
-- (que filtra deleted_at IS NULL), quebrando a UX da Mesa Operacional e
-- breaking apps/lara/e2e/authed/appointment-attend-finalize.spec.ts:208.
--
-- Só use se a aplicação de mig 192 introduzir uma regressão diferente
-- catalogada · em ambiente staging/branch · NUNCA em prod ativa sem GO
-- explícito.

BEGIN;

CREATE OR REPLACE FUNCTION public.lead_to_paciente(
  p_lead_id        uuid,
  p_total_revenue  numeric      DEFAULT NULL,
  p_first_at       timestamptz  DEFAULT NULL,
  p_last_at        timestamptz  DEFAULT NULL,
  p_notes          text         DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id  uuid;
  v_lead       public.leads%ROWTYPE;
  v_already    boolean := false;
  v_appt_count int;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  SELECT * INTO v_lead
    FROM public.leads
   WHERE id = p_lead_id
     AND clinic_id = v_clinic_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_not_found');
  END IF;

  IF EXISTS (SELECT 1 FROM public.patients WHERE id = p_lead_id AND clinic_id = v_clinic_id) THEN
    v_already := true;
  END IF;

  IF NOT v_already THEN
    IF v_lead.phase NOT IN ('lead', 'agendado') THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'illegal_transition',
        'from_phase', v_lead.phase,
        'hint', 'lead_to_paciente exige phase IN (lead, agendado) · canon Phase 1C'
      );
    END IF;
    IF v_lead.lifecycle_status IS DISTINCT FROM 'ativo' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'lifecycle_locked',
        'lifecycle_status', v_lead.lifecycle_status,
        'hint', 'lead_to_paciente exige lifecycle_status=ativo'
      );
    END IF;

    INSERT INTO public.patients (
      id, clinic_id, name, phone, email,
      cpf, rg, birth_date,
      assigned_to, status, notes,
      total_procedures, total_revenue,
      first_procedure_at, last_procedure_at,
      source_lead_phase_at, source_lead_meta
    ) VALUES (
      v_lead.id, v_clinic_id,
      v_lead.name, v_lead.phone, v_lead.email,
      v_lead.cpf, v_lead.rg, v_lead.birth_date,
      v_lead.assigned_to, 'active', p_notes,
      0, COALESCE(p_total_revenue, 0),
      p_first_at, p_last_at,
      v_lead.phase_updated_at,
      jsonb_build_object(
        'source', v_lead.source,
        'source_type', v_lead.source_type,
        'funnel', v_lead.funnel,
        'temperature', v_lead.temperature,
        'metadata', v_lead.metadata
      )
    );
  ELSE
    UPDATE public.patients
       SET total_revenue      = COALESCE(p_total_revenue, total_revenue),
           first_procedure_at = COALESCE(first_procedure_at, p_first_at),
           last_procedure_at  = GREATEST(last_procedure_at, p_last_at),
           notes              = COALESCE(p_notes, notes),
           updated_at         = now()
     WHERE id = p_lead_id;
  END IF;

  UPDATE public.appointments
     SET lead_id    = NULL,
         patient_id = p_lead_id,
         updated_at = now()
   WHERE clinic_id = v_clinic_id
     AND lead_id   = p_lead_id;
  GET DIAGNOSTICS v_appt_count = ROW_COUNT;

  UPDATE public.orcamentos
     SET lead_id    = NULL,
         patient_id = p_lead_id,
         updated_at = now()
   WHERE clinic_id = v_clinic_id
     AND lead_id   = p_lead_id;

  -- ⚠ ROLLBACK: soft-delete reintroduzido (mig 191 estado original).
  UPDATE public.leads
     SET phase            = 'paciente',
         phase_updated_at = now(),
         phase_updated_by = auth.uid(),
         phase_origin     = 'rpc',
         deleted_at       = COALESCE(deleted_at, now()),
         updated_at       = now()
   WHERE id = p_lead_id;

  IF NOT v_already THEN
    INSERT INTO public.phase_history (
      clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
    ) VALUES (
      v_clinic_id, p_lead_id, v_lead.phase, 'paciente', 'rpc',
      'rpc:lead_to_paciente', auth.uid(),
      'patients_id=' || p_lead_id::text || ' appointments_remapped=' || v_appt_count::text
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'patient_id', p_lead_id,
    'lead_id', p_lead_id,
    'idempotent_skip', v_already,
    'appointments_remapped', v_appt_count
  );
END $$;

COMMENT ON FUNCTION public.lead_to_paciente(uuid, numeric, timestamptz, timestamptz, text) IS
  '[ROLLBACK mig 192] Versão mig 191 com soft-delete reintroduzido. ⚠ Quebra crm_operational_view + E2E appointment-attend-finalize.';

COMMIT;
