-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-08 · clinicai-v2 · voucher dispatch queue idempotency      ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Fix F1 (Worker queue idempotency anti-zumbi)                              ║
-- ║                                                                          ║
-- ║ Problema (auditoria 2026-04-25):                                         ║
-- ║   pickPending faz FOR UPDATE SKIP LOCKED (OK).                           ║
-- ║   complete()/fail() rodavam UPDATE sem checar status atual.              ║
-- ║                                                                          ║
-- ║ Cenario zumbi:                                                           ║
-- ║   Worker 1 pega item -> processing                                       ║
-- ║   b2b_voucher_issue() roda lento, demora 30s                            ║
-- ║   Outro processo (ou retry) chama fail() -> volta pra pending           ║
-- ║   Worker 2 pega o mesmo item -> processing (attempts=2)                  ║
-- ║   Worker 1 finalmente recebe response -> chama complete(queue_id, vid)   ║
-- ║   UPDATE roda em cima de status='processing' (de Worker 2!) -> done      ║
-- ║   Mas Worker 2 ainda esta emitindo voucher -> 2 vouchers, 1 queue done.  ║
-- ║                                                                          ║
-- ║ Fix:                                                                     ║
-- ║   1. ADD COLUMN processing_started_at timestamptz NULL                   ║
-- ║      -> permite circuit breaker (5min stuck = reset).                    ║
-- ║   2. pick   -> tambem SET processing_started_at = now().                 ║
-- ║   3. complete/fail -> WHERE status='processing' (idempotency guard).     ║
-- ║      Retorna ok=false + current_status quando 0 rows affected.           ║
-- ║   4. reset_stuck() -> resgata items 'processing' presos > 5min.          ║
-- ║      Worker chama antes de cada pick.                                    ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity), #10 (NOTIFY).            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1. Coluna processing_started_at ────────────────────────────────────────
ALTER TABLE public.b2b_voucher_dispatch_queue
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz NULL;

COMMENT ON COLUMN public.b2b_voucher_dispatch_queue.processing_started_at IS
  'Set pelo b2b_dispatch_queue_pick · usado pelo reset_stuck pra circuit breaker '
  '(items processing > 5min sao resetados pra pending). Mig 800-08.';

-- Indice parcial pro reset_stuck achar items presos rapido
CREATE INDEX IF NOT EXISTS idx_b2b_dispatch_queue_processing_started
  ON public.b2b_voucher_dispatch_queue (processing_started_at)
  WHERE status = 'processing';

-- ── 2. RPC pick · agora seta processing_started_at ─────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_dispatch_queue_pick(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_results jsonb := '[]'::jsonb;
  v_row     record;
  v_limit   int;
BEGIN
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 10), 100));

  FOR v_row IN
    UPDATE public.b2b_voucher_dispatch_queue
       SET status                = 'processing',
           attempts              = attempts + 1,
           last_attempt_at       = now(),
           processing_started_at = now()
     WHERE id IN (
       SELECT id FROM public.b2b_voucher_dispatch_queue
        WHERE status = 'pending'
          AND scheduled_at <= now()
        ORDER BY scheduled_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT v_limit
     )
    RETURNING id, clinic_id, partnership_id, recipient_name, recipient_phone,
              recipient_cpf, combo, notes, batch_id, attempts, submitted_by
  LOOP
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'queue_id',         v_row.id,
      'clinic_id',        v_row.clinic_id,
      'partnership_id',   v_row.partnership_id,
      'recipient_name',   v_row.recipient_name,
      'recipient_phone',  v_row.recipient_phone,
      'recipient_cpf',    v_row.recipient_cpf,
      'combo',            v_row.combo,
      'notes',            v_row.notes,
      'batch_id',         v_row.batch_id,
      'attempts',         v_row.attempts,
      'submitted_by',     v_row.submitted_by
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'items', v_results);
END
$$;

