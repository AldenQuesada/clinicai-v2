-- =============================================================================
-- CRM_PARITY_R1 · Migration 188 · professional_profiles.ferias jsonb
-- =============================================================================
--
-- Contexto:
--   Audit 1×1 deep-1x1-audit-2026-05-18 gap D-04/V-10 confirmou que v2 não
--   tem nenhum mecanismo para bloquear agendamento durante férias de
--   profissional. Legado clinic-dashboard sinaliza ferias via jsonb em
--   `professional_profiles` (legado tinha campo similar embora vol).
--
-- Esta migration adiciona coluna `ferias jsonb NOT NULL DEFAULT '[]'` para
-- armazenar períodos de afastamento (férias, congressos, licença, blackout
-- planejado). UI lê isso para bloquear datas em agenda.
--
-- Schema esperado de cada item:
--   {
--     "start_date": "YYYY-MM-DD",  -- obrigatório
--     "end_date":   "YYYY-MM-DD",  -- obrigatório, end >= start
--     "reason":     "texto livre"  -- opcional
--   }
--
-- CHECK validation:
--   - jsonb_typeof(ferias) = 'array' (sempre array, default '[]')
--   - Validação de structure por elemento via trigger/CHECK (omitido nesta
--     fase · será adicionado em mig posterior se necessário · UI valida
--     antes de gravar via Zod no admin de profissionais).
--
-- Index:
--   GIN em ferias para queries de overlap "@>" futuras (consultas read-only
--   tipo "qual profissional está de férias em DD/MM").
--
-- Multi-tenant:
--   Tabela tem RLS por clinic_id desde migration 800-079 (rls_with_check
--   blanket fix). Nenhuma policy nova.
--
-- O que esta migration NÃO toca:
--   - RLS policies existentes (permanecem)
--   - Outras colunas de professional_profiles
--   - appointments (room_id é mig 190 separada)
--   - cron / worker / wa_outbox / edge functions
--   - GRANTs (default da tabela já permite o que precisa)
--
-- Apply: somente após autorização explícita
--   (CRM_PARITY_R1_APPLY).
--
-- Rollback note:
--   Down migration faz DROP COLUMN ferias CASCADE + drop index.
--   Não há dependentes (zero código consome ferias antes desta mig).

BEGIN;

ALTER TABLE public.professional_profiles
  ADD COLUMN IF NOT EXISTS ferias jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Garantir que sempre seja array (defensivo · trigger inseridos manualmente
-- via update podem violar default)
ALTER TABLE public.professional_profiles
  DROP CONSTRAINT IF EXISTS chk_prof_profiles_ferias_array;
ALTER TABLE public.professional_profiles
  ADD CONSTRAINT chk_prof_profiles_ferias_array
  CHECK (jsonb_typeof(ferias) = 'array');

CREATE INDEX IF NOT EXISTS idx_prof_profiles_ferias_gin
  ON public.professional_profiles USING GIN (ferias)
  WHERE jsonb_array_length(ferias) > 0;

COMMENT ON COLUMN public.professional_profiles.ferias IS
  'CRM_PARITY_R1 · array jsonb de períodos de afastamento. Cada item: {start_date, end_date, reason?}. Bloqueia agendamento durante o período via repos.professionals.isOnVacation(). Default [].';

COMMIT;
