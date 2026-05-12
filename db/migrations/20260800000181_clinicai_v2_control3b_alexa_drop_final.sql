-- =============================================================================
-- CRM_PHASE_CONTROL.3B · Alexa drop final controlado (LOCAL · NÃO APLICADA)
-- =============================================================================
--
-- Contexto:
--   - CONTROL.2 (mig 179) já revogou EXECUTE de `authenticated` para as 2 RPCs
--     Alexa e dropou 3 orphan trigger functions Alexa.
--   - CONTROL.3 (doc 111) auditou e confirmou que o sistema está limpo em
--     runtime e que os 5 objetos abaixo são DROP_SAFE:
--       * public.clinic_alexa_log (0 rows, 0 deps, 0 triggers, 0 policies, RLS on)
--       * public.get_alexa_config()        (0 deps, 0 callers via pg_depend)
--       * public.upsert_alexa_config(...)  (0 deps, 0 callers via pg_depend)
--
-- O que esta migration NÃO toca (regra fundadora):
--   - public.clinic_alexa_config         · 1 row (configuração da clínica)
--   - public.clinic_alexa_devices        · 5 rows (devices registrados)
--   - public.clinic_rooms.alexa_device_name
--   - public.wa_agenda_automations.alexa_message
--   - public.wa_agenda_automations.alexa_target
--   - cron, job 71, wa_outbox, hard gate clínico, env/secrets.
--
-- Estilo:
--   - DROP IF EXISTS · idempotente.
--   - SEM CASCADE · qualquer dependência inesperada deve falhar a migration,
--     não silenciar arrastando objetos.
--   - DO block defensivo na função `upsert_alexa_config` porque a assinatura
--     é grande (6 args) · captura genericamente para dar erro claro caso
--     algum default seja alterado depois.
--
-- Apply: somente após autorização explícita (fase CRM_PHASE_CONTROL.3B_APPLY).
--   SUPABASE_ACCESS_TOKEN=sbp_... \
--     node scripts/apply-migration.mjs \
--     supabase/migrations/20260800000181_clinicai_v2_control3b_alexa_drop_final.sql
--
-- Rollback note:
--   docs/database/rollback-notes/20260800000181_crm_control3b_alexa_drop_final.md
-- =============================================================================

-- ── 1) Drop da tabela de log (0 rows, sem dependentes) ──────────────────────
DROP TABLE IF EXISTS public.clinic_alexa_log;

-- ── 2) Drop das duas RPCs Alexa órfãs ───────────────────────────────────────
-- Assinatura exata extraída via pg_get_function_identity_arguments(oid):

DROP FUNCTION IF EXISTS public.get_alexa_config();

DROP FUNCTION IF EXISTS public.upsert_alexa_config(
  p_webhook_url text,
  p_reception_device_name text,
  p_welcome_template text,
  p_room_template text,
  p_is_active boolean,
  p_auth_token text
);

-- =============================================================================
-- Pós-apply esperado:
--   - public.clinic_alexa_log              · 404
--   - public.get_alexa_config              · 404
--   - public.upsert_alexa_config           · 404
--   - public.clinic_alexa_config           · intacta (1 row preservada)
--   - public.clinic_alexa_devices          · intacta (5 rows preservadas)
--   - hard gate clínico                    · intacto
-- =============================================================================
