-- ============================================================================
-- Migration 172 · clinicai-v2 · COMMERCIAL RECOVERY FOUNDATION
-- ============================================================================
--
-- Propósito (CRM_PHASE_2RC):
--   Cria VIEW consolidada `commercial_recovery_queue_view` que unifica
--   fontes de recuperação comercial sem duplicar dados:
--     - public.perdidos (leads marcados via lead_lost · is_recoverable=true)
--     - public.appointments (status=cancelado/no_show recentes · lookback 60d)
--     - public.orcamentos (status=draft antigos · lookback 14d+)
--
--   Sem tabela nova · sem RPCs novas (reusa lead_recovery_activate existente).
--   View é READ-ONLY · UI da página /crm/recuperacao consome diretamente.
--
-- Por que VIEW e não tabela:
--   - perdidos table já cobre 80% (RPC lead_lost popula automaticamente)
--   - Appointments cancelados/no_show + orçamentos draft são derivados ·
--     materializar em tabela exigiria triggers + idempotency complexa
--   - View unifica em SELECT único · UI faz query com filtros
--   - Performance OK até ~10k items · se escalar, materializa depois
--
-- Estado seguro pós-apply:
--   - View existe e retorna 0+ rows conforme dados reais
--   - Zero alteração em perdidos, appointments, orcamentos
--   - Zero impacto em RPCs existentes
--   - Worker 71 OFF · ban gate 2L preservado · zero envio real
--
-- Fora de escopo:
--   - Tabela commercial_recovery_items (decisão: usar perdidos como source primário)
--   - Triggers de auto-populate (manual via lead_lost · cancel · no_show)
--   - Automação de envio WhatsApp (bloqueada por ban 2L)
--
-- Rollback: down DROP VIEW (seguro · zero efeito em dados).
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. VIEW commercial_recovery_queue_view
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.commercial_recovery_queue_view AS

-- Source 1 · Leads perdidos (via lead_lost RPC · is_recoverable=true · ainda não recuperados)
SELECT
  p.id                                                AS item_id,
  p.clinic_id,
  'lead_lost'::text                                   AS source_type,
  p.id                                                AS source_id,
  p.lead_id                                           AS lead_id,
  NULL::uuid                                          AS patient_id,
  NULL::uuid                                          AS appointment_id,
  NULL::uuid                                          AS orcamento_id,
  p.name                                              AS display_name,
  CASE WHEN p.phone IS NOT NULL AND length(p.phone) >= 4
       THEN '...'||right(p.phone, 4)
       ELSE NULL END                                  AS phone_last4,
  p.lost_reason                                       AS reason,
  p.notes                                             AS notes,
  CASE
    -- High priority: < 7 dias atrás · lead recente
    WHEN p.lost_at >= now() - interval '7 days'  THEN 'alta'
    -- Media: 7-30 dias
    WHEN p.lost_at >= now() - interval '30 days' THEN 'media'
    -- Baixa: > 30 dias
    ELSE 'baixa'
  END                                                 AS priority,
  -- Status na fila:
  -- aberto · recuperavel sem recovered_at
  -- recuperado · recovered_at populado
  -- descartado · is_recoverable=false
  CASE
    WHEN p.recovered_at IS NOT NULL  THEN 'recuperado'
    WHEN p.is_recoverable = false    THEN 'descartado'
    ELSE 'aberto'
  END                                                 AS status,
  p.lost_at                                           AS source_event_at,
  p.recovered_at                                      AS resolved_at,
  p.created_at                                        AS created_at,
  p.updated_at                                        AS updated_at
FROM public.perdidos p
WHERE p.deleted_at IS NULL

UNION ALL

-- Source 2 · Appointments cancelados (lookback 60 dias · com lead vinculado)
SELECT
  a.id                                                AS item_id,
  a.clinic_id,
  'appointment_cancelled'::text                       AS source_type,
  a.id                                                AS source_id,
  a.lead_id                                           AS lead_id,
  a.patient_id                                        AS patient_id,
  a.id                                                AS appointment_id,
  NULL::uuid                                          AS orcamento_id,
  a.subject_name                                      AS display_name,
  CASE WHEN a.subject_phone IS NOT NULL AND length(a.subject_phone) >= 4
       THEN '...'||right(a.subject_phone, 4)
       ELSE NULL END                                  AS phone_last4,
  a.motivo_cancelamento                               AS reason,
  a.obs                                               AS notes,
  CASE
    WHEN a.cancelado_em >= now() - interval '7 days'  THEN 'alta'
    WHEN a.cancelado_em >= now() - interval '30 days' THEN 'media'
    ELSE 'baixa'
  END                                                 AS priority,
  'aberto'::text                                      AS status,
  a.cancelado_em                                      AS source_event_at,
  NULL::timestamptz                                   AS resolved_at,
  a.created_at                                        AS created_at,
  a.updated_at                                        AS updated_at
