-- Rollback Mig 94 · NAO reconstrói (eram zero-rows, nada a recuperar).
-- Schema das tabelas legacy esta no histórico Git pre-2026-05-03 se precisar.
SELECT 1 AS noop_rollback_mig_94;
