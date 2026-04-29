-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║ Mig 800-82 · clinicai-v2 · orcamento_followup_pick RPC + columns          ║
-- ║                                                                            ║
-- ║ Pedido Camada 10a (Alden 2026-04-29): worker diario que pega orcamentos   ║
-- ║ "parados" (sent/viewed/followup/negotiation perto de expirar) e dispara   ║
-- ║ lembrete via WhatsApp. Pattern espelha lara_voucher_followup_pick (mig    ║
-- ║ 800-07/09) com lock atomico via picking_at + last_followup_at de 24h.     ║
-- ║                                                                            ║
-- ║ ALTER TABLE adiciona 2 colunas em orcamentos:                              ║
-- ║   - last_followup_at TIMESTAMPTZ NULL · ultima vez que mandamos lembrete  ║
-- ║   - picking_at       TIMESTAMPTZ NULL · lock atomico (libera em 5 min)    ║
-- ║                                                                            ║
-- ║ RPC `orcamento_followup_pick(p_batch_limit)`:                              ║
-- ║   - SELECTa candidatos elegiveis · UPDATE seta picking_at atomicamente    ║
-- ║   - LIMIT batch (default 10) · anti-avalanche                              ║
-- ║   - Retorna orcamento + bucket (recent/expiring/expiring_soon)            ║
-- ║                                                                            ║
-- ║ Worker em apps/lara/src/app/api/cron/orcamento-followup/ chama isso       ║
-- ║ 1x/dia (10h SP, schedule '0 13 * * *') via lara-crons.yml.                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ── 1. ALTER TABLE · 2 colunas novas ────────────────────────────────────────

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS last_followup_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS picking_at       TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.orcamentos.last_followup_at IS
  'Ultimo follow-up automatico enviado (cron orcamento-followup). NULL = nunca enviado.';
COMMENT ON COLUMN public.orcamentos.picking_at IS
  'Lock atomico do worker · setado pra now() durante UPDATE FOR; liberado em mark/clear. Stuck > 5min eh limpo.';

-- ── 2. Index de elegibilidade · acelera scan do picker ──────────────────────

CREATE INDEX IF NOT EXISTS idx_orc_followup_due
  ON public.orcamentos (clinic_id, status, valid_until)
  WHERE deleted_at IS NULL
    AND status IN ('sent', 'viewed', 'followup', 'negotiation')
    AND share_token IS NOT NULL;

COMMENT ON INDEX public.idx_orc_followup_due IS
  'Picker do orcamento_followup_pick · so indexa rows elegiveis (eligible-only partial index).';

-- ── 3. RPC orcamento_followup_pick ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.orcamento_followup_pick(
  p_batch_limit INT DEFAULT 10
)
RETURNS TABLE (
  orcamento_id    UUID,
  clinic_id       UUID,
  lead_id         UUID,
  patient_id      UUID,
  title           TEXT,
  total           NUMERIC,
  valid_until     DATE,
  share_token     TEXT,
  bucket          TEXT,         -- 'recent' | 'expiring' | 'expiring_soon'
  days_to_expire  INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
BEGIN
  IF p_batch_limit IS NULL OR p_batch_limit < 1 OR p_batch_limit > 100 THEN
    p_batch_limit := 10;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
      FROM public.orcamentos o
     WHERE o.deleted_at IS NULL
       AND o.status IN ('sent', 'viewed', 'followup', 'negotiation')
       AND o.share_token IS NOT NULL
       AND (o.lead_id IS NOT NULL OR o.patient_id IS NOT NULL)
       AND o.valid_until IS NOT NULL
       AND o.valid_until BETWEEN v_today AND (v_today + INTERVAL '7 days')::DATE
       AND (o.last_followup_at IS NULL OR o.last_followup_at < now() - INTERVAL '24 hours')
       AND (o.picking_at IS NULL OR o.picking_at < now() - INTERVAL '5 minutes')
     ORDER BY o.valid_until ASC, o.created_at ASC
     LIMIT p_batch_limit
     FOR UPDATE SKIP LOCKED
  ),
  locked AS (
    UPDATE public.orcamentos o
       SET picking_at = now()
     WHERE o.id IN (SELECT id FROM candidates)
    RETURNING
      o.id,
      o.clinic_id,
      o.lead_id,
      o.patient_id,
      o.title,
      o.total,
      o.valid_until,
      o.share_token
  )
  SELECT
    l.id                         AS orcamento_id,
    l.clinic_id,
    l.lead_id,
    l.patient_id,
    l.title,
    l.total,
    l.valid_until,
    l.share_token,
    CASE
      WHEN (l.valid_until - v_today) <= 1 THEN 'expiring_soon'
      WHEN (l.valid_until - v_today) <= 4 THEN 'expiring'
      ELSE 'recent'
    END                          AS bucket,
    (l.valid_until - v_today)    AS days_to_expire
  FROM locked l;
END;
$$;

GRANT EXECUTE ON FUNCTION public.orcamento_followup_pick(INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.orcamento_followup_pick(INT) IS
  'Picker atomico de orcamentos pra follow-up automatico. SKIP LOCKED + UPDATE picking_at evita race entre crons. Bucket determinado por dias-ate-validade · usado pelo worker pra escolher template.';

-- ── 4. Helper · libera locks stuck (cron crashou) ────────────────────────────

CREATE OR REPLACE FUNCTION public.orcamento_followup_clear_stuck(
  p_max_age_minutes INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_cleared INT;
BEGIN
  UPDATE public.orcamentos
     SET picking_at = NULL
   WHERE picking_at IS NOT NULL
     AND picking_at < now() - (p_max_age_minutes || ' minutes')::INTERVAL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  RETURN v_cleared;
END;
$$;

GRANT EXECUTE ON FUNCTION public.orcamento_followup_clear_stuck(INT) TO authenticated, service_role;

-- ── 5. Helper · marca follow-up enviado (libera lock + seta last_followup_at) ─

CREATE OR REPLACE FUNCTION public.orcamento_followup_mark_sent(
  p_orcamento_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_updated INT;
BEGIN
  UPDATE public.orcamentos
     SET last_followup_at = now(),
         picking_at = NULL,
         updated_at = now()
   WHERE id = p_orcamento_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.orcamento_followup_mark_sent(UUID) TO authenticated, service_role;

-- ── 6. Sanity check ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_func_count INT;
BEGIN
  SELECT COUNT(*) INTO v_func_count
    FROM pg_proc
   WHERE proname IN (
     'orcamento_followup_pick',
     'orcamento_followup_clear_stuck',
     'orcamento_followup_mark_sent'
   );
  IF v_func_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 followup functions, got %', v_func_count;
  END IF;

  -- Verifica colunas
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orcamentos'
      AND column_name = 'last_followup_at'
  ) THEN
    RAISE EXCEPTION 'last_followup_at not found in orcamentos';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orcamentos'
      AND column_name = 'picking_at'
  ) THEN
    RAISE EXCEPTION 'picking_at not found in orcamentos';
  END IF;
END;
$$;

COMMIT;
