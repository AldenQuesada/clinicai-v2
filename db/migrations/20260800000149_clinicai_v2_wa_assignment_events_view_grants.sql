-- =============================================================================
-- 20260800000149_clinicai_v2_wa_assignment_events_view_grants.sql
-- Hardening de grants da view criada na Mig 148:
--   public.wa_conversation_assignment_events_view
-- =============================================================================
--
-- Contexto:
-- Mig 148 criou a view semantica · grants iniciais foram corrigidos
-- manualmente no Supabase em 2026-05-08. Esta migration versiona EXATAMENTE
-- o estado atual de permissoes (banco primeiro · audit confirmou):
--   authenticated · SELECT · NO grantable
--   service_role  · SELECT · NO grantable
--   anon          · ausente (sem privilegio nenhum)
--
-- Por que importa:
--   - View expõe historico de assignments (audit trail · pode conter
--     metadata sensivel de operadora/Dra). anon NAO pode ler.
--   - REVOKE ALL FROM PUBLIC garante que role default nao herda SELECT.
--   - GRANT SELECT a authenticated · zero is_grantable (nao pode delegar).
--
-- Idempotente:
--   REVOKE em role sem privilegio = no-op silencioso
--   GRANT em role que ja tem o mesmo privilegio = no-op silencioso
--   BEGIN/COMMIT em transacao unica · safe rerun.
--
-- Aplicacao manual em prod (gold-standard pra grants/views · convencao
-- mig 126-148).
-- =============================================================================

BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.wa_conversation_assignment_events_view FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.wa_conversation_assignment_events_view FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.wa_conversation_assignment_events_view FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.wa_conversation_assignment_events_view FROM service_role;

GRANT SELECT ON TABLE public.wa_conversation_assignment_events_view TO authenticated;
GRANT SELECT ON TABLE public.wa_conversation_assignment_events_view TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- =============================================================================
-- FIM · 20260800000149 · Aplicacao manual em prod ja realizada · este
-- arquivo versiona o estado atual + permite rerun idempotente.
-- =============================================================================
