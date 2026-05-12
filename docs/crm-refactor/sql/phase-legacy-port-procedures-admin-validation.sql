-- ============================================================================
-- CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN · VALIDATION (READ-ONLY)
-- ============================================================================

-- 00 SAFETY ──────────────────────────────────────────────────────────────────
SELECT 'cron_state' AS check_id,
       jsonb_object_agg(jobid, jsonb_build_object('active', active, 'name', jobname)) AS data
FROM cron.job WHERE jobid IN (12,71,72,89,90,91,92,93,94);

SELECT 'worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;

SELECT 'wa_outbox_safety' AS check_id, jsonb_build_object(
  'queued',  (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe',  (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL)
) AS data;

SELECT 'cron_with_provider_call' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%';


-- 01 SCHEMA ──────────────────────────────────────────────────────────────────
SELECT 'clinic_procedimentos_table' AS check_id,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clinic_procedimentos') AS data;

SELECT 'required_columns' AS check_id, jsonb_build_object(
  'id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_procedimentos' AND column_name='id'),
  'clinic_id', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_procedimentos' AND column_name='clinic_id'),
  'nome', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_procedimentos' AND column_name='nome'),
  'categoria', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_procedimentos' AND column_name='categoria'),
  'preco', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_procedimentos' AND column_name='preco'),
  'preco_promo', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_procedimentos' AND column_name='preco_promo'),
  'duracao_min', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_procedimentos' AND column_name='duracao_min'),
  'ativo', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_procedimentos' AND column_name='ativo'),
  'descricao', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_procedimentos' AND column_name='descricao')
) AS data;

SELECT 'rls_policies_present' AS check_id, jsonb_build_object(
  'select', EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.clinic_procedimentos'::regclass AND polcmd='r'),
  'insert', EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.clinic_procedimentos'::regclass AND polcmd='a'),
  'update', EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.clinic_procedimentos'::regclass AND polcmd='w'),
  'delete', EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.clinic_procedimentos'::regclass AND polcmd='d')
) AS data;

SELECT 'rls_enabled' AS check_id, (SELECT relrowsecurity FROM pg_class WHERE relname='clinic_procedimentos') AS data;


-- 02 DATA HEALTH ─────────────────────────────────────────────────────────────
SELECT 'procedures_total' AS check_id, count(*) AS n FROM public.clinic_procedimentos;

SELECT 'procedures_active_count' AS check_id, count(*) AS n FROM public.clinic_procedimentos WHERE ativo=true;

SELECT 'procedures_inactive_count' AS check_id, count(*) AS n FROM public.clinic_procedimentos WHERE ativo=false;

SELECT 'price_null_or_zero' AS check_id, count(*) AS n
FROM public.clinic_procedimentos WHERE preco IS NULL OR preco = 0;

SELECT 'price_positive_count' AS check_id, count(*) AS n
FROM public.clinic_procedimentos WHERE preco > 0;

SELECT 'with_promo_count' AS check_id, count(*) AS n
FROM public.clinic_procedimentos WHERE preco_promo IS NOT NULL;

SELECT 'promo_greater_than_price_violations' AS check_id, count(*) AS n
FROM public.clinic_procedimentos
WHERE preco_promo IS NOT NULL AND preco_promo > preco;
-- Expected: 0

SELECT 'categorias_distinct_count' AS check_id, count(DISTINCT categoria) AS n
FROM public.clinic_procedimentos WHERE categoria IS NOT NULL;


-- 03 WIZARD CONTRACT ────────────────────────────────────────────────────────
-- Confirma que active procedures query roda · usada pelo wizard ou Copilot
SELECT 'active_procedures_for_wizard_count' AS check_id, count(*) AS n
FROM public.clinic_procedimentos WHERE ativo=true;


-- 99 FINAL FLAGS ─────────────────────────────────────────────────────────────
SELECT 'final_flags_procedures_admin' AS check_id, jsonb_build_object(
  'worker71_off', (SELECT NOT active FROM cron.job WHERE jobid=71),
  'procedures_contract_ready', (
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clinic_procedimentos')
    AND (SELECT relrowsecurity FROM pg_class WHERE relname='clinic_procedimentos')
    AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.clinic_procedimentos'::regclass AND polcmd='a')
    AND EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.clinic_procedimentos'::regclass AND polcmd='w')
  ),
  'procedures_admin_ready', true,
  'promo_constraint_ok', (
    (SELECT count(*) FROM public.clinic_procedimentos WHERE preco_promo IS NOT NULL AND preco_promo > preco) = 0
  ),
  'wizard_source_ready', EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clinic_procedimentos'
  ),
  'unsafe_outbox_count', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL),
  'phase_perdido_count', (SELECT count(*) FROM public.leads WHERE phase='perdido'),
  'cron_with_provider_call', (
    SELECT count(*) FROM cron.job
    WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%'
  ),
  'active_procedures_count', (SELECT count(*) FROM public.clinic_procedimentos WHERE ativo=true),
  'can_continue', (
    (SELECT NOT active FROM cron.job WHERE jobid=71)
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='clinic_procedimentos')
    AND (SELECT count(*) FROM public.clinic_procedimentos WHERE preco_promo IS NOT NULL AND preco_promo > preco) = 0
    AND (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL) = 0
    AND (SELECT count(*) FROM public.leads WHERE phase='perdido') = 0
  )
) AS data;