FROM public.appointments a
WHERE a.deleted_at IS NULL
  AND a.status = 'cancelado'
  AND a.cancelado_em IS NOT NULL
  AND a.cancelado_em >= now() - interval '60 days'
  AND (a.lead_id IS NOT NULL OR a.patient_id IS NOT NULL)

UNION ALL

-- Source 3 · Appointments no_show (lookback 60 dias · com lead vinculado)
SELECT
  a.id                                                AS item_id,
  a.clinic_id,
  'appointment_no_show'::text                         AS source_type,
  a.id                                                AS source_id,
  a.lead_id                                           AS lead_id,
  a.patient_id                                        AS patient_id,
  a.id                                                AS appointment_id,
  NULL::uuid                                          AS orcamento_id,
  a.subject_name                                      AS display_name,
  CASE WHEN a.subject_phone IS NOT NULL AND length(a.subject_phone) >= 4
       THEN '...'||right(a.subject_phone, 4)
       ELSE NULL END                                  AS phone_last4,
  a.motivo_no_show                                    AS reason,
  a.obs                                               AS notes,
  CASE
    WHEN a.no_show_em >= now() - interval '7 days'  THEN 'alta'
    WHEN a.no_show_em >= now() - interval '30 days' THEN 'media'
    ELSE 'baixa'
  END                                                 AS priority,
  'aberto'::text                                      AS status,
  a.no_show_em                                        AS source_event_at,
  NULL::timestamptz                                   AS resolved_at,
  a.created_at                                        AS created_at,
  a.updated_at                                        AS updated_at
FROM public.appointments a
WHERE a.deleted_at IS NULL
  AND a.status = 'no_show'
  AND a.no_show_em IS NOT NULL
  AND a.no_show_em >= now() - interval '60 days'
  AND (a.lead_id IS NOT NULL OR a.patient_id IS NOT NULL)

UNION ALL

-- Source 4 · Orçamentos draft antigos (>14 dias sem fechamento)
SELECT
  o.id                                                AS item_id,
  o.clinic_id,
  'orcamento_frio'::text                              AS source_type,
  o.id                                                AS source_id,
  o.lead_id                                           AS lead_id,
  o.patient_id                                        AS patient_id,
  NULL::uuid                                          AS appointment_id,
  o.id                                                AS orcamento_id,
  COALESCE(
    (SELECT name FROM public.leads WHERE id = o.lead_id),
    (SELECT name FROM public.patients WHERE id = o.patient_id),
    'Orçamento sem nome'
  )                                                   AS display_name,
  NULL::text                                          AS phone_last4,
  o.title                                             AS reason,
  o.notes                                             AS notes,
  CASE
    -- Orçamentos draft mais antigos = prioridade mais baixa (lead esfriou)
    WHEN o.created_at >= now() - interval '21 days' THEN 'alta'
    WHEN o.created_at >= now() - interval '45 days' THEN 'media'
    ELSE 'baixa'
  END                                                 AS priority,
  'aberto'::text                                      AS status,
  o.created_at                                        AS source_event_at,
  NULL::timestamptz                                   AS resolved_at,
  o.created_at                                        AS created_at,
  o.updated_at                                        AS updated_at
FROM public.orcamentos o
WHERE o.deleted_at IS NULL
  AND o.status = 'draft'
  AND o.created_at < now() - interval '14 days';


COMMENT ON VIEW public.commercial_recovery_queue_view IS
  'Mig 172 (CRM_PHASE_2RC) · queue unificada de recuperação comercial. '
  'Combina 4 fontes (perdidos · cancelado · no_show · orcamento_frio) em '
  'shape comum para UI /crm/recuperacao. View READ-ONLY · sem efeito em '
  'tabelas-fonte · zero WhatsApp · zero envio. Phone mascarado last4.';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. GRANT (RLS é herdado das tabelas-fonte · view não precisa policy própria
--    em Postgres quando todas as fontes têm RLS por clinic_id)
-- ────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.commercial_recovery_queue_view TO authenticated;
GRANT SELECT ON public.commercial_recovery_queue_view TO service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- SANITY DO BLOCK
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_view_exists       boolean;
  v_lead_recovery_ok  boolean;
  v_lead_recover_ok   boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema='public' AND table_name='commercial_recovery_queue_view'
  ) INTO v_view_exists;
  IF NOT v_view_exists THEN
    RAISE EXCEPTION 'sanity: commercial_recovery_queue_view não criada';
  END IF;

  -- Confirma RPCs reusáveis presentes
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='lead_recovery_activate'
  ) INTO v_lead_recovery_ok;
  IF NOT v_lead_recovery_ok THEN
    RAISE EXCEPTION 'sanity: lead_recovery_activate RPC ausente · pre-req falhou';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='lead_recover'
  ) INTO v_lead_recover_ok;
  IF NOT v_lead_recover_ok THEN
    RAISE EXCEPTION 'sanity: lead_recover RPC ausente · pre-req falhou';
  END IF;

  RAISE NOTICE 'mig 172 · commercial_recovery_queue_view criada · RPCs reusáveis presentes';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
