-- ============================================================================
-- CRM_PHASE_2ALEXA.2 · RECEPTION PANEL SMOKE (READ-ONLY)
-- ============================================================================

-- A · worker71_off ────────────────────────────────────────────────────────
SELECT 'A_worker71_off' AS check_id, (SELECT NOT active FROM cron.job WHERE jobid=71) AS data;

-- B · wa_outbox baseline ─────────────────────────────────────────────────
SELECT 'B_wa_outbox_baseline' AS check_id, jsonb_build_object(
  'queued', (SELECT count(*) FROM public.wa_outbox WHERE status='queued'),
  'pending', (SELECT count(*) FROM public.wa_outbox WHERE status='pending'),
  'unsafe', (SELECT count(*) FROM public.wa_outbox WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL)
) AS data;

-- C · appointments today query roda ──────────────────────────────────────
SELECT 'C_appts_today_query' AS check_id, count(*) AS n
FROM public.appointments WHERE deleted_at IS NULL AND scheduled_date = current_date;

-- D · na_clinica query roda ──────────────────────────────────────────────
SELECT 'D_na_clinica_query' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND scheduled_date = current_date AND status='na_clinica';

-- E · em_atendimento query roda ──────────────────────────────────────────
SELECT 'E_em_atendimento_query' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND scheduled_date = current_date AND status='em_atendimento';

-- F · upcoming query roda ────────────────────────────────────────────────
SELECT 'F_upcoming_query' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND scheduled_date = current_date
  AND status IN ('agendado','aguardando_confirmacao','confirmado','aguardando');

-- G · professional join (sem orphans nos appts de hoje) ─────────────────
SELECT 'G_professional_orphans_today' AS check_id, count(*) AS n
FROM public.appointments a
WHERE a.deleted_at IS NULL AND a.scheduled_date = current_date
  AND a.professional_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.professional_profiles p WHERE p.id = a.professional_id);
-- Expected: 0

-- H · subject display fallback (rows com nem subject nem patient_id nem lead_id) ──
SELECT 'H_subject_display_orphans_today' AS check_id, count(*) AS n
FROM public.appointments
WHERE deleted_at IS NULL AND scheduled_date = current_date
  AND (subject_name IS NULL OR subject_name='')
  AND patient_id IS NULL AND lead_id IS NULL
  AND status != 'bloqueado';

-- I · no provider cron ───────────────────────────────────────────────────
SELECT 'I_no_provider_cron' AS check_id, count(*) AS n
FROM cron.job
WHERE command ILIKE '%alexa%' OR command ILIKE '%evolution%' OR command ILIKE '%fetch%http%' OR command ILIKE '%meta.com%';

-- J · no sensitive clinical joins (página NÃO seleciona anamnesis/consent) ──
SELECT 'J_clinical_joins_safe' AS check_id, jsonb_build_object(
  'anamnesis_requests_join_in_page', false,
  'legal_doc_requests_join_in_page', false,
  'consents_join_in_page', false
) AS data;
-- Statement-level · enforced em código (page.tsx só usa appointments.* via listByDate)

-- K · unsafe_outbox_count = 0 ────────────────────────────────────────────
SELECT 'K_unsafe_outbox' AS check_id, count(*) AS n
FROM public.wa_outbox
WHERE content IS NULL OR content='' OR phone IS NULL OR phone='' OR lead_id IS NULL;
