-- ============================================================================
-- FASE 2B.2 · POST-APPLY VALIDATION · appointment_finalize lost outcome
-- ============================================================================
-- Rode estas queries APÓS o apply da mig 151 e cole os outputs no chat.
-- Todas SELECT (zero mutação).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-1 · Definição completa da função pós-CREATE OR REPLACE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT pg_get_functiondef('public.appointment_finalize'::regproc) AS appointment_finalize_definition;

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-2 · Função aceita 'perdido' como outcome?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  position($$'perdido'$$ IN pg_get_functiondef(p.oid)) > 0 AS mentions_perdido_literal,
  position('paciente_orcamento' IN pg_get_functiondef(p.oid)) > 0 AS mentions_paciente_orcamento,
  position('lost_reason_required' IN pg_get_functiondef(p.oid)) > 0 AS validates_lost_reason,
  position('lost_requires_lead' IN pg_get_functiondef(p.oid)) > 0  AS validates_lost_needs_lead,
  position('lead_lost_failed' IN pg_get_functiondef(p.oid)) > 0    AS handles_lead_lost_failure
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_finalize';

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-3 · appointment_finalize chama lead_lost?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  position('public.lead_lost' IN pg_get_functiondef(p.oid)) > 0
    OR position(' lead_lost(' IN pg_get_functiondef(p.oid)) > 0
  AS calls_lead_lost
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_finalize';

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-4 · appointment_finalize NÃO escreve phase='perdido' diretamente
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  position($$phase            = 'perdido'$$ IN pg_get_functiondef(p.oid)) > 0
    OR position($$phase = 'perdido'$$ IN pg_get_functiondef(p.oid)) > 0
    OR position($$SET phase = 'perdido'$$ IN pg_get_functiondef(p.oid)) > 0
  AS sets_phase_perdido_directly
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_finalize';
-- Esperado: sets_phase_perdido_directly = false

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-5 · appointment_finalize NÃO altera public.leads diretamente
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  position('UPDATE public.leads' IN pg_get_functiondef(p.oid)) > 0
    OR position('UPDATE leads' IN pg_get_functiondef(p.oid)) > 0
  AS updates_leads_directly,
  position('INSERT INTO public.leads' IN pg_get_functiondef(p.oid)) > 0
    OR position('INSERT INTO leads' IN pg_get_functiondef(p.oid)) > 0
  AS inserts_leads_directly,
  position('DELETE FROM public.leads' IN pg_get_functiondef(p.oid)) > 0
    OR position('DELETE FROM leads' IN pg_get_functiondef(p.oid)) > 0
  AS deletes_leads_directly
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='appointment_finalize';
-- Esperado: todos false (leads só é tocada via sub-RPCs)

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-6 · lead_lost segue correta (lifecycle_status='perdido', NÃO phase)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  p.proname,
  position($$lifecycle_status = 'perdido'$$ IN pg_get_functiondef(p.oid)) > 0
    OR position($$lifecycle_status='perdido'$$ IN pg_get_functiondef(p.oid)) > 0
  AS sets_lifecycle_perdido,
  position($$phase = 'perdido'$$ IN pg_get_functiondef(p.oid)) > 0
    OR position($$phase='perdido'$$ IN pg_get_functiondef(p.oid)) > 0
  AS sets_phase_perdido,
  position('lost_from_phase' IN pg_get_functiondef(p.oid)) > 0 AS sets_lost_from_phase,
  position('lost_reason' IN pg_get_functiondef(p.oid)) > 0 AS sets_lost_reason
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname='lead_lost';
-- Esperado:
--   sets_lifecycle_perdido = true
--   sets_phase_perdido     = false
--   sets_lost_from_phase   = true
--   sets_lost_reason       = true

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-7 · Distribuição de appointments por status (sanity baseline)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT status, count(*) AS total
FROM public.appointments
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY total DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-8 · Distribuição de leads por lifecycle_status (sanity baseline)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT lifecycle_status, count(*) AS total
FROM public.leads
WHERE deleted_at IS NULL
GROUP BY lifecycle_status
ORDER BY total DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-9 · Contagem de leads lifecycle_status='perdido' (pode ser 0 pré-smoke)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  count(*)                                                  AS leads_lifecycle_perdido_total,
  count(*) FILTER (WHERE lost_reason IS NOT NULL)           AS with_reason,
  count(*) FILTER (WHERE lost_from_phase IS NOT NULL)       AS with_lost_from_phase,
  count(*) FILTER (WHERE lost_at IS NOT NULL)               AS with_lost_at,
  count(*) FILTER (WHERE deleted_at IS NOT NULL)            AS soft_deleted_too
FROM public.leads
WHERE lifecycle_status = 'perdido';

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-10 · Smoke helper · appointments candidatos a finalize=perdido manual
-- ─────────────────────────────────────────────────────────────────────────────
-- (Não muta · apenas lista pra escolha de smoke test E2E)
SELECT
  a.id              AS appointment_id,
  a.lead_id,
  l.name            AS lead_name,
  l.phone           AS lead_phone,
  a.status,
  a.scheduled_date,
  a.start_time
FROM public.appointments a
JOIN public.leads l ON l.id = a.lead_id AND l.deleted_at IS NULL
WHERE a.deleted_at IS NULL
  AND a.status IN ('na_clinica','em_atendimento')
  AND a.lead_id IS NOT NULL
ORDER BY a.scheduled_date DESC, a.start_time DESC
LIMIT 10;
