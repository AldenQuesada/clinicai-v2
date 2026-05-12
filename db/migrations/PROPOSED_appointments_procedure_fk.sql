-- ============================================================================
-- PROPOSED MIGRATION · NÃO APLICADA · CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES
-- ============================================================================
--
-- Esta migration adiciona FK canônica `procedure_id` em `appointments` →
-- `clinic_procedimentos.id`. Fica como PROPOSED até autorização explícita.
--
-- Arquivo intencionalmente prefixado com PROPOSED_ para NÃO ser pego por
-- nenhum runner automático. Aplicação manual via Management API quando
-- autorizado:
--
--   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
--     db/migrations/PROPOSED_appointments_procedure_fk.sql
--
-- Antes de aplicar:
--   1. Renomear para `20260800000181_clinicai_v2_appointment_procedure_fk.sql`.
--   2. Registrar tracker em supabase_migrations.schema_migrations.
--   3. Verificar appointments existentes · backfill OPCIONAL via UPDATE
--      com JOIN por nome (ver bloco comentado abaixo).
--   4. Atualizar AppointmentRepository (create/update/types) para aceitar
--      `procedure_id` e gravar junto com snapshot `procedure_name`.
--
-- Razão para diferir: nenhuma autorização de migration nesta fase.
-- Trilha B1 entrega Select compatível usando apenas snapshot · zero risco
-- de schema drift.
--
-- ============================================================================

-- Adiciona coluna nullable + FK (não-bloqueante para rows existentes)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS procedure_id uuid;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_procedure_id_fkey
  FOREIGN KEY (procedure_id) REFERENCES public.clinic_procedimentos(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_procedure_id
  ON public.appointments (procedure_id)
  WHERE procedure_id IS NOT NULL;

COMMENT ON COLUMN public.appointments.procedure_id IS
  'FK canônica → clinic_procedimentos.id · NULL = sem vínculo (legado/manual). procedure_name continua sendo snapshot textual.';

-- ── Backfill OPCIONAL · MATCH EXATO POR NOME · sem heurística ──────────────
-- Não rodar sem revisão · pode ter falsos positivos em nomes ambíguos.
--
-- UPDATE public.appointments a
-- SET procedure_id = p.id
-- FROM public.clinic_procedimentos p
-- WHERE a.procedure_id IS NULL
--   AND a.deleted_at IS NULL
--   AND a.procedure_name IS NOT NULL
--   AND a.procedure_name != ''
--   AND p.clinic_id = a.clinic_id
--   AND p.ativo = true
--   AND lower(trim(p.nome)) = lower(trim(a.procedure_name));
