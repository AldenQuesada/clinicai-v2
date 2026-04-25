-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-11 · clinicai-v2 · webhook_processing_queue                ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Fix F4 (Webhook async · fast ack + background worker)                    ║
-- ║                                                                          ║
-- ║ Problema (auditoria 2026-04-25):                                         ║
-- ║   POST /api/webhook/evolution processa SEQUENCIAL:                       ║
-- ║     auth → parse → role → dedup → audio dl → Whisper → classify (Haiku) ║
-- ║     → handler dispatch → Evolution reply → audit                         ║
-- ║   Total tipico: 8-25s (audio + Whisper + Haiku custam 5-7s sozinhos)     ║
-- ║                                                                          ║
-- ║ Cenario do bug:                                                          ║
-- ║   Dani manda 26 vouchers em 90s · cada webhook leva 8-15s                ║
-- ║   3 webhooks simultaneos = thundering herd                                ║
-- ║   1 timeout (Meta/Evolution timeout=25s) = retry com novo messageId      ║
-- ║   = dedup wa_message_id NAO pega = duplicacao                            ║
-- ║                                                                          ║
-- ║ Fix: webhook responde HTTP 202 em <500ms                                 ║
-- ║   1. Pre-validacao sincrona (auth + parse + role + dedup) · ~200ms       ║
-- ║   2. INSERT em webhook_processing_queue · ~100ms                         ║
-- ║   3. Return 202 · cliente Evolution recebe ack < 500ms total             ║
-- ║   4. Cron worker (cada 1min) drena queue · pickPending(5)                ║
-- ║      e roda audio + Whisper + classify + handler + reply em background. ║
-- ║                                                                          ║
-- ║ Idempotency:                                                             ║
-- ║   wa_message_id UNIQUE · INSERT ON CONFLICT DO NOTHING.                  ║
-- ║   Se Evolution retentar com novo messageId, dedup state existente        ║
-- ║   (mig 800-02 __processed__:msgId TTL 2h) ja bloqueia upstream.          ║
-- ║                                                                          ║
-- ║ Schema:                                                                  ║
-- ║   webhook_processing_queue(                                              ║
-- ║     id, clinic_id, source, phone, wa_message_id (UNIQUE), payload, role, ║
-- ║     status, attempts, processing_started_at, processed_at, error_message,║
-- ║     created_at, updated_at                                               ║
-- ║   )                                                                      ║
-- ║                                                                          ║
-- ║ status enum: pending | processing | done | failed | skipped              ║
-- ║                                                                          ║
-- ║ RPCs (mesmo padrao 800-06/08):                                           ║
-- ║   webhook_queue_enqueue(p_payload jsonb)                                 ║
-- ║   webhook_queue_pick(p_limit int default 5)                              ║
-- ║   webhook_queue_complete(p_id uuid)                                      ║
-- ║   webhook_queue_fail(p_id uuid, p_error text)                            ║
-- ║   webhook_queue_reset_stuck(p_threshold_minutes int default 5)           ║
-- ║                                                                          ║
-- ║ Retry policy: max 3 attempts · senao 'failed'.                           ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity), #10 (NOTIFY).            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Tabela ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_processing_queue (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              uuid        NOT NULL DEFAULT public._default_clinic_id(),
  source                 text        NOT NULL
                                       CHECK (source IN ('evolution','meta_cloud')),
  phone                  text        NOT NULL,
  wa_message_id          text        NOT NULL,
  payload                jsonb       NOT NULL,
  role                   text        NULL
                                       CHECK (role IS NULL OR role IN ('admin','partner')),
  status                 text        NOT NULL DEFAULT 'pending'
                                       CHECK (status IN ('pending','processing','done','failed','skipped')),
  attempts               int         NOT NULL DEFAULT 0,
  processing_started_at  timestamptz NULL,
  processed_at           timestamptz NULL,
  error_message          text        NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: wa_message_id e unique-per-source · INSERT ON CONFLICT DO NOTHING
-- garante que retry do Evolution nao enfileira a mesma mensagem 2x.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_webhook_queue_wa_message_id
  ON public.webhook_processing_queue (source, wa_message_id);

COMMENT ON TABLE public.webhook_processing_queue IS
  'Fila assincrona de processamento de webhooks WhatsApp (Evolution/Meta Cloud). '
  'Webhook responde 202 + INSERT aqui · cron worker drena (mig 800-11).';

COMMENT ON COLUMN public.webhook_processing_queue.payload IS
  'Payload completo do webhook · worker reprocessa audio/classify/handler off the hot path.';

COMMENT ON COLUMN public.webhook_processing_queue.role IS
  'Role pre-resolvido pelo webhook sincrono (admin/partner) · evita query repetida no worker.';

-- ── Indices ──────────────────────────────────────────────────────────────
-- Cron worker · hot path: pending elegiveis ordenados por chegada
CREATE INDEX IF NOT EXISTS idx_webhook_queue_pick
  ON public.webhook_processing_queue (status, created_at)
  WHERE status = 'pending';

