-- =============================================================================
-- Rollback · CRM_PARITY_R3 · Migration 197
-- =============================================================================
--
-- Drop apenas a tabela nova `appointment_post_actions` + indexes + policies
-- + trigger (CASCADE).
--
-- ⚠️ Se houver post-actions pendentes registradas, este rollback DESTRÓI o
-- registro. Como elas são informativas (zero side effect externo automático),
-- a perda é apenas de visibilidade · staff terá que re-registrar follow-ups
-- manualmente caso o rollback seja necessário.
--
-- Não restaura defaults Supabase de anon grants (canon v2 = zero anon · ver
-- mig 196 lição). Se reaplicar a mig 197, o REVOKE volta a remover anon.
-- =============================================================================

BEGIN;

DROP TABLE IF EXISTS public.appointment_post_actions CASCADE;

COMMIT;
