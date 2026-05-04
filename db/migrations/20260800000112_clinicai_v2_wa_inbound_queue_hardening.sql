-- ============================================================================
-- wa_inbound_queue · hardening + complement RPCs (Tier 1 do Plano de Robustez)
-- ============================================================================
--
-- Contexto: tabela `wa_inbound_queue` + RPC `wa_inbound_queue_pick` foram criados
-- ad-hoc via Studio (não em mig). Schema/picker corretos mas com 3 problemas:
--
-- 🔴 CRÍTICO (security): RPC tinha GRANT EXECUTE pra anon, authenticated, PUBLIC
--    → atacante com URL do projeto chamava POST /rest/v1/rpc/wa_inbound_queue_pick
--    → roubava toda fila de DMs de pacientes (LGPD breach).
--
-- 🟡 MÉDIO: RPC sem SECURITY DEFINER + SET search_path · ADR-029 violado.
--
-- 🟡 MÉDIO: faltavam RPCs pra worker marcar done/failed/requeue.
--
-- O que esta mig faz:
--   1. Adiciona 3 colunas obs: last_error, worker_id, started_at
--   2. Recria pick com SECURITY DEFINER + search_path + worker_id param + sets started_at
--   3. Adiciona complete(id), fail(id, error), requeue_stuck(max_age_min)
--   4. REVOKE EXECUTE FROM anon, authenticated, PUBLIC nas 4 RPCs
--   5. GRANT EXECUTE TO service_role only
--   6. RLS ON na tabela · authenticated SELECT só admin/owner · service_role bypass
--   7. Sanity check final
--
-- Idempotente · pode rodar múltiplas vezes.

BEGIN;

-- ── 1. Colunas de observability ────────────────────────────────────────────

ALTER TABLE public.wa_inbound_queue
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.wa_inbound_queue.last_error IS
  'Error message do worker · setada por wa_inbound_queue_fail · NULL em sucesso.';
COMMENT ON COLUMN public.wa_inbound_queue.worker_id IS
  'Identificador do worker que pegou o job · útil pra debug multi-worker.';
COMMENT ON COLUMN public.wa_inbound_queue.started_at IS
  'Quando o pick aconteceu · permite cálculo de stuck (now() - started_at > N min).';

-- Index pra requeue de stuck (jobs em processing há muito tempo)
CREATE INDEX IF NOT EXISTS idx_wa_inbound_queue_processing_started
  ON public.wa_inbound_queue (started_at)
  WHERE status = 'processing';

-- ── 2. PICK · com hardening + worker_id + started_at ──────────────────────

