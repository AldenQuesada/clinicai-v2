-- Rollback Mig 95 · NAO reconstrói (eram zero-rows, nada a recuperar).
-- Schema original esta no histórico de migrations Git pre-2026-05-03.
SELECT 1 AS noop_rollback_mig_95;