-- Circuit breaker · achar items processing presos rapido
CREATE INDEX IF NOT EXISTS idx_webhook_queue_processing_started
  ON public.webhook_processing_queue (processing_started_at)
  WHERE status = 'processing';

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Service role apenas (worker + RPCs). Sem UI direta.
ALTER TABLE public.webhook_processing_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "webhook_queue_service_only" ON public.webhook_processing_queue;
CREATE POLICY "webhook_queue_service_only" ON public.webhook_processing_queue
  FOR ALL USING (true) WITH CHECK (true);

-- ── Trigger updated_at ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._webhook_queue_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_webhook_queue_updated_at ON public.webhook_processing_queue;
CREATE TRIGGER trg_webhook_queue_updated_at
  BEFORE UPDATE ON public.webhook_processing_queue
  FOR EACH ROW
  EXECUTE FUNCTION public._webhook_queue_set_updated_at();

-- ── RPC: enqueue ────────────────────────────────────────────────────────
-- Aceita payload: { source, phone, wa_message_id, role?, payload }
-- ON CONFLICT (source, wa_message_id) DO NOTHING · idempotency em retry.
-- Retorna: { ok, id, enqueued (true se INSERT, false se conflito) }
CREATE OR REPLACE FUNCTION public.webhook_queue_enqueue(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_source        text;
  v_phone         text;
  v_wa_message_id text;
  v_role          text;
  v_payload_inner jsonb;
  v_id            uuid;
  v_clinic_id     uuid;
BEGIN
  v_source := NULLIF(p_payload->>'source', '');
  IF v_source IS NULL OR v_source NOT IN ('evolution','meta_cloud') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source');
  END IF;

  v_phone := NULLIF(p_payload->>'phone', '');
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_required');
  END IF;

  v_wa_message_id := NULLIF(p_payload->>'wa_message_id', '');
  IF v_wa_message_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wa_message_id_required');
  END IF;

  v_payload_inner := p_payload->'payload';
  IF v_payload_inner IS NULL OR jsonb_typeof(v_payload_inner) NOT IN ('object','array') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payload_required');
  END IF;

  v_role := NULLIF(p_payload->>'role', '');
  IF v_role IS NOT NULL AND v_role NOT IN ('admin','partner') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  -- Multi-tenant: clinic_id resolvido server-side (mono-clinica P1).
  v_clinic_id := public._default_clinic_id();

  INSERT INTO public.webhook_processing_queue (
    clinic_id, source, phone, wa_message_id, payload, role
  ) VALUES (
    v_clinic_id, v_source, v_phone, v_wa_message_id, v_payload_inner, v_role
  )
  ON CONFLICT (source, wa_message_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Conflict · ja existe um item pra essa msg · idempotente
    SELECT id INTO v_id
      FROM public.webhook_processing_queue
     WHERE source = v_source AND wa_message_id = v_wa_message_id
     LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'enqueued', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'enqueued', true);
END
$$;

-- ── RPC: pick ───────────────────────────────────────────────────────────
-- Pega ate p_limit pending elegiveis · marca processing + processing_started_at.
-- FOR UPDATE SKIP LOCKED · multi-worker safe.
CREATE OR REPLACE FUNCTION public.webhook_queue_pick(p_limit int DEFAULT 5)
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
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 5), 50));

  FOR v_row IN
    UPDATE public.webhook_processing_queue
       SET status                = 'processing',
           attempts              = attempts + 1,
           processing_started_at = now()
     WHERE id IN (
       SELECT id FROM public.webhook_processing_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT v_limit
     )
    RETURNING id, clinic_id, source, phone, wa_message_id, payload, role, attempts
  LOOP
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'id',             v_row.id,
      'clinic_id',      v_row.clinic_id,
      'source',         v_row.source,
      'phone',          v_row.phone,
      'wa_message_id',  v_row.wa_message_id,
      'payload',        v_row.payload,
      'role',           v_row.role,
      'attempts',       v_row.attempts
    ));
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'items', v_results);
END
$$;

-- ── RPC: complete ───────────────────────────────────────────────────────
-- Idempotency guard · so atualiza WHERE status='processing' (mig 800-08 pattern).
CREATE OR REPLACE FUNCTION public.webhook_queue_complete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count          int;
  v_current_status text;
BEGIN
  UPDATE public.webhook_processing_queue
     SET status                = 'done',
         processed_at          = now(),
         processing_started_at = NULL,
         error_message         = NULL
   WHERE id = p_id
     AND status = 'processing';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    SELECT status INTO v_current_status
      FROM public.webhook_processing_queue
     WHERE id = p_id
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

