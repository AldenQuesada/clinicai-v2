-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 95 · clinicai-v2 · DROP unused zero-byte tables                ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Drop 23 tabelas que sao todas:                                           ║
-- ║   - 0 bytes (nunca foram populadas em prod)                              ║
-- ║   - UNUSED em todo codigo (Lara v2, Mira, dashboard legacy)              ║
-- ║   confirmadas pela auditoria 2026-05-03 (cross-reference em 2 repos).   ║
-- ║                                                                          ║
-- ║ Excludas desta lista (USED em algum lugar):                              ║
-- ║   - case_gallery, anamnesis_*, agenda_visibility, facial_photos          ║
-- ║     (ainda referenciadas em clinic-dashboard legacy · drop quando        ║
-- ║      legacy for retirado · ver project_b2b_legacy_retirement)            ║
-- ║                                                                          ║
-- ║ Doc: docs/audits/2026-05-03-database-audit.html secao 5                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP TABLE IF EXISTS public.agenda_alerts_log         CASCADE;
DROP TABLE IF EXISTS public.ai_interactions           CASCADE;
DROP TABLE IF EXISTS public.automation_flows          CASCADE;
DROP TABLE IF EXISTS public.automation_logs           CASCADE;
DROP TABLE IF EXISTS public.broadcast_recipients      CASCADE;
DROP TABLE IF EXISTS public.clinic_alexa_log          CASCADE;
DROP TABLE IF EXISTS public.facial_analyses           CASCADE;
DROP TABLE IF EXISTS public.facial_shares             CASCADE;
DROP TABLE IF EXISTS public.facial_share_access_log   CASCADE;
DROP TABLE IF EXISTS public.fin_annual_plan           CASCADE;
DROP TABLE IF EXISTS public.fin_config                CASCADE;
DROP TABLE IF EXISTS public.fm_share_rate_log         CASCADE;
DROP TABLE IF EXISTS public.fm_storage_cleanup_queue  CASCADE;
DROP TABLE IF EXISTS public.lead_tags                 CASCADE;
DROP TABLE IF EXISTS public.lp_book_orders            CASCADE;
DROP TABLE IF EXISTS public.lp_consents               CASCADE;
DROP TABLE IF EXISTS public.medical_record_attachments CASCADE;
DROP TABLE IF EXISTS public.nps_responses             CASCADE;
DROP TABLE IF EXISTS public.pluggy_connections        CASCADE;
DROP TABLE IF EXISTS public.tag_conflicts             CASCADE;
DROP TABLE IF EXISTS public.user_module_permissions   CASCADE;
DROP TABLE IF EXISTS public.vpi_celebrations          CASCADE;
DROP TABLE IF EXISTS public.retoque_campaigns         CASCADE;