CREATE OR REPLACE FUNCTION public.wa_inbound_queue_pick(
  p_limit INT DEFAULT 10,
  p_worker_id TEXT DEFAULT NULL
)
RETURNS SETOF public.wa_inbound_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH target AS (
    SELECT id FROM public.wa_inbound_queue
    WHERE status = 'pending'
      AND attempts < 5
    ORDER BY created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.wa_inbound_queue q
  SET status = 'processing',
      attempts = q.attempts + 1,
      worker_id = p_worker_id,
      started_at = NOW(),
      last_error = NULL
  FROM target
  WHERE q.id = target.id
  RETURNING q.*;
END;
$$;

COMMENT ON FUNCTION public.wa_inbound_queue_pick(INT, TEXT) IS
  'Pega N jobs pending · marca processing + start_at · FOR UPDATE SKIP LOCKED.';

-- ── 3. COMPLETE · marca job como done + processed_at ──────────────────────

CREATE OR REPLACE FUNCTION public.wa_inbound_queue_complete(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  UPDATE public.wa_inbound_queue
  SET status = 'completed',
      processed_at = NOW(),
      last_error = NULL
  WHERE id = p_id
    AND status = 'processing';
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.wa_inbound_queue_complete(UUID) IS
  'Marca job como completed. Idempotente · só atualiza se status=processing.';

-- ── 4. FAIL · marca job como failed (se attempts esgotados) ou volta pra
--    pending pra retry. Worker passa o erro pra log.

CREATE OR REPLACE FUNCTION public.wa_inbound_queue_fail(
  p_id UUID,
  p_error TEXT,
  p_max_attempts INT DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_attempts INT;
BEGIN
  -- Se attempts >= max, marca failed (sem retry). Caso contrário volta pending.
  UPDATE public.wa_inbound_queue
  SET status = CASE WHEN attempts >= p_max_attempts THEN 'failed' ELSE 'pending' END,
      last_error = p_error,
      processed_at = CASE WHEN attempts >= p_max_attempts THEN NOW() ELSE NULL END
  WHERE id = p_id
    AND status = 'processing'
  RETURNING attempts INTO v_attempts;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.wa_inbound_queue_fail(UUID, TEXT, INT) IS
  'Marca job como failed (após max attempts) ou pending (pra retry). Idempotente.';

-- ── 5. REQUEUE STUCK · libera jobs órfãos (worker morreu sem complete/fail)

CREATE OR REPLACE FUNCTION public.wa_inbound_queue_requeue_stuck(
  p_max_age_min INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.wa_inbound_queue
  SET status = 'pending',
      worker_id = NULL,
      started_at = NULL,
      last_error = 'requeued_stuck:' || COALESCE(worker_id, 'unknown')
  WHERE status = 'processing'
    AND started_at < NOW() - (p_max_age_min || ' minutes')::INTERVAL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.wa_inbound_queue_requeue_stuck(INT) IS
  'Libera jobs em processing há > N min (worker crashou). Rodar via pg_cron a cada 5min.';

-- ── 6. SECURITY · revoke anon/authenticated/PUBLIC · grant service_role ───

REVOKE ALL ON FUNCTION public.wa_inbound_queue_pick(INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_inbound_queue_complete(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_inbound_queue_fail(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wa_inbound_queue_requeue_stuck(INT) FROM PUBLIC, anon, authenticated;

-- Drop assinatura antiga (1-arg) caso ainda exista · era a versão exposta
DROP FUNCTION IF EXISTS public.wa_inbound_queue_pick(INT);

GRANT EXECUTE ON FUNCTION public.wa_inbound_queue_pick(INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_inbound_queue_complete(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_inbound_queue_fail(UUID, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.wa_inbound_queue_requeue_stuck(INT) TO service_role;

-- ── 7. RLS na tabela · admin/owner SELECT · service_role bypass ───────────

ALTER TABLE public.wa_inbound_queue ENABLE ROW LEVEL SECURITY;

-- Defensivo · drop policies antigas (re-rodável)
DROP POLICY IF EXISTS "wa_inbound_queue_admin_select" ON public.wa_inbound_queue;
DROP POLICY IF EXISTS "wa_inbound_queue_block_writes" ON public.wa_inbound_queue;

CREATE POLICY "wa_inbound_queue_admin_select"
ON public.wa_inbound_queue
FOR SELECT
TO authenticated
USING (
  clinic_id = public.app_clinic_id()
  AND public.app_role() IN ('owner', 'admin')
);

-- Bloqueia INSERT/UPDATE/DELETE pra authenticated (só service_role escreve)
CREATE POLICY "wa_inbound_queue_block_writes"
ON public.wa_inbound_queue
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- Revoke direct table privileges from anon (defesa em profundidade)
REVOKE ALL ON public.wa_inbound_queue FROM anon, PUBLIC;
GRANT SELECT ON public.wa_inbound_queue TO authenticated; -- RLS faz o resto
GRANT ALL ON public.wa_inbound_queue TO service_role;

-- ── 8. Sanity check ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_anon_grants INT;
  v_definer_count INT;
BEGIN
  -- Confirma que anon NÃO tem mais EXECUTE em nenhuma das 4 RPCs
  SELECT count(*) INTO v_anon_grants
  FROM information_schema.role_routine_grants
  WHERE routine_schema='public'
    AND routine_name LIKE 'wa_inbound_queue_%'
    AND grantee IN ('anon', 'PUBLIC');

  IF v_anon_grants > 0 THEN
    RAISE EXCEPTION 'mig 112 SECURITY FAIL · % grants pra anon/PUBLIC ainda ativos', v_anon_grants;
  END IF;

  -- Confirma que as 4 RPCs estão SECURITY DEFINER
  SELECT count(*) INTO v_definer_count
  FROM pg_proc
  WHERE pronamespace='public'::regnamespace
    AND proname IN ('wa_inbound_queue_pick', 'wa_inbound_queue_complete',
                    'wa_inbound_queue_fail', 'wa_inbound_queue_requeue_stuck')
    AND prosecdef = true;

  IF v_definer_count <> 4 THEN
    RAISE EXCEPTION 'mig 112 · esperado 4 RPCs SECURITY DEFINER, encontrou %', v_definer_count;
  END IF;

  RAISE NOTICE 'mig 112 · sanity OK · 4 RPCs DEFINER · zero grants pra anon · RLS enabled';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