-- ── RPC: fail ───────────────────────────────────────────────────────────
-- Increment ja foi feito no pick · se >= 3 marca failed, senao volta pending.
-- Idempotency guard · so atualiza WHERE status='processing'.
CREATE OR REPLACE FUNCTION public.webhook_queue_fail(
  p_id    uuid,
  p_error text
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
  SELECT attempts, status
    INTO v_attempts, v_current_status
    FROM public.webhook_processing_queue
   WHERE id = p_id
   FOR UPDATE
   LIMIT 1;

  IF v_attempts IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'queue_id_not_found');
  END IF;

  IF v_current_status IS DISTINCT FROM 'processing' THEN
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

  UPDATE public.webhook_processing_queue
     SET status                = v_new_status,
         error_message         = LEFT(COALESCE(p_error, 'unknown_error'), 1000),
         processing_started_at = NULL
   WHERE id = p_id
     AND status = 'processing';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
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

-- ── RPC: reset_stuck ────────────────────────────────────────────────────
-- Resgata items 'processing' presos > p_threshold_minutes (default 5) pra pending.
-- Worker chama antes de cada pick. Mesma logica da mig 800-08.
CREATE OR REPLACE FUNCTION public.webhook_queue_reset_stuck(
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
    UPDATE public.webhook_processing_queue
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
    'ok',                v_count >= 0,
    'reset_count',       v_count,
    'threshold_minutes', v_threshold,
    'items',             v_ids
  );
END
$$;

-- ── Permissions ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.webhook_queue_enqueue(jsonb)        TO service_role;
GRANT EXECUTE ON FUNCTION public.webhook_queue_pick(int)             TO service_role;
GRANT EXECUTE ON FUNCTION public.webhook_queue_complete(uuid)        TO service_role;
GRANT EXECUTE ON FUNCTION public.webhook_queue_fail(uuid, text)      TO service_role;
GRANT EXECUTE ON FUNCTION public.webhook_queue_reset_stuck(int)      TO service_role;

-- ── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_table        boolean;
  v_uniq         boolean;
  v_idx_pick     boolean;
  v_idx_proc     boolean;
  v_trig         boolean;
  v_enq          boolean;
  v_pick         boolean;
  v_complete     boolean;
  v_fail         boolean;
  v_reset        boolean;
  v_pick_def     text;
  v_complete_def text;
  v_fail_def     text;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='webhook_processing_queue')
    INTO v_table;
  SELECT EXISTS(SELECT 1 FROM pg_indexes
                 WHERE schemaname='public' AND indexname='uniq_webhook_queue_wa_message_id')
    INTO v_uniq;
  SELECT EXISTS(SELECT 1 FROM pg_indexes
                 WHERE schemaname='public' AND indexname='idx_webhook_queue_pick')
    INTO v_idx_pick;
  SELECT EXISTS(SELECT 1 FROM pg_indexes
                 WHERE schemaname='public' AND indexname='idx_webhook_queue_processing_started')
    INTO v_idx_proc;
  SELECT EXISTS(SELECT 1 FROM pg_trigger
                 WHERE tgname='trg_webhook_queue_updated_at' AND NOT tgisinternal)
    INTO v_trig;

  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='webhook_queue_enqueue') INTO v_enq;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='webhook_queue_pick') INTO v_pick;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='webhook_queue_complete') INTO v_complete;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='webhook_queue_fail') INTO v_fail;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='webhook_queue_reset_stuck') INTO v_reset;

  -- Bodies preserva guards
  SELECT pg_get_functiondef(p.oid) INTO v_pick_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='webhook_queue_pick';
  SELECT pg_get_functiondef(p.oid) INTO v_complete_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='webhook_queue_complete';
  SELECT pg_get_functiondef(p.oid) INTO v_fail_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='webhook_queue_fail';

  IF NOT (v_table AND v_uniq AND v_idx_pick AND v_idx_proc AND v_trig
          AND v_enq AND v_pick AND v_complete AND v_fail AND v_reset) THEN
    RAISE EXCEPTION 'Sanity 800-11 FAIL · table=% uniq=% idx_pick=% idx_proc=% trig=% enq=% pick=% complete=% fail=% reset=%',
      v_table, v_uniq, v_idx_pick, v_idx_proc, v_trig,
      v_enq, v_pick, v_complete, v_fail, v_reset;
  END IF;

  IF v_pick_def NOT LIKE '%processing_started_at%' THEN
    RAISE EXCEPTION 'Sanity 800-11 FAIL · pick body sem processing_started_at';
  END IF;
  IF v_complete_def NOT LIKE '%not_in_processing_state%' THEN
    RAISE EXCEPTION 'Sanity 800-11 FAIL · complete body sem guard not_in_processing_state';
  END IF;
  IF v_fail_def NOT LIKE '%not_in_processing_state%' THEN
    RAISE EXCEPTION 'Sanity 800-11 FAIL · fail body sem guard not_in_processing_state';
  END IF;

  RAISE NOTICE 'Migration 800-11 OK · webhook_processing_queue + 5 RPCs (enqueue/pick/complete/fail/reset_stuck) + 2 indices + uniq + trigger';
END $$;

NOTIFY pgrst, 'reload schema';
