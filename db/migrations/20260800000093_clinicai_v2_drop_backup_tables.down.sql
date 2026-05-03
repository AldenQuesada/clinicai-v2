-- Rollback Mig 93 · NAO reconstrói backup tables (dados ja consolidados).
-- Pra reverter de verdade: pg_restore de snapshot Supabase pre-2026-05-03.
-- Esta down e' apenas marcador idempotente.
SELECT 1 AS noop_rollback_mig_93;
