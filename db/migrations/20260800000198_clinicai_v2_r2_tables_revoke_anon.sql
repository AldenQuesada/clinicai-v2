-- =============================================================================
-- CRM_PARITY_R5 · Migration 198 · revoke anon grants on R2 tables
-- =============================================================================
--
-- Propósito: corrigir divergência canon detectada em R5 Prompt 1 hardening
-- audit. Supabase aplica default ACL no schema `public` que pode conceder
-- privs a `anon` em objetos novos. Migs 193 (`appointment_procedure_items`)
-- e 194 (`appointment_payments`) criaram as tabelas com
-- `GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated; GRANT ALL TO
-- service_role` mas `anon` apareceu com 7 privs herdados
-- (DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE).
--
-- Mesma lição que mig 196 (view 195) e mig 197 (post_actions com REVOKE
-- canon embed). Esta mig é correção retroativa para as duas tabelas R2
-- pré-existentes.
--
-- Funcionalmente já era seguro:
--   - RLS está enabled em ambas (relrowsecurity=true)
--   - Policies usam `clinic_id = app_clinic_id()`
--   - Caller anon → app_clinic_id() retorna NULL → zero rows
--
-- Mas diverge do canon v2 (todas as outras tabelas R1/R3 + view R2 têm
-- ZERO anon). Mig 198 corrige · idempotente.
--
-- Apply: somente após GO explícito (R5 Prompt 2).
-- Rollback: down mantém zero anon (rollback intencional NÃO restaura anon).
--
-- O que esta migration NÃO toca:
--   - estrutura das tabelas (mig 193/194 intactas)
--   - RLS policies (já corretas)
--   - mig 195 view (já corrigida em mig 196)
--   - mig 197 post_actions (já revoke anon)
--   - `appointment_finalize` / hard gate / `appointment_attend`
--   - cron / worker 71 / wa_outbox / edge / env
-- =============================================================================

BEGIN;

-- appointment_procedure_items (mig 193)
REVOKE ALL ON public.appointment_procedure_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_procedure_items TO authenticated;
GRANT ALL ON public.appointment_procedure_items TO service_role;

COMMENT ON TABLE public.appointment_procedure_items IS
  'CRM_PARITY_R2 · linhas de procedimentos por agendamento (paridade com legacy _apptProcs[]). Single procedure preserva appointments.procedure_id/name como snapshot. Multi-procedure usa esta tabela exclusivamente. R5 hardening: zero anon grants (canon v2 mig 198).';

-- appointment_payments (mig 194)
REVOKE ALL ON public.appointment_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_payments TO authenticated;
GRANT ALL ON public.appointment_payments TO service_role;

COMMENT ON TABLE public.appointment_payments IS
  'CRM_PARITY_R2 · linhas de pagamento por agendamento (paridade com legacy _apptPagamentos[] + 10 formas canônicas). Single payment preserva appointments.payment_method/status como snapshot. Multi-payment usa esta tabela. R5 hardening: zero anon grants (canon v2 mig 198).';

COMMIT;

-- =============================================================================
-- END OF MIGRATION 198
-- =============================================================================
