-- ============================================================================
-- Migration 150 · clinicai-v2 · RETROAPPLY CRM lifecycle + crm_operational_view
-- ============================================================================
--
-- Propósito: VERSIONAR o estado real do banco (capturado em 2026-05-10 via
-- probes SQL · doc 13 da auditoria CRM). Estas estruturas JÁ EXISTEM em prod
-- mas foram aplicadas FORA do path versionado (provavelmente via Supabase
-- Studio). Esta migration é idempotente e segura para qualquer ambiente:
--
--   - ambientes que JÁ têm as estruturas (prod hoje): migration é no-op
--   - dev/preview branches sem as estruturas: migration cria do zero
--
-- Origem: doc `docs/crm-refactor/13-db-probes-current-v2-state.md`
-- ADR: `docs/crm-refactor/14-adr-single-table-operational-crm.md` (Q1 = single-table)
-- Rollback note: `docs/database/rollback-notes/20260800000150_*.md`
--
-- ⚠️ NÃO ALTERA DADOS. NÃO REMOVE OBJETOS EXISTENTES.
-- ⚠️ Idempotência via IF NOT EXISTS + DROP CONSTRAINT IF EXISTS + DO blocks.
-- ⚠️ Se objetos divergirem dos definidos aqui, a migration sobrescreve as
--    CONSTRAINTS para alinhar com o contrato v2 (4 phases + 4 lifecycle).
--
-- Contrato v2 capturado:
--   leads.phase ∈ {lead, agendado, paciente, orcamento}
--   leads.lifecycle_status ∈ {ativo, perdido, recuperacao, arquivado}
--   leads.lost_from_phase ∈ {lead, agendado, paciente, orcamento} OR NULL
-- ============================================================================

BEGIN;

-- ── 1. Colunas (idempotente) ────────────────────────────────────────────────
-- ADD COLUMN IF NOT EXISTS é seguro em rerun.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'ativo';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_from_phase text;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS archived_reason text;

-- Sanity: garantir que defaults estão corretos mesmo se coluna pré-existir
-- (caso a versão prévia tivesse default diferente)
ALTER TABLE public.leads
  ALTER COLUMN lifecycle_status SET DEFAULT 'ativo';

ALTER TABLE public.leads
  ALTER COLUMN lifecycle_status SET NOT NULL;


-- ── 2. CHECK constraints (drop+recreate · contrato v2 endurece valores) ────
-- Drop seguro com IF EXISTS · recreate com ADD CONSTRAINT.
-- IMPORTANTE: drop+recreate é OK porque o banco já está limpo
-- (probe P6 doc 13: zero rows com phase legado 'compareceu/reagendado/perdido').

-- 2a. chk_leads_phase · APENAS 4 valores do contrato v2
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS chk_leads_phase;

ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_phase
  CHECK (phase = ANY (ARRAY['lead'::text, 'agendado'::text, 'paciente'::text, 'orcamento'::text]));

-- 2b. chk_leads_lifecycle_status · 4 valores ortogonais a phase
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS chk_leads_lifecycle_status;

ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_lifecycle_status
  CHECK (lifecycle_status = ANY (ARRAY['ativo'::text, 'perdido'::text, 'recuperacao'::text, 'arquivado'::text]));

-- 2c. chk_leads_lost_from_phase · mesmo conjunto de phase + NULL
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS chk_leads_lost_from_phase;

ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_lost_from_phase
  CHECK (lost_from_phase IS NULL OR lost_from_phase = ANY (ARRAY['lead'::text, 'agendado'::text, 'paciente'::text, 'orcamento'::text]));

-- 2d. chk_leads_lost_consistency · usa lifecycle_status (não phase) corretamente
-- Quando lifecycle_status='perdido', exige lost_reason, lost_at e lost_from_phase
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS chk_leads_lost_consistency;

ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_lost_consistency
  CHECK (
    (lifecycle_status <> 'perdido'::text)
    OR (
      lifecycle_status = 'perdido'::text
      AND lost_reason IS NOT NULL
      AND length(TRIM(BOTH FROM lost_reason)) > 0
      AND lost_from_phase IS NOT NULL
      AND lost_from_phase = ANY (ARRAY['lead'::text, 'agendado'::text, 'paciente'::text, 'orcamento'::text])
      AND lost_at IS NOT NULL
    )
  );


-- ── 3. crm_operational_view · CREATE OR REPLACE (idempotente) ───────────────
-- Definição capturada verbatim do probe P1 (doc 13).
-- 17 colunas projetadas · LEFT JOIN com patients/appointments/orcamentos.
-- mesa_operacional derivada via CASE com prioridade:
--   lifecycle terminal > paciente_orcamento > paciente > orcamento > agendado > lead

