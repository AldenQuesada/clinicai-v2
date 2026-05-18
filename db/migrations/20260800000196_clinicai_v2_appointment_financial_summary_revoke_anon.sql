-- =============================================================================
-- CRM_PARITY_R2 · Migration 196 · revoke anon grants on financial summary view
-- =============================================================================
--
-- Propósito: corrigir divergência do canon v2 detectada em Phase D5
-- (2026-05-18). Supabase aplica default ACL no schema `public` que pode
-- conceder privs a `anon` automaticamente em objetos novos. Mig 195
-- criou a view com `GRANT SELECT TO authenticated/service_role`, mas
-- `anon` apareceu com 7 privs herdados (DELETE/INSERT/REFERENCES/SELECT/
-- TRIGGER/TRUNCATE/UPDATE).
--
-- Funcionalmente já era seguro:
--   - view non-materialized → INSERT/UPDATE/DELETE em view sem INSTEAD OF
--     triggers falham
--   - `security_invoker=true` + RLS nas tabelas base → caller anon vê
--     `app_clinic_id() = NULL` → zero rows
--
-- Mas diverge do canon v2 (crm_operational_view, v_ai_budget_today,
-- wa_*_audit_view têm ZERO anon). Mig 196 corrige · idempotente.
--
-- Apply: somente após mig 195. Idempotente · seguro re-aplicar.
-- Rollback: down mantém zero anon (rollback intencional NÃO restaura anon).
--
-- O que esta migration NÃO toca:
--   - schema da view (estrutura preservada · só grants)
--   - migs 193/194 (tabelas e RLS intactos)
--   - `appointment_finalize` / hard gate / `appointment_attend`
--   - cron / worker 71 / wa_outbox / edge / env
-- =============================================================================

BEGIN;

REVOKE ALL ON public.appointment_financial_summary FROM anon;
GRANT SELECT ON public.appointment_financial_summary TO authenticated;
GRANT SELECT ON public.appointment_financial_summary TO service_role;

COMMENT ON VIEW public.appointment_financial_summary IS
  'Round 2 financial summary view. Uses security_invoker=true and has no anon grants; clinic scoping is enforced by underlying RLS.';

COMMIT;

-- =============================================================================
-- END OF MIGRATION 196
-- =============================================================================
