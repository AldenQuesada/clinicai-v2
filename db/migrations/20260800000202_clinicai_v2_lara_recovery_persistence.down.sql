-- =============================================================================
-- DOWN · 20260800000202_clinicai_v2_lara_recovery_persistence
-- Ordem: RPCs → findings → scans. NÃO dropa lara_recovery_candidates (201),
-- commercial_recovery_workflow_items, nem set_updated_at (compartilhada).
-- =============================================================================
DROP FUNCTION IF EXISTS public.lara_recovery_findings_list(text, text, integer);
DROP FUNCTION IF EXISTS public.lara_recovery_finding_set_status(uuid, text, text);
DROP FUNCTION IF EXISTS public.lara_recovery_run_scan(text, integer, integer);

DROP TABLE IF EXISTS public.lara_recovery_findings;
DROP TABLE IF EXISTS public.lara_recovery_scans;