CREATE OR REPLACE VIEW public.crm_operational_view AS
SELECT
  l.clinic_id,
  l.id AS lead_id,
  p.id AS patient_id,
  l.name,
  l.phone,
  l.email,
  l.phase AS lead_phase,
  l.lifecycle_status,
  l.lost_from_phase,
  a.id AS appointment_id,
  a.status AS appointment_status,
  a.scheduled_date,
  a.start_time,
  a.end_time,
  o.id AS budget_id,
  o.status AS budget_status,
  CASE
    WHEN l.lifecycle_status = 'perdido'::text   THEN 'perdido'::text
    WHEN l.lifecycle_status = 'arquivado'::text THEN 'arquivado'::text
    WHEN p.id IS NOT NULL AND o.id IS NOT NULL  THEN 'paciente_orcamento'::text
    WHEN p.id IS NOT NULL                       THEN 'paciente'::text
    WHEN o.id IS NOT NULL                       THEN 'orcamento'::text
    WHEN a.id IS NOT NULL AND a.deleted_at IS NULL THEN 'agendado'::text
    ELSE 'lead'::text
  END AS mesa_operacional,
  CASE WHEN a.status = 'no_show'::text THEN true ELSE false END AS is_no_show,
  CASE WHEN o.id IS NOT NULL THEN true ELSE false END AS has_active_budget
FROM public.leads l
LEFT JOIN public.patients p
       ON p.id = l.id
      AND p.clinic_id = l.clinic_id
      AND p.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT a1.*
  FROM public.appointments a1
  WHERE a1.clinic_id = l.clinic_id
    AND a1.lead_id   = l.id
    AND a1.deleted_at IS NULL
  ORDER BY a1.scheduled_date DESC, a1.start_time DESC
  LIMIT 1
) a ON true
LEFT JOIN LATERAL (
  SELECT o1.*
  FROM public.orcamentos o1
  WHERE o1.clinic_id = l.clinic_id
    AND o1.deleted_at IS NULL
    AND (o1.status <> ALL (ARRAY['approved'::text, 'lost'::text]))
    AND (
      o1.lead_id = l.id
      OR (p.id IS NOT NULL AND o1.patient_id = p.id)
    )
  ORDER BY o1.created_at DESC
  LIMIT 1
) o ON true
WHERE l.deleted_at IS NULL;


-- ── 4. Comments (documentação inline) ───────────────────────────────────────

COMMENT ON COLUMN public.leads.lifecycle_status IS
  'Ciclo de vida do lead, ortogonal a phase. Valores: ativo (default), perdido, recuperacao, arquivado. Perda preserva phase em lost_from_phase. Ver ADR docs/crm-refactor/14-adr-single-table-operational-crm.md';

COMMENT ON COLUMN public.leads.lost_from_phase IS
  'Phase em que o lead estava no momento em que virou perdido. Valores: lead/agendado/paciente/orcamento ou NULL quando lifecycle_status<>perdido. Permite recuperacao preservando origem.';

COMMENT ON COLUMN public.leads.archived_at IS
  'Timestamp quando lead foi arquivado por decisao humana (não é perda). Setado quando lifecycle_status muda para arquivado. NÃO é exclusão (deleted_at).';

COMMENT ON COLUMN public.leads.archived_reason IS
  'Motivo do arquivamento (lead duplicado, faleceu, mudou de cidade, etc). Setado junto com archived_at.';

COMMENT ON VIEW public.crm_operational_view IS
  'View canônica do CRM operacional. Frontend consome esta view para Kanban/mesas/contadores. Deriva mesa_operacional (lead/agendado/paciente/orcamento/paciente_orcamento/perdido/arquivado) via CASE. Inclui agregados de appointments (último ativo) e orcamentos (último aberto). Filtra leads.deleted_at IS NULL (excluídos não aparecem em mesas operacionais). Ver ADR docs/crm-refactor/14-adr-single-table-operational-crm.md';


COMMIT;

-- ============================================================================
-- FIM da migration 150 · retroapply versionada
--
-- Validação pós-aplicação (rodar manualmente no Studio):
--   1. SELECT column_name FROM information_schema.columns
--      WHERE table_name='leads' AND column_name IN
--      ('lifecycle_status','lost_from_phase','archived_at','archived_reason');
--      → 4 rows esperadas
--   2. SELECT conname FROM pg_constraint WHERE conrelid='public.leads'::regclass
--      AND conname IN ('chk_leads_phase','chk_leads_lifecycle_status',
--                      'chk_leads_lost_from_phase','chk_leads_lost_consistency');
--      → 4 rows esperadas
--   3. SELECT count(*) FROM public.crm_operational_view;
--      → deve retornar mesmo valor de antes (sem mudança de dados)
-- ============================================================================
