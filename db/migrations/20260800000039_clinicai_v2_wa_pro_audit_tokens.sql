-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-39 · clinicai-v2 · wa_pro_audit_log + tokens IA           ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Pedido Alden 2026-04-26: ONDA 1.5 · cada query do wa_pro pode disparar  ║
-- ║ IA (Anthropic). Hoje wa_pro_audit_log registra a query mas nao o custo  ║
-- ║ IA · sem visibilidade de quanto cada profissional consome.              ║
-- ║                                                                          ║
-- ║ Fix: ALTER TABLE wa_pro_audit_log adiciona:                             ║
-- ║   - tokens_in    bigint   · prompt + system + history                   ║
-- ║   - tokens_out   bigint   · completion                                  ║
-- ║   - model        text     · 'claude-haiku-4-5' / 'claude-sonnet-4-6'    ║
-- ║   - cost_usd     numeric  · custo computado client-side                 ║
-- ║                                                                          ║
-- ║ Idempotente · IF NOT EXISTS em todas as colunas.                         ║
-- ║                                                                          ║
-- ║ View v_wa_pro_cost_by_pro · agrupa custo por profissional/dia · permite  ║
-- ║ Configuracoes mostrar "Dr X consumiu R$ X em IA hoje".                   ║
-- ║                                                                          ║
-- ║ GOLD: SECURITY INVOKER em view (RLS herda do query), GRANT auth.        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- ALTER TABLE · adiciona colunas IA cost
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE public.wa_pro_audit_log
  ADD COLUMN IF NOT EXISTS tokens_in  bigint,
  ADD COLUMN IF NOT EXISTS tokens_out bigint,
  ADD COLUMN IF NOT EXISTS model      text,
  ADD COLUMN IF NOT EXISTS cost_usd   numeric(12, 6);

COMMENT ON COLUMN public.wa_pro_audit_log.tokens_in IS
  'Input tokens (prompt + system + history) consumidos · NULL se a query nao disparou IA';
COMMENT ON COLUMN public.wa_pro_audit_log.tokens_out IS
  'Output tokens (completion) consumidos · NULL se a query nao disparou IA';
COMMENT ON COLUMN public.wa_pro_audit_log.model IS
  'Modelo Anthropic usado · ex claude-haiku-4-5, claude-sonnet-4-6';
COMMENT ON COLUMN public.wa_pro_audit_log.cost_usd IS
  'Custo USD da chamada · client-side (input * input_rate + output * output_rate)';

-- ═══════════════════════════════════════════════════════════════════════
-- Index pra agrupamentos por profissional/data
-- ═══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_wa_pro_audit_pro_date
  ON public.wa_pro_audit_log (clinic_id, professional_id, created_at DESC)
  WHERE professional_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- View · custo agregado por profissional/dia · alimenta Configuracoes UI
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_wa_pro_cost_by_pro
WITH (security_invoker = true)
AS
SELECT
  clinic_id,
  professional_id,
  date_trunc('day', created_at)::date AS day_bucket,
  count(*) AS queries,
  count(*) FILTER (WHERE success = true) AS queries_ok,
  count(*) FILTER (WHERE tokens_in IS NOT NULL) AS ia_calls,
  COALESCE(sum(tokens_in), 0)::bigint AS tokens_in_total,
  COALESCE(sum(tokens_out), 0)::bigint AS tokens_out_total,
  COALESCE(sum(cost_usd), 0)::numeric(12, 4) AS cost_usd_total
  FROM public.wa_pro_audit_log
 WHERE professional_id IS NOT NULL
 GROUP BY clinic_id, professional_id, date_trunc('day', created_at)::date;

COMMENT ON VIEW public.v_wa_pro_cost_by_pro IS
  'Custo IA agregado por profissional/dia · usado em Configuracoes UI (mig 800-39).';

GRANT SELECT ON public.v_wa_pro_cost_by_pro TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- ASSERTS
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='wa_pro_audit_log'
       AND column_name='tokens_in'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: coluna tokens_in nao existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='wa_pro_audit_log'
       AND column_name='cost_usd'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: coluna cost_usd nao existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.views
     WHERE table_schema='public' AND table_name='v_wa_pro_cost_by_pro'
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL: view v_wa_pro_cost_by_pro nao criada';
  END IF;
  RAISE NOTICE '✅ Mig 800-39 OK · 4 colunas IA + view por pro';
END $$;

COMMIT;
