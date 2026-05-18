-- =============================================================================
-- Rollback · CRM_PARITY_R2 · Migration 193
-- =============================================================================
--
-- Down preserva appointments.procedure_id/name (legacy snapshot). Drop apenas
-- a tabela nova `appointment_procedure_items` + indexes + policies (CASCADE).
--
-- ⚠️ Se appointments tiverem múltiplos items registrados, este rollback
-- DESTRÓI a informação não-snapshotada (items individuais com cortesia/desconto
-- per-item). Único item ainda preservado fica no campo legacy
-- `appointments.procedure_name` + `procedure_id` + `value` (que continuam
-- intocados).

BEGIN;

DROP TABLE IF EXISTS public.appointment_procedure_items CASCADE;

COMMIT;
