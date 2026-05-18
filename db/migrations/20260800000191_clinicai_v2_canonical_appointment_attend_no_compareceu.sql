-- =============================================================================
-- CRM_PARITY_R1_PHASE_C1 · Migration 191 · canonical RPC hotfix
--   appointment_attend + _lead_phase_transition_allowed + lead_to_paciente
-- =============================================================================
--
-- Propósito: alinhar source-of-truth SQL ao contrato canônico Phase 1C
-- (mig 150 retroapply · `leads.phase ∈ {lead, agendado, paciente, orcamento}`).
--
-- Origem do bloqueio (audit `docs/crm-refactor/rounds/round-1-phase-c-audit-check.md`):
--   - mig 65 `_lead_phase_transition_allowed` AINDA inclui 'compareceu' e
--     'reagendado' como phases válidas + transições compareceu→paciente etc.
--   - mig 65 `appointment_attend` AINDA contém UPDATE `leads SET phase='compareceu'`
--     guardado pelo helper acima.
--   - mig 65 `lead_to_paciente` AINDA gateia `phase='compareceu'`.
--   - mig 187 já patchou `lead_to_orcamento` no padrão canônico
--     (`phase IN ('lead','agendado')`). Esta mig 191 estende o mesmo padrão
--     para attend e lead_to_paciente, e finaliza alinhamento da matriz de
--     transições.
--
-- O que esta migration FAZ:
--   1. `_lead_phase_transition_allowed(p_from, p_to)` — recreate com matriz
--      4-phase canônica + transição `lead/agendado → perdido` (perdido aqui
--      é semente histórica de `lost_from_phase` em phase_history · NÃO é
--      phase real de `leads.phase`; lifecycle_status=perdido é o sinal real,
--      gerenciado por `lead_lost` RPC).
--   2. `appointment_attend(uuid, timestamptz)` — recreate SEM o bloco de
--      UPDATE em `leads.phase`. Atualiza apenas `appointments.status`,
--      `chegada_em`, `updated_at`. `leads.phase` permanece intacta até
--      `appointment_finalize` decidir o outcome (paciente/orcamento/...).
--   3. `lead_to_paciente(uuid, ...)` — recreate com gate
--      `phase IN ('lead','agendado')` (mesmo padrão da mig 187). Idempotência
--      e demais side-effects (insert patient + remap appointments/orcamentos +
--      soft-delete em leads + phase_history audit) preservados verbatim.
--
-- Contrato canônico reforçado:
--   - appointment_attend updates appointment attendance status only.
--   - It must not mutate leads.phase.
--   - leads.phase is promoted only by appointment_finalize → lead_to_paciente
--     or lead_to_orcamento (or directly via sdr_change_phase wrapper).
--   - lead_lost moves lifecycle_status=perdido, NÃO altera phase
--     (lost_from_phase preserva a fase anterior em phase_history).
--
-- O que esta migration NÃO toca:
--   - `chk_leads_phase` (mig 150 já restringe a 4 phases)
--   - `chk_leads_lifecycle_status` / `chk_leads_lost_from_phase` (mig 150)
--   - `phase_history` CHECK (mig 64 · ainda aceita compareceu/reagendado/perdido
--     como `to_phase` legacy · phase_history é audit, mantém valores históricos)
--   - `appointment_finalize` (mig 151 · hard gate clínico mig 167)
--   - `lead_to_orcamento` (mig 187 já canônica)
--   - `lead_lost` (mig 65 · trata lifecycle, não phase)
--   - `sdr_change_phase` wrapper (mig 65 · roteador genérico)
--   - dados existentes
--   - RLS / GRANTs (CREATE OR REPLACE preserva)
--   - cron / wa_outbox / worker 71 / edge functions / env / secrets
--   - migrations 188-190 deste Round 1
--
-- Idempotência: 3 funções via CREATE OR REPLACE. Não cria/dropa colunas. Não
-- altera assinatura (callers TS + SQL continuam válidos sem mudança).
--
-- Apply: somente após GO explícito (CRM_PARITY_R1_PHASE_D_*).
--
-- Validation SQL (rodar manualmente após apply):
--   1. SELECT prosrc FROM pg_proc
--      WHERE oid = to_regprocedure('public._lead_phase_transition_allowed(text,text)');
--      → NÃO deve conter 'compareceu' nem 'reagendado' (módulo comentário canon).
--   2. SELECT prosrc FROM pg_proc
--      WHERE oid = to_regprocedure('public.appointment_attend(uuid,timestamptz)');
--      → NÃO deve conter 'UPDATE public.leads' ou 'phase'.
--   3. SELECT prosrc FROM pg_proc
--      WHERE oid = to_regprocedure(
--        'public.lead_to_paciente(uuid,numeric,timestamptz,timestamptz,text)'
--      );
--      → deve conter 'phase IN' e NÃO conter 'phase = ''compareceu''' (módulo
--        comentário).
--   4. SELECT grantee, privilege_type FROM information_schema.routine_privileges
--      WHERE specific_schema='public'
--        AND routine_name IN ('appointment_attend','_lead_phase_transition_allowed','lead_to_paciente')
--      ORDER BY routine_name, grantee;
--      → grants preservados (authenticated/service_role conforme mig 65/187).
--   5. Smoke (fixture E2E, fora de prod operacional):
--      a. Lead phase='agendado', appointment status='agendado'
--      b. CALL appointment_attend(appt_id)
--      c. SELECT phase FROM leads WHERE id=lead_id → permanece 'agendado'
--      d. SELECT status FROM appointments WHERE id=appt_id → 'na_clinica'
--      E2E spec real: apps/lara/e2e/authed/appointment-attend-finalize.spec.ts
--      (linha 163: lead.phase deve permanecer 'agendado' pós-attend).
-- =============================================================================