-- ── 3. RPC complete · idempotency guard (status='processing') ──────────────
CREATE OR REPLACE FUNCTION public.b2b_dispatch_queue_complete(
  p_queue_id   uuid,
  p_voucher_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count          int;
  v_current_status text;
BEGIN
  UPDATE public.b2b_voucher_dispatch_queue
     SET status                = 'done',
         voucher_id            = p_voucher_id,
         error_message         = NULL,
         last_attempt_at       = now(),
         processing_started_at = NULL
   WHERE id = p_queue_id
     AND status = 'processing';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    SELECT status INTO v_current_status
      FROM public.b2b_voucher_dispatch_queue
     WHERE id = p_queue_id
     LIMIT 1;
    RETURN jsonb_build_object(
      'ok',             false,
      'error',          'not_in_processing_state',
      'current_status', v_current_status,
      'updated',        0
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END
$$;

-- ── 4. RPC fail · idempotency guard (status='processing') ──────────────────
-- Increment attempts ja foi feito no pick · se >= 3, marca failed; senao volta pending.
CREATE OR REPLACE FUNCTION public.b2b_dispatch_queue_fail(
  p_queue_id uuid,
  p_error    text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_attempts       int;
  v_current_status text;
  v_new_status     text;
  v_count          int;
BEGIN
  -- Le row atual com lock leve · evita race com pick concorrente
  SELECT attempts, status
    INTO v_attempts, v_current_status
    FROM public.b2b_voucher_dispatch_queue
   WHERE id = p_queue_id
   FOR UPDATE
   LIMIT 1;

  IF v_attempts IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'queue_id_not_found');
  END IF;

  IF v_current_status IS DISTINCT FROM 'processing' THEN
    -- Item ja saiu do processing (race · reset_stuck atuou ou outro fail rolou)
    RETURN jsonb_build_object(
      'ok',             false,
      'error',          'not_in_processing_state',
      'current_status', v_current_status
    );
  END IF;

  IF v_attempts >= 3 THEN
    v_new_status := 'failed';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE public.b2b_voucher_dispatch_queue
     SET status                = v_new_status,
         error_message         = LEFT(COALESCE(p_error, 'unknown_error'), 1000),
         last_attempt_at       = now(),
         processing_started_at = NULL
   WHERE id = p_queue_id
     AND status = 'processing';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    -- Race extrema · status mudou entre o SELECT FOR UPDATE e o UPDATE.
    -- Improvavel mas defensivo.
    RETURN jsonb_build_object(
      'ok',    false,
      'error', 'race_status_changed_mid_fail'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',         true,
    'new_status', v_new_status,
    'attempts',   v_attempts
  );
END
$$;

-- ── 5. RPC reset_stuck · circuit breaker pros zumbis ───────────────────────
-- Items 'processing' com processing_started_at > 5min sao resetados pra pending.
-- Worker chama antes de cada pick. Retorna count + lista de queue_ids resetados
-- (caller loga warn pra investigacao).
CREATE OR REPLACE FUNCTION public.b2b_dispatch_queue_reset_stuck(
  p_threshold_minutes int DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_threshold int;
  v_count     int;
  v_ids       jsonb := '[]'::jsonb;
  v_row       record;
BEGIN
  v_threshold := GREATEST(1, LEAST(COALESCE(p_threshold_minutes, 5), 60));

  v_count := 0;
  FOR v_row IN
    UPDATE public.b2b_voucher_dispatch_queue
       SET status                = 'pending',
           processing_started_at = NULL,
           error_message         = COALESCE(error_message, '') ||
                                   ' [reset_stuck@' || now()::text || ']'
     WHERE status = 'processing'
       AND processing_started_at IS NOT NULL
       AND processing_started_at < now() - (v_threshold || ' minutes')::interval
    RETURNING id, attempts, processing_started_at
  LOOP
    v_count := v_count + 1;
    v_ids := v_ids || jsonb_build_array(jsonb_build_object(
      'queue_id',              v_row.id,
      'attempts',              v_row.attempts,
      'processing_started_at', v_row.processing_started_at
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok',          true,
    'reset_count', v_count,
    'threshold_minutes', v_threshold,
    'items',       v_ids
  );
END
$$;

-- ── Permissions ─────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.b2b_dispatch_queue_pick(int)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.b2b_dispatch_queue_complete(uuid, uuid)            TO service_role;
GRANT EXECUTE ON FUNCTION public.b2b_dispatch_queue_fail(uuid, text)                TO service_role;
GRANT EXECUTE ON FUNCTION public.b2b_dispatch_queue_reset_stuck(int)                TO service_role;

-- ── Sanity check ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_col          boolean;
  v_idx_proc     boolean;
  v_pick         boolean;
  v_complete     boolean;
  v_fail         boolean;
  v_reset        boolean;
  v_pick_def     text;
  v_complete_def text;
  v_fail_def     text;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='b2b_voucher_dispatch_queue'
       AND column_name='processing_started_at'
  ) INTO v_col;

  SELECT EXISTS(
    SELECT 1 FROM pg_indexes
     WHERE schemaname='public'
       AND indexname='idx_b2b_dispatch_queue_processing_started'
  ) INTO v_idx_proc;

  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_pick'
  ) INTO v_pick;
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_complete'
  ) INTO v_complete;
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_fail'
  ) INTO v_fail;
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_reset_stuck'
  ) INTO v_reset;

  -- Garante que o body novo das RPCs contem o guard 'processing_started_at'
  -- (sanity contra deploy que fica em mig 800-06 antiga).
  SELECT pg_get_functiondef(p.oid) INTO v_pick_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_pick';
  SELECT pg_get_functiondef(p.oid) INTO v_complete_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_complete';
  SELECT pg_get_functiondef(p.oid) INTO v_fail_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_fail';

  IF NOT (v_col AND v_idx_proc AND v_pick AND v_complete AND v_fail AND v_reset) THEN
    RAISE EXCEPTION 'Sanity 800-08 FAIL · col=% idx=% pick=% complete=% fail=% reset=%',
      v_col, v_idx_proc, v_pick, v_complete, v_fail, v_reset;
  END IF;

  IF v_pick_def NOT LIKE '%processing_started_at%' THEN
    RAISE EXCEPTION 'Sanity 800-08 FAIL · pick body sem processing_started_at';
  END IF;
  IF v_complete_def NOT LIKE '%not_in_processing_state%' THEN
    RAISE EXCEPTION 'Sanity 800-08 FAIL · complete body sem guard not_in_processing_state';
  END IF;
  IF v_fail_def NOT LIKE '%not_in_processing_state%' THEN
    RAISE EXCEPTION 'Sanity 800-08 FAIL · fail body sem guard not_in_processing_state';
  END IF;

  RAISE NOTICE 'Migration 800-08 OK · processing_started_at + 4 RPCs (pick/complete/fail/reset_stuck) com idempotency guard';
END $$;

NOTIFY pgrst, 'reload schema';
