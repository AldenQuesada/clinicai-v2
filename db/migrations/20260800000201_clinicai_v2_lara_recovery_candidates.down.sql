-- =============================================================================
-- DOWN · 20260800000201_clinicai_v2_lara_recovery_candidates
-- Remove a RPC read-only. NÃO toca dados (a função não persiste nada).
-- =============================================================================
DROP FUNCTION IF EXISTS public.lara_recovery_candidates(integer, integer, boolean);
