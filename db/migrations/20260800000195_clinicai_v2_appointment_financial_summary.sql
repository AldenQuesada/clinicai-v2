-- =============================================================================
-- CRM_PARITY_R2 · Migration 195 · view appointment_financial_summary
-- =============================================================================
--
-- Propósito: view read-only que agrega items/payments por appointment para
-- UI/relatórios. Centraliza derivação de `payment_status` baseado em items
-- (net_total) + payments (paid_total).
--
-- Não substitui `appointments.payment_status` (mantido como snapshot/agregado
-- editável manualmente). View é canônica para read-only · UI pode usar para
-- comparar e exibir saldo.
--
-- Derived status rules:
--   - net_total = 0 AND has_courtesy_item → 'cortesia'
--   - net_total = 0 AND NOT has_courtesy_item → 'pendente' (nada a cobrar e
--     nada cortesia · estado neutro)
--   - net_total > 0 AND paid_total = 0 → 'pendente'
--   - net_total > 0 AND 0 < paid_total < net_total → 'parcial'
--   - net_total > 0 AND paid_total >= net_total → 'pago'
--
-- O que esta migration NÃO faz:
--   - Não modifica tabelas existentes
--   - Não cria trigger (view é read-only)
--   - Não toca cron / worker / wa_outbox / hard gate
--
-- Apply: somente após migs 193+194 aplicadas.
-- Rollback: down migration drop view.
-- =============================================================================

BEGIN;

-- security_invoker = true · RLS herda das tabelas-base (appointments,
-- appointment_procedure_items, appointment_payments) por chamada do
-- caller, nunca como owner. Sem este flag, view bypassa RLS e vaza
-- cross-clinic. Padrão "GOLD" documentado em mig 39 e usado em todas
-- as views v2 (126, 128, 129, 130, 145, 146, 147, ai_budget).
-- ⚠ Estrutura crítica · pré-agregar items e payments SEPARADAMENTE antes do
-- JOIN para evitar produto cartesiano (N items × M payments = N×M linhas no
-- join · SUMs/COUNTs ficariam inflados pelo fator do outro lado).
-- Descoberto em Phase D6 smoke (2026-05-18): 2 items + 2 payments retornavam
-- gross=300 quando esperado 150, paid=200 quando esperado 100.
CREATE OR REPLACE VIEW public.appointment_financial_summary
WITH (security_invoker = true) AS
WITH items_agg AS (
  SELECT
    appointment_id,
    clinic_id,
    SUM(gross_amount)::numeric(12,2)    AS gross_total,
    SUM(discount_amount)::numeric(12,2) AS discount_total,
    SUM(net_amount)::numeric(12,2)      AS net_total,
    COUNT(*)::int                       AS procedure_items_count,
    COUNT(*) FILTER (WHERE is_courtesy)::int AS courtesy_items_count,
    MAX(updated_at)                     AS items_updated_at
  FROM public.appointment_procedure_items
  WHERE deleted_at IS NULL
  GROUP BY appointment_id, clinic_id
),
payments_agg AS (
  SELECT
    appointment_id,
    clinic_id,
    SUM(amount) FILTER (WHERE status = 'pago')::numeric(12,2)      AS paid_total,
    SUM(amount) FILTER (WHERE status = 'pendente')::numeric(12,2)  AS pending_total,
    SUM(amount) FILTER (WHERE status = 'cancelado')::numeric(12,2) AS cancelled_total,
    COUNT(*)::int                                                  AS payments_count,
    MAX(updated_at)                                                AS payments_updated_at
  FROM public.appointment_payments
  WHERE deleted_at IS NULL
  GROUP BY appointment_id, clinic_id
)
SELECT
  a.id            AS appointment_id,
  a.clinic_id     AS clinic_id,

  COALESCE(i.gross_total, 0)::numeric(12,2)         AS gross_total,
  COALESCE(i.discount_total, 0)::numeric(12,2)      AS discount_total,
  COALESCE(i.net_total, 0)::numeric(12,2)           AS net_total,
  COALESCE(i.procedure_items_count, 0)              AS procedure_items_count,
  COALESCE(i.courtesy_items_count, 0)               AS courtesy_items_count,

  COALESCE(pa.paid_total, 0)::numeric(12,2)         AS paid_total,
  COALESCE(pa.pending_total, 0)::numeric(12,2)      AS pending_total,
  COALESCE(pa.cancelled_total, 0)::numeric(12,2)    AS cancelled_total,
  COALESCE(pa.payments_count, 0)                    AS payments_count,

  -- Balance · net (após items aggregate) - paid (após payments aggregate)
  (COALESCE(i.net_total, 0) - COALESCE(pa.paid_total, 0))::numeric(12,2) AS balance_total,

  -- Derived payment_status canon Phase 1C
  CASE
    WHEN COALESCE(i.net_total, 0) = 0
      AND COALESCE(i.courtesy_items_count, 0) > 0
      THEN 'cortesia'
    WHEN COALESCE(i.net_total, 0) = 0
      THEN 'pendente'
    WHEN COALESCE(pa.paid_total, 0) = 0
      THEN 'pendente'
    WHEN COALESCE(pa.paid_total, 0) < COALESCE(i.net_total, 0) - 0.01
      THEN 'parcial'
    ELSE 'pago'
  END AS derived_payment_status,

  GREATEST(
    a.updated_at,
    COALESCE(i.items_updated_at, a.updated_at),
    COALESCE(pa.payments_updated_at, a.updated_at)
  ) AS computed_at

FROM public.appointments a
LEFT JOIN items_agg i
  ON i.appointment_id = a.id AND i.clinic_id = a.clinic_id
LEFT JOIN payments_agg pa
  ON pa.appointment_id = a.id AND pa.clinic_id = a.clinic_id
WHERE a.deleted_at IS NULL;

-- ── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON VIEW public.appointment_financial_summary IS
  'CRM_PARITY_R2 · agregado read-only de items+payments por appointment. derived_payment_status canônico: cortesia/pendente/parcial/pago.';

-- ── GRANTs · view inherits RLS from base tables ──────────────────────────────
--
-- IMPORTANTE · `REVOKE ALL FROM anon` PRIMEIRO. Supabase aplica default ACL no
-- schema `public` que pode conceder privs a `anon` automaticamente. Mesmo
-- sendo functionally safe (security_invoker + RLS), canon v2 é ZERO anon em
-- views (alinhado a crm_operational_view, v_ai_budget_today, wa_*_audit_view).
-- Mig 196 reforça em migration corretiva separada · este bloco aqui garante
-- defesa em profundidade dentro do próprio arquivo 195.

REVOKE ALL ON public.appointment_financial_summary FROM anon;
GRANT SELECT ON public.appointment_financial_summary TO authenticated;
GRANT SELECT ON public.appointment_financial_summary TO service_role;

COMMIT;

-- =============================================================================
-- END OF MIGRATION 195
-- =============================================================================
