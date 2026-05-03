-- Rollback Mig 99 · agressivo · DROP CASCADE em todas as 21 tabelas vazias.
-- Atenção: desfaz blindagem de RPCs · pode causar erros em dashboards.
DROP TABLE IF EXISTS public.facial_shares CASCADE;
DROP TABLE IF EXISTS public.facial_share_access_log CASCADE;
DROP TABLE IF EXISTS public.facial_analyses CASCADE;
DROP TABLE IF EXISTS public.fin_config CASCADE;
DROP TABLE IF EXISTS public.fin_annual_plan CASCADE;
DROP TABLE IF EXISTS public.clinic_alexa_log CASCADE;
DROP TABLE IF EXISTS public.retoque_campaigns CASCADE;
DROP TABLE IF EXISTS public.user_module_permissions CASCADE;
DROP TABLE IF EXISTS public.pluggy_connections CASCADE;
DROP TABLE IF EXISTS public.lead_tags CASCADE;
DROP TABLE IF EXISTS public.fm_storage_cleanup_queue CASCADE;
DROP TABLE IF EXISTS public.fm_share_rate_log CASCADE;
DROP TABLE IF EXISTS public.agenda_alerts_log CASCADE;
DROP TABLE IF EXISTS public.lp_consents CASCADE;
DROP TABLE IF EXISTS public.tag_conflicts CASCADE;
DROP TABLE IF EXISTS public.ai_interactions CASCADE;
DROP TABLE IF EXISTS public.automation_flows CASCADE;
DROP TABLE IF EXISTS public.automation_logs CASCADE;
DROP TABLE IF EXISTS public.broadcast_recipients CASCADE;
DROP TABLE IF EXISTS public.medical_record_attachments CASCADE;
DROP TABLE IF EXISTS public.lp_book_orders CASCADE;
