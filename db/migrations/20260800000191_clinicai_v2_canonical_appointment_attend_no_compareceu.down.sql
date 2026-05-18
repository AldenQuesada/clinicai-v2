-- =============================================================================
-- Rollback · CRM_PARITY_R1_PHASE_C1 · Migration 191
-- =============================================================================
--
-- ⚠️ DO NOT USE FOR PRODUCTION unless rolling back this exact migration.
--
-- Este down restaura as 3 funções para o estado da mig 65 (canon legacy
-- 7-phase). Reintroduz violações ao contrato canônico v2 (mig 150 retroapply):
--   - `_lead_phase_transition_allowed` volta a aceitar transições para
--     'compareceu' e 'reagendado'.
--   - `appointment_attend` volta a tentar UPDATE em `leads.phase='compareceu'`
--     (provavelmente bloqueado por `chk_leads_phase` em DBs com mig 150 já
--     aplicada · resultado: transação rollback · RPC retorna erro).
--   - `lead_to_paciente` volta a gateia `phase='compareceu'` (bloqueia em DBs
--     com mig 150 aplicada).
--
-- Use APENAS para rollback técnico imediato após apply equivocado da mig 191,
-- e somente em ambientes que NÃO tenham mig 150 já aplicada (caso contrário
-- o sistema fica em estado quebrado: nem o gate antigo passa, nem o novo).
--
-- Para reverter R1 inteiro: também rodar downs das migs 188-190.

BEGIN;

-- ── 1. Restaura _lead_phase_transition_allowed da mig 65 (matriz 7-phase) ───

CREATE OR REPLACE FUNCTION public._lead_phase_transition_allowed(
  p_from text,
  p_to   text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE p_from
    WHEN 'lead'       THEN p_to IN ('agendado', 'perdido')
    WHEN 'agendado'   THEN p_to IN ('reagendado', 'compareceu', 'perdido', 'agendado')
    WHEN 'reagendado' THEN p_to IN ('agendado', 'compareceu', 'perdido', 'reagendado')
    WHEN 'compareceu' THEN p_to IN ('paciente', 'orcamento', 'perdido', 'compareceu')
    WHEN 'orcamento'  THEN p_to IN ('paciente', 'agendado', 'perdido', 'orcamento')
    WHEN 'paciente'   THEN p_to IN ('perdido', 'paciente')
    WHEN 'perdido'    THEN p_to IN ('lead', 'agendado', 'reagendado', 'perdido')
    ELSE FALSE
  END;
$$;

COMMENT ON FUNCTION public._lead_phase_transition_allowed(text, text) IS
  '[ROLLBACK mig 191] Matriz legacy 7-phase. ⚠ Viola canon v2 (mig 150). Use apenas para rollback técnico.';

-- ── 2. Restaura appointment_attend da mig 65 (com UPDATE em leads.phase) ───

CREATE OR REPLACE FUNCTION public.appointment_attend(
  p_appointment_id uuid,
  p_chegada_em     timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clinic_id  uuid;
  v_appt       public.appointments%ROWTYPE;
  v_lead       public.leads%ROWTYPE;
  v_already    boolean := false;
BEGIN
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  SELECT * INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  IF v_appt.status IN ('na_clinica','em_consulta','em_atendimento','finalizado') THEN
    v_already := true;
  END IF;

  IF v_appt.status IN ('cancelado','no_show','bloqueado') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status_for_attend',
      'current_status', v_appt.status
    );
  END IF;

  IF NOT v_already THEN
    UPDATE public.appointments
       SET status      = 'na_clinica',
           chegada_em  = COALESCE(p_chegada_em, now()),
           updated_at  = now()
     WHERE id = v_appt.id;
  END IF;

  -- ⚠ ROLLBACK: bloco de UPDATE leads.phase='compareceu' restaurado.
  IF v_appt.lead_id IS NOT NULL THEN
    SELECT * INTO v_lead
      FROM public.leads
     WHERE id = v_appt.lead_id AND clinic_id = v_clinic_id
     FOR UPDATE;

    IF FOUND AND v_lead.deleted_at IS NULL
       AND v_lead.phase <> 'compareceu'
       AND public._lead_phase_transition_allowed(v_lead.phase, 'compareceu')
    THEN
      UPDATE public.leads
         SET phase            = 'compareceu',
             phase_updated_at = now(),
             phase_updated_by = auth.uid(),
             phase_origin     = 'auto_transition',
             updated_at       = now()
       WHERE id = v_lead.id;

      INSERT INTO public.phase_history (
        clinic_id, lead_id, from_phase, to_phase, origin, triggered_by, actor_id, reason
      ) VALUES (
        v_clinic_id, v_lead.id, v_lead.phase, 'compareceu', 'auto_transition',
        'rpc:appointment_attend', auth.uid(),
        'appointment_id=' || v_appt.id::text
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_appt.id,
    'idempotent_skip', v_already,
    'status_after', CASE WHEN v_already THEN v_appt.status ELSE 'na_clinica' END
  );
END $$;

COMMENT ON FUNCTION public.appointment_attend(uuid, timestamptz) IS
  '[ROLLBACK mig 191] Versão legacy mig 65. ⚠ Tenta UPDATE leads.phase=compareceu (viola canon v2).';

-- ── 3. Restaura lead_to_paciente da mig 65 (gate phase=compareceu) ─────────

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
    -- ⚠ ROLLBACK: gate legacy phase='compareceu' restaurado.
    IF v_lead.phase <> 'compareceu' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'illegal_transition',
        'from_phase', v_lead.phase,
        'hint', 'lead_to_paciente exige phase=compareceu (passe por appointment_attend antes)'
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
  '[ROLLBACK mig 191] Versão legacy mig 65. ⚠ Gateia phase=compareceu (viola canon v2).';

COMMIT;