BEGIN;

-- ── 1. _lead_phase_transition_allowed · matriz canônica 4-phase ─────────────
--
-- Canonical rule:
--   leads.phase ∈ {lead, agendado, paciente, orcamento}.
--   compareceu/reagendado/perdido NÃO são phases reais (mig 150 retroapply).
--   `perdido` aparece aqui apenas como destino legado em rollback raros · o
--   sinal canônico de perda vive em lifecycle_status (lead_lost RPC).
--   Mantemos `→ 'perdido'` como caminho permitido para preservar compat com
--   chamadas que ainda passam pela RPC durante deprecation; sub-RPCs reais
--   (lead_lost) cuidam de lifecycle.
--
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
    -- Lead novo: pode virar agendado (consulta marcada) ou perdido (não evoluiu).
    WHEN 'lead'      THEN p_to IN ('agendado', 'perdido', 'lead')
    -- Agendado: pode virar paciente (finalize outcome=paciente),
    --   orcamento (finalize outcome=orcamento/paciente_orcamento),
    --   perdido (lead_lost), ou self-loop (no-op idempotente).
    WHEN 'agendado'  THEN p_to IN ('paciente', 'orcamento', 'perdido', 'agendado')
    -- Orcamento: aceitou (paciente), nova consulta (agendado · raro),
    --   perdido (lead_lost), self-loop.
    WHEN 'orcamento' THEN p_to IN ('paciente', 'agendado', 'perdido', 'orcamento')
    -- Paciente: só vai a perdido em casos raros (faleceu / opt-out).
    --   Self-loop = idempotência.
    WHEN 'paciente'  THEN p_to IN ('perdido', 'paciente')
    -- Nenhuma transição a partir de 'compareceu' / 'reagendado' / 'perdido' como
    -- phase — esses NÃO são phases canônicas. Qualquer chamada com p_from
    -- nesses valores retorna FALSE (defesa contra dados legacy).
    ELSE FALSE
  END;
$$;

COMMENT ON FUNCTION public._lead_phase_transition_allowed(text, text) IS
  'Matriz canônica 4-phase (lead/agendado/paciente/orcamento). IMMUTABLE. compareceu/reagendado/perdido NÃO são phases. Mudar matriz exige migration nova + audit ADR.';

-- ── 2. appointment_attend · canonical (sem mutação de leads.phase) ─────────
--
-- Marca chegada do paciente → appointment.status='na_clinica' + chegada_em.
-- NÃO altera leads.phase. Idempotente: 2x calls não duplicam chegada_em.
--
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
  v_already    boolean := false;
