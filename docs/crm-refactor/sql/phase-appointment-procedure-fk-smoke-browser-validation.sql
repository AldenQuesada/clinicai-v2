-- =============================================================================
-- CRM_PHASE_APPOINTMENT_PROCEDURE_FK_SMOKE_BROWSER · VALIDATION (READ-ONLY)
-- =============================================================================
-- Validation pode rodar em 2 momentos:
--   PRE-SUBMIT: confirma que o app está alinhado ao DB (estrutura, hard gate,
--               safety, catálogo).
--   POST-SUBMIT: depois que você criar 1 appointment manualmente via UI
--               (wizard `/crm/agenda/novo` selecionando procedimento do catálogo),
--               cole o id retornado em `:appointment_id` (use psql) ou em uma
--               variável e re-rode a seção 02 para confirmar o vínculo canônico.
--
-- ZERO WRITE. ZERO efeitos colaterais.
-- =============================================================================

-- 00 SAFETY · sempre verde antes de submit ──────────────────────────────────
SELECT 'safety' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'invalid_appointment_status_count', (SELECT count(*) FROM public.appointments WHERE status IS NOT NULL AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')),
  'cron_with_provider_call', (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%'),
  'baseline_outbox', (SELECT count(*) FROM public.wa_outbox)
) AS data;


-- 01 STRUCTURE · contrato dual presente ─────────────────────────────────────
SELECT 'structure' AS check_id, jsonb_build_object(
  'procedure_id_exists_remote', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_id'),
  'fk_present', EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='appointments_procedure_id_fkey'),
  'index_present', EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_appointments_procedure_id'),
  'procedure_name_present', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_name'),
  'tracker_182', (SELECT version FROM supabase_migrations.schema_migrations WHERE version='20260800000182')
) AS data;


-- 02 POST-SUBMIT INSPECT (rodar manualmente depois do smoke) ────────────────
-- Para usar: substitua o UUID abaixo pelo id real do appointment criado e
-- rode esta seção isoladamente.
--
-- Exemplo:
--   SELECT
--     a.id, a.procedure_id, a.procedure_name, a.status,
--     a.scheduled_date, a.start_time, a.end_time,
--     p.nome AS catalog_nome, p.categoria AS catalog_categoria,
--     (a.procedure_id IS NOT NULL) AS has_procedure_id,
--     (a.procedure_id IS NOT NULL AND p.id IS NOT NULL) AS fk_valid,
--     (a.procedure_name IS NOT NULL AND a.procedure_name != '') AS snapshot_present
--   FROM public.appointments a
--   LEFT JOIN public.clinic_procedimentos p ON p.id = a.procedure_id
--   WHERE a.id = '<COLE-AQUI>'::uuid;
--
-- E para safety pós-submit:
--   SELECT
--     'wa_outbox_delta_vs_baseline' AS check_id,
--     count(*) - <BASELINE_OUTBOX_DO_PREFLIGHT> AS data
--   FROM public.wa_outbox;
-- Espera-se 0.


-- 03 HARD GATE UNTOUCHED ────────────────────────────────────────────────────
SELECT 'hard_gate_untouched' AS check_id, (
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete')
  AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_anamnesis_form')
) AS data;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_smoke_browser' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'wa_outbox_delta', 0,
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'invalid_appointment_status_count', (
    SELECT count(*) FROM public.appointments
    WHERE status IS NOT NULL
      AND status NOT IN ('agendado','aguardando_confirmacao','confirmado','aguardando','na_clinica','em_atendimento','finalizado','remarcado','cancelado','no_show','bloqueado')
  ),
  'cron_with_provider_call', (
    SELECT count(*) FROM cron.job
    WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%'
  ),
  'hard_gate_untouched', (
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_clinical_gate_status')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_upsert')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_anamnesis_mark_complete')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='complete_anamnesis_form')
  ),
  'smoke_appointment_id', NULL,
  'smoke_appointment_has_procedure_id', NULL,
  'smoke_appointment_fk_valid', NULL,
  'smoke_appointment_snapshot_present', NULL,
  'mode', 'preflight_only · post_submit_pending_manual',
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
    AND (SELECT count(*) FROM cron.job WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%') = 0
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='procedure_id')
    AND EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conname='appointments_procedure_id_fkey')
    AND EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20260800000182')
    AND EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='appointment_finalize')
  )
) AS data;
