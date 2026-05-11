-- ============================================================================
-- FASE 2C.2 · POST-APPLY VALIDATION · payment_status cortesia contract
-- ============================================================================
-- Rode estas queries APÓS o apply da mig 152 e cole os outputs no chat.
-- Todas SELECT (zero mutação).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-1 · Constraint atual de payment_status
-- ─────────────────────────────────────────────────────────────────────────────
-- Esperado: ARRAY['pendente','parcial','pago','cortesia','isento']
SELECT
  c.conname,
  pg_get_constraintdef(c.oid) AS constraint_def
FROM pg_constraint c
WHERE c.conrelid = 'public.appointments'::regclass
  AND c.conname = 'chk_appt_payment_status';

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-2 · Distribuição de payment_status (sanity)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  payment_status,
  count(*) AS total
FROM public.appointments
WHERE deleted_at IS NULL
GROUP BY payment_status
ORDER BY payment_status;

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-3 · Valores fora do contrato (DEVE retornar zero linhas)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  payment_status,
  count(*) AS total
FROM public.appointments
WHERE payment_status IS NOT NULL
  AND payment_status NOT IN (
    'pendente',
    'parcial',
    'pago',
    'cortesia',
    'isento'
  )
GROUP BY payment_status;

-- ─────────────────────────────────────────────────────────────────────────────
-- VAL-4 · Tracker registra mig 152
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  version,
  name
FROM supabase_migrations.schema_migrations
WHERE version = '20260800000152';
