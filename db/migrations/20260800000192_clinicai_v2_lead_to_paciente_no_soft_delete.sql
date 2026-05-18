-- =============================================================================
-- CRM_PARITY_R1_PHASE_F_HOTFIX · Migration 192 · lead_to_paciente sem soft-delete
-- =============================================================================
--
-- Propósito: corrigir regressão introduzida pela mig 191 em `lead_to_paciente`.
--
-- Regressão detectada via CI Playwright (apps/lara/e2e/authed/appointment-
-- attend-finalize.spec.ts:208) após apply de mig 191:
--   - Test esperava `leadFinal.phase === 'paciente'` e `leadFinal.deleted_at IS NULL`
--   - Mig 191 copiou verbatim o corpo do mig 65 e reintroduziu
--     `deleted_at = COALESCE(deleted_at, now())` no UPDATE final
--   - Em prod, esse soft-delete havia sido removido out-of-band (mesmo padrão da
--     mig 187 lead_to_orcamento), pois o canon Phase 1C usa
--     `phase + lifecycle_status` como sinais operacionais, NÃO `deleted_at`
--
-- Canonical rule:
--   lead_to_paciente promotes leads.phase to paciente without soft-deleting the
--   lead row. deleted_at is not an operational transition signal in CRM v2.
--   The patient is created with the same UUID in the patients table; the lead
--   row stays visible in `crm_operational_view` with `mesa_operacional='paciente'`.
--
-- O que esta migration FAZ:
--   CREATE OR REPLACE FUNCTION public.lead_to_paciente(...) preservando:
--     - assinatura (uuid, numeric, ts, ts, text)
--     - return shape (jsonb com ok/patient_id/lead_id/idempotent_skip/appointments_remapped)
--     - SECURITY DEFINER + search_path
--     - gate canônico phase IN ('lead','agendado') + lifecycle_status='ativo' (mig 191)
--     - INSERT patient mesmo UUID
--     - re-map appointments/orcamentos
--     - phase_history INSERT
--   Removendo APENAS:
--     - `deleted_at = COALESCE(deleted_at, now())` do UPDATE em leads (linha 3.7)
--
-- O que esta migration NÃO toca:
--   - `_lead_phase_transition_allowed` (mig 191 já canônica)
--   - `appointment_attend` (mig 191 já canônica)
--   - `appointment_finalize` (mig 151)
--   - hard gate clínico (mig 167)
--   - `lead_to_orcamento` (mig 187 já canônica)
--   - `lead_lost` (mig 65 · lifecycle, ortogonal)
--   - tabelas / RLS / CHECKs / indexes
--   - dados existentes (alterações futuras de phase em rows já criadas usam fluxo normal)
--   - cron / wa_outbox / worker 71 / WhatsApp / provider
--   - env / secrets
--
-- Idempotente: CREATE OR REPLACE FUNCTION. Não cria/dropa colunas. Não altera
-- assinatura. Callers TS continuam válidos sem mudança.
--
-- Apply: somente após GO explícito (CRM_PARITY_R1_PHASE_F2_APPLY_192_*).
--
-- Validation SQL (rodar após apply):
--   1. SELECT prosrc FROM pg_proc
--      WHERE oid = to_regprocedure('public.lead_to_paciente(uuid,numeric,timestamptz,timestamptz,text)');
--      → NÃO deve conter 'deleted_at = COALESCE' nem 'deleted_at = now()' nem 'SET deleted_at'
--   2. SELECT grantee, privilege_type FROM information_schema.routine_privileges
--      WHERE specific_schema='public' AND routine_name='lead_to_paciente';
--      → grants preservados
--   3. E2E `apps/lara/e2e/authed/appointment-attend-finalize.spec.ts` deve passar:
--      - leadFinal.phase = 'paciente'
--      - leadFinal.lifecycle_status = 'ativo'
--      - leadFinal.deleted_at IS NULL
-- =============================================================================

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

  -- 1. Idempotência: se já existe em patients (mesmo UUID), só atualiza agregados.
  IF EXISTS (SELECT 1 FROM public.patients WHERE id = p_lead_id AND clinic_id = v_clinic_id) THEN
    v_already := true;
  END IF;

  IF NOT v_already THEN
    -- 2. Gate canônico Phase 1C (mig 191 · alinhado com mig 187 lead_to_orcamento).
    --   phase IN ('lead','agendado'): caminho normal (consulta agendada ou
    --     promote direto de lead).
    --   lifecycle_status='ativo': bloqueia perdido/recuperacao/arquivado.
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

    -- 3. Insert patient (mesmo UUID · ADR-001 modelo excludente em camadas)
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
    -- 3b. Idempotente: atualiza agregados se vieram.
    UPDATE public.patients
       SET total_revenue      = COALESCE(p_total_revenue, total_revenue),
           first_procedure_at = COALESCE(first_procedure_at, p_first_at),
           last_procedure_at  = GREATEST(last_procedure_at, p_last_at),
           notes              = COALESCE(p_notes, notes),
           updated_at         = now()
     WHERE id = p_lead_id;
  END IF;

  -- 4. Re-mapear appointments deste lead para patient (mesmo UUID).
  --    Mantém chk_appt_subject_xor (lead_id NULL, patient_id setado).
  UPDATE public.appointments
     SET lead_id    = NULL,
         patient_id = p_lead_id,
         updated_at = now()
   WHERE clinic_id = v_clinic_id
     AND lead_id   = p_lead_id;
  GET DIAGNOSTICS v_appt_count = ROW_COUNT;

  -- 5. Re-mapear orcamentos deste lead para patient.
  UPDATE public.orcamentos
     SET lead_id    = NULL,
         patient_id = p_lead_id,
         updated_at = now()
   WHERE clinic_id = v_clinic_id
     AND lead_id   = p_lead_id;

  -- 6. ⚠ CANONICAL FIX (mig 192 · 2026-05-18):
  --    phase='paciente' SEM tocar `deleted_at`. Lead permanece visível
  --    em crm_operational_view (a view filtra deleted_at IS NULL); o
  --    sinal operacional canônico é `phase + lifecycle_status`. Patient
  --    existe em paralelo na tabela patients (mesmo UUID · ADR-001).
  --
  --    Diff vs mig 191:
  --      REMOVIDO: deleted_at = COALESCE(deleted_at, now())
  UPDATE public.leads
     SET phase            = 'paciente',
         phase_updated_at = now(),
         phase_updated_by = auth.uid(),
         phase_origin     = 'rpc',
         updated_at       = now()
   WHERE id = p_lead_id;

  -- 7. Audit
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
  'Promove lead para patients · UUID compartilhado · NÃO soft-delete (mig 192 · Phase 1C canon) · remap appointments/orcamentos. Idempotente. Gate phase IN (lead, agendado) + lifecycle=ativo. Lead row permanece visível com phase=paciente.';

COMMIT;

-- =============================================================================
-- END OF MIGRATION 192
-- =============================================================================
