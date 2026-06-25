-- =============================================================================
-- DOWN · 20260800000203_clinicai_v2_lara_recovery_apply_suggestion
-- Remove só a RPC de apply. Não toca 201/202, tabelas, nem dados.
-- =============================================================================
DROP FUNCTION IF EXISTS public.lara_recovery_finding_apply_suggestion(uuid, text, text, text, timestamptz, boolean);