BEGIN
  -- 2.1 Tenant guard
  v_clinic_id := public.app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_clinic_in_jwt');
  END IF;

  -- 2.2 Lock appointment row
  SELECT * INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id
     AND clinic_id = v_clinic_id
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  -- 2.3 Idempotência: status já avançado preserva chegada_em existente.
  IF v_appt.status IN ('na_clinica','em_consulta','em_atendimento','finalizado') THEN
    v_already := true;
  END IF;

  -- 2.4 Bloqueia status terminais que não podem voltar pra na_clinica.
  IF v_appt.status IN ('cancelado','no_show','bloqueado') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'invalid_status_for_attend',
      'current_status', v_appt.status
    );
  END IF;

  -- 2.5 UPDATE appointment (sem tocar leads).
  IF NOT v_already THEN
    UPDATE public.appointments
       SET status      = 'na_clinica',
           chegada_em  = COALESCE(p_chegada_em, now()),
           updated_at  = now()
     WHERE id = v_appt.id;
  END IF;

  -- ⚠ CANONICAL: NÃO há UPDATE em public.leads aqui.
  --   leads.phase é mantida intacta · apenas appointment_finalize promove
  --   phase via sub-RPCs (lead_to_paciente / lead_to_orcamento). E2E
  --   apps/lara/e2e/authed/appointment-attend-finalize.spec.ts:163 valida
  --   que lead.phase permanece 'agendado' pós-attend.

  RETURN jsonb_build_object(
    'ok', true,
    'appointment_id', v_appt.id,
    'idempotent_skip', v_already,
    'status_after', CASE WHEN v_already THEN v_appt.status ELSE 'na_clinica' END
  );
END $$;

COMMENT ON FUNCTION public.appointment_attend(uuid, timestamptz) IS
  'Marca paciente chegou · UPDATE appointments.status=na_clinica + chegada_em. NÃO altera leads.phase (canon Phase 1C · mig 150). Idempotente. Bloqueia se appointment está cancelado/no_show/bloqueado.';

-- ── 3. lead_to_paciente · canonical gate (phase IN ('lead','agendado')) ────
--
-- Promove lead a paciente. Mesmo padrão da mig 187 (lead_to_orcamento):
-- gate por phase IN ('lead','agendado') + lifecycle_status='ativo'.
-- Resto do corpo (insert patient + remap appointments/orcamentos + soft-delete
-- + audit) preservado verbatim da mig 65.
--
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

  -- 3.1 Idempotência: se já existe em patients (mesmo UUID), só atualiza agregados.
  IF EXISTS (SELECT 1 FROM public.patients WHERE id = p_lead_id AND clinic_id = v_clinic_id) THEN
    v_already := true;
  END IF;

  IF NOT v_already THEN
    -- 3.2 Gate canônico Phase 1C (mig 150) · alinhado com mig 187 lead_to_orcamento.
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

    -- 3.3 Insert patient (mesmo UUID · ADR-001 modelo excludente)
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
    -- 3.4 Idempotente: atualiza agregados se vieram.
    UPDATE public.patients
       SET total_revenue      = COALESCE(p_total_revenue, total_revenue),
           first_procedure_at = COALESCE(first_procedure_at, p_first_at),
           last_procedure_at  = GREATEST(last_procedure_at, p_last_at),
           notes              = COALESCE(p_notes, notes),
           updated_at         = now()
     WHERE id = p_lead_id;
  END IF;

  -- 3.5 Re-mapear appointments deste lead para patient (mesmo UUID)
  --     Mantém chk_appt_subject_xor (lead_id NULL, patient_id setado).
  UPDATE public.appointments
     SET lead_id    = NULL,
         patient_id = p_lead_id,
         updated_at = now()
   WHERE clinic_id = v_clinic_id
     AND lead_id   = p_lead_id;
  GET DIAGNOSTICS v_appt_count = ROW_COUNT;

  -- 3.6 Re-mapear orcamentos deste lead para patient.
  UPDATE public.orcamentos
     SET lead_id    = NULL,
         patient_id = p_lead_id,
         updated_at = now()
   WHERE clinic_id = v_clinic_id
     AND lead_id   = p_lead_id;

  -- 3.7 phase=paciente + soft-delete legado (mantido para compat com
  --     consumers que ainda filtram por deleted_at IS NULL na tabela leads).
  --     Após Round 5 backfill + Round 7 freeze, pode-se reavaliar.
  UPDATE public.leads
     SET phase            = 'paciente',
         phase_updated_at = now(),
         phase_updated_by = auth.uid(),
         phase_origin     = 'rpc',
         deleted_at       = COALESCE(deleted_at, now()),
         updated_at       = now()
   WHERE id = p_lead_id;

  -- 3.8 Audit
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
  'Promove lead para patients · UUID compartilhado · soft-delete em leads · remap appointments/orcamentos. Idempotente. Canon Phase 1C: gate phase IN (lead, agendado) + lifecycle=ativo (mig 191 substituiu o gate antigo phase=compareceu da mig 65).';

COMMIT;

-- =============================================================================
-- END OF MIGRATION 191
-- =============================================================================
