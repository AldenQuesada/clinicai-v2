-- =============================================================================
-- CRM_PHASE_APPOINTMENT_PROCEDURE_FK · Promoção do PROPOSED para migration real
-- =============================================================================
--
-- Contexto:
--   - Wizard de agendamento (CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · Trilha B1)
--     já usa Select de `clinic_procedimentos`, mas persiste apenas snapshot
--     textual em `appointments.procedure_name`.
--   - Esta migration adiciona a FK canônica `appointments.procedure_id` →
--     `clinic_procedimentos(id)` para fechar o contrato.
--
-- Estado pré-apply (validado pela fase APPOINTMENT_PROCEDURE_FK):
--   - `appointments.procedure_id` não existe.
--   - 0 FKs apontando para `clinic_procedimentos`.
--   - `clinic_procedimentos` tem 44 ativos · 0 nomes duplicados normalizados.
--   - match `procedure_name` × `clinic_procedimentos.nome`: 0/2 · backfill NÃO
--     justificado.
--
-- O que esta migration FAZ:
--   - ADD COLUMN `procedure_id uuid NULL` (nullable · não-bloqueante)
--   - FOREIGN KEY `appointments_procedure_id_fkey` → `clinic_procedimentos(id)`
--   - `ON UPDATE CASCADE` (UUIDs não mudam · trivial · alinhamento canônico)
--   - `ON DELETE SET NULL` (procedimento deletado preserva appointment)
--   - INDEX parcial em `procedure_id` quando NOT NULL
--   - COMMENT documentando contrato
--
-- O que esta migration NÃO toca:
--   - `appointments.procedure_name` permanece como snapshot textual
--   - `appointments.recurrence_procedure` permanece intacto
--   - NÃO faz backfill (match rate 0% nesta clínica · valor zero)
--   - NÃO adiciona NOT NULL
--   - NÃO cria trigger
--   - NÃO altera RLS / policies existentes
--   - NÃO toca hard gate clínico (`appointment_finalize`, `*_clinical_gate_*`,
--     `*_anamnesis_*`, `complete_anamnesis_form`)
--   - NÃO toca `wa_outbox`, `cron`, `job 71`, env/secrets
--   - NÃO toca `medical_record_attachments`
--
-- Substitui o arquivo:
--   db/migrations/PROPOSED_appointments_procedure_fk.sql
-- (mantido como referência histórica · removido no commit da fase FK).
--
-- Apply: somente após autorização explícita
--   (CRM_PHASE_APPOINTMENT_PROCEDURE_FK_APPLY).
--
--   SUPABASE_ACCESS_TOKEN=sbp_... \
--     node scripts/apply-migration.mjs \
--     db/migrations/20260800000182_clinicai_v2_appointment_procedure_fk.sql
--
-- Rollback note:
--   docs/database/rollback-notes/20260800000182_clinicai_v2_appointment_procedure_fk.md
-- =============================================================================

-- ── 1) Adiciona a coluna nullable ────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS procedure_id uuid;

-- ── 2) FK canônica → clinic_procedimentos(id) ───────────────────────────────
-- Idempotente: cria a constraint apenas se ainda não existir (defense in depth
-- · evita erro de "constraint already exists" em re-runs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_procedure_id_fkey'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_procedure_id_fkey
      FOREIGN KEY (procedure_id)
      REFERENCES public.clinic_procedimentos(id)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

-- ── 3) Índice parcial ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_appointments_procedure_id
  ON public.appointments (procedure_id)
  WHERE procedure_id IS NOT NULL;

-- ── 4) Documentação do contrato ─────────────────────────────────────────────
COMMENT ON COLUMN public.appointments.procedure_id IS
  'FK canônica → clinic_procedimentos.id · NULL = sem vínculo (legado/manual). '
  '`procedure_name` permanece como snapshot textual ate transicao completa.';

-- =============================================================================
-- Pós-apply esperado:
--   - SELECT column_name FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='appointments'
--       AND column_name='procedure_id' → 1 linha
--   - SELECT conname FROM pg_constraint
--     WHERE conname='appointments_procedure_id_fkey' → 1 linha
--   - SELECT indexname FROM pg_indexes
--     WHERE indexname='idx_appointments_procedure_id' → 1 linha
--   - hard gate clínico                    · intacto
--   - procedure_name dos appointments      · inalterado
-- =============================================================================
