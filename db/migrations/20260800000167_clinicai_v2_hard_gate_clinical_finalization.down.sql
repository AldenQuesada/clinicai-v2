-- ============================================================================
-- Migration 167 · DOWN · DROP hard gate clinical finalization
-- ============================================================================
-- Reverte para versão pré-2I.1 da appointment_finalize (mig 2J).
-- Não restaura state machine antiga · DDL completa fica em mig 2J no histórico.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric, boolean, text);
DROP TABLE IF EXISTS public.appointment_clinical_gate_overrides;

-- NOTA: appointment_finalize precisa ser recriada via re-apply da DDL de 2J
-- (mig 65 original + extensão paciente_orcamento). Esta down apenas remove
-- as adições da 2I.1; caso precise rollback completo, re-aplicar mig 2J.

NOTIFY pgrst, 'reload schema';

COMMIT;
