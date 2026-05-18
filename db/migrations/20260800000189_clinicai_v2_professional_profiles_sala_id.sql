-- =============================================================================
-- CRM_PARITY_R1 · Migration 189 · professional_profiles.sala_id FK
-- =============================================================================
--
-- Contexto:
--   Audit 1×1 gap D-03 ("auto-link prof→sala"). Legado clinic-dashboard
--   usa `professional_profiles.sala_id` para sugerir sala default quando
--   o profissional é selecionado no modal de agendamento (legacy
--   js/agenda-modal.js:1425-1440). v2 não tem essa coluna.
--
-- Esta migration adiciona FK opcional `sala_id uuid` → `clinic_rooms(id)`.
-- ON DELETE SET NULL (sala apagada não derruba o profissional).
--
-- A tabela `clinic_rooms` foi criada por mig legada 20260537000000 no
-- clinic-dashboard supabase/migrations/ · vive no mesmo schema/projeto
-- Supabase. v2 referencia via FK sem precisar recriar.
--
-- Backfill:
--   NÃO faz backfill. Coluna nullable · sala_id NULL = sem sugestão de
--   sala default · UI cai em "selecione sala manualmente".
--
-- Index:
--   Index parcial em sala_id WHERE NOT NULL · queries "profissionais
--   associados a esta sala" ficam rápidas.
--
-- O que esta migration NÃO toca:
--   - RLS policies existentes
--   - Trigger / função (sem cascata custom)
--   - appointments / outros relacionamentos
--   - cron / wa_outbox / edge / worker
--
-- Apply: somente após autorização explícita.
-- Rollback: down migration drop column + index.

BEGIN;

ALTER TABLE public.professional_profiles
  ADD COLUMN IF NOT EXISTS sala_id uuid NULL
    REFERENCES public.clinic_rooms(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prof_profiles_sala_id
  ON public.professional_profiles (sala_id)
  WHERE sala_id IS NOT NULL;

COMMENT ON COLUMN public.professional_profiles.sala_id IS
  'CRM_PARITY_R1 · FK opcional para clinic_rooms · sugere sala default no wizard de agendamento quando este profissional é selecionado. NULL = sem default · usuário escolhe manualmente.';

COMMIT;
