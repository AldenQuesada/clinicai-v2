-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-06 · clinicai-v2 · b2b_voucher_dispatch_queue             ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Contexto: hoje vouchers B2B sao emitidos imediatamente via               ║
-- ║   b2b_voucher_issue(payload). Alden quer suportar BULK SUBMIT com       ║
-- ║   schedule (parceira manda lista no WhatsApp + dispatch agendado).      ║
-- ║                                                                          ║
-- ║ Esse item e infraestrutura base dos itens 6 (Bulk WhatsApp) e           ║
-- ║   7 (Bulk UI no admin Mira).                                             ║
-- ║                                                                          ║
-- ║ Schema:                                                                  ║
-- ║   b2b_voucher_dispatch_queue(                                            ║
-- ║     id, clinic_id, partnership_id,                                       ║
-- ║     recipient_name, recipient_phone, recipient_cpf?, combo?, notes?,     ║
-- ║     scheduled_at, status, voucher_id?, error_message?,                   ║
-- ║     attempts, last_attempt_at?, batch_id?, submitted_by?,                ║
-- ║     created_at, updated_at                                               ║
-- ║   )                                                                      ║
-- ║                                                                          ║
-- ║ status enum: pending | processing | done | failed | cancelled            ║
-- ║                                                                          ║
-- ║ RPCs:                                                                    ║
-- ║   b2b_dispatch_queue_enqueue(p_payload jsonb)                            ║
-- ║   b2b_dispatch_queue_pick(p_limit int)        -- FOR UPDATE SKIP LOCKED ║
-- ║   b2b_dispatch_queue_complete(p_queue_id, p_voucher_id)                  ║
-- ║   b2b_dispatch_queue_fail(p_queue_id, p_error)                           ║
-- ║   b2b_dispatch_queue_cancel_batch(p_batch_id)                            ║
-- ║                                                                          ║
-- ║ Retry policy: max 3 attempts · senao marca 'failed' · admin investiga.  ║
-- ║                                                                          ║
-- ║ GOLD #3 (search_path), #5 (.down), #7 (sanity), #10 (NOTIFY).            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Tabela ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_voucher_dispatch_queue (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid        NOT NULL DEFAULT public._default_clinic_id(),
  partnership_id   uuid        NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  recipient_name   text        NOT NULL,
  recipient_phone  text        NOT NULL,
  recipient_cpf    text        NULL,
  combo            text        NULL,
  notes            text        NULL,
  scheduled_at     timestamptz NOT NULL DEFAULT now(),
  status           text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','processing','done','failed','cancelled')),
  voucher_id       uuid        NULL REFERENCES public.b2b_vouchers(id) ON DELETE SET NULL,
  error_message    text        NULL,
  attempts         int         NOT NULL DEFAULT 0,
  last_attempt_at  timestamptz NULL,
  batch_id         uuid        NULL,
  submitted_by     text        NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.b2b_voucher_dispatch_queue IS
  'Fila de vouchers B2B agendados · worker /api/cron/b2b-voucher-dispatch-worker '
  'processa via FOR UPDATE SKIP LOCKED. Suporta bulk submit + schedule (mig 800-06).';

COMMENT ON COLUMN public.b2b_voucher_dispatch_queue.batch_id IS
  'Agrupador opcional pra bulk submit · permite cancel_batch e query "items do batch".';

COMMENT ON COLUMN public.b2b_voucher_dispatch_queue.submitted_by IS
  'Origem da entrada: partner_phone:55449... | admin_user:<uuid> | system:cron.';

-- ── Indices ─────────────────────────────────────────────────────────────
-- Cron worker · hot path: pending elegiveis ordenados por schedule
CREATE INDEX IF NOT EXISTS idx_b2b_dispatch_queue_pick
  ON public.b2b_voucher_dispatch_queue (status, scheduled_at)
  WHERE status = 'pending';

-- Listar items do batch (UI admin · "ver bulk submit X")
CREATE INDEX IF NOT EXISTS idx_b2b_dispatch_queue_batch
  ON public.b2b_voucher_dispatch_queue (batch_id)
  WHERE batch_id IS NOT NULL;

-- Listar fila por parceria + status (UI admin · "vouchers pendentes da Yasmim")
CREATE INDEX IF NOT EXISTS idx_b2b_dispatch_queue_partnership_status
  ON public.b2b_voucher_dispatch_queue (partnership_id, status);

-- ── RLS ────────────────────────────────────────────────────────────────
-- Service role apenas (worker + RPCs). UI admin chama RPCs.
ALTER TABLE public.b2b_voucher_dispatch_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_dispatch_queue_service_only" ON public.b2b_voucher_dispatch_queue;
CREATE POLICY "b2b_dispatch_queue_service_only" ON public.b2b_voucher_dispatch_queue
  FOR ALL USING (true) WITH CHECK (true);

-- ── Trigger updated_at ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._b2b_dispatch_queue_set_updated_at()
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

DROP TRIGGER IF EXISTS trg_b2b_dispatch_queue_updated_at ON public.b2b_voucher_dispatch_queue;
CREATE TRIGGER trg_b2b_dispatch_queue_updated_at
  BEFORE UPDATE ON public.b2b_voucher_dispatch_queue
  FOR EACH ROW
  EXECUTE FUNCTION public._b2b_dispatch_queue_set_updated_at();

-- ── RPC: enqueue ───────────────────────────────────────────────────────
-- Aceita payload bulk: { partnership_id, items: [{name, phone, cpf?, combo?, notes?}],
--                       scheduled_at?, batch_id?, submitted_by? }
-- Retorna: { ok, batch_id, count, items: [{queue_id, recipient_name}] }
CREATE OR REPLACE FUNCTION public.b2b_dispatch_queue_enqueue(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_partnership_id  uuid;
  v_clinic_id       uuid;
  v_scheduled_at    timestamptz;
  v_batch_id        uuid;
  v_submitted_by    text;
  v_items           jsonb;
  v_item            jsonb;
  v_queue_id        uuid;
  v_count           int := 0;
  v_results         jsonb := '[]'::jsonb;
  v_name            text;
  v_phone           text;
BEGIN
  -- Valida partnership_id
  v_partnership_id := NULLIF(p_payload->>'partnership_id', '')::uuid;
  IF v_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_id_required');
  END IF;

  -- Resolve clinic_id da parceria · multi-tenant strict
  SELECT clinic_id INTO v_clinic_id
    FROM public.b2b_partnerships
   WHERE id = v_partnership_id
   LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  -- Items obrigatorio · array nao vazio
  v_items := p_payload->'items';
  IF v_items IS NULL OR jsonb_typeof(v_items) != 'array' OR jsonb_array_length(v_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'items_required');
  END IF;

  -- scheduled_at default = now() (imediato)
  v_scheduled_at := COALESCE(NULLIF(p_payload->>'scheduled_at', '')::timestamptz, now());

  -- batch_id default = gera novo uuid pra agrupar essa submissao
  -- (caller pode passar pra reutilizar uuid ja conhecido)
  v_batch_id := COALESCE(NULLIF(p_payload->>'batch_id', '')::uuid, gen_random_uuid());

  v_submitted_by := NULLIF(p_payload->>'submitted_by', '');

  -- Inserts em loop · valida cada item
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    v_name  := NULLIF(trim(v_item->>'name'), '');
    v_phone := NULLIF(trim(v_item->>'phone'), '');

    IF v_name IS NULL OR v_phone IS NULL THEN
      -- Skip silently com erro no result · nao bloqueia bulk inteiro
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'ok',    false,
        'error', 'name_and_phone_required',
        'input', v_item
      ));
      CONTINUE;
    END IF;

    INSERT INTO public.b2b_voucher_dispatch_queue (
      clinic_id, partnership_id, recipient_name, recipient_phone, recipient_cpf,
      combo, notes, scheduled_at, batch_id, submitted_by
    ) VALUES (
      v_clinic_id,
      v_partnership_id,
      v_name,
      v_phone,
      NULLIF(v_item->>'cpf', ''),
      NULLIF(v_item->>'combo', ''),
      NULLIF(v_item->>'notes', ''),
      v_scheduled_at,
      v_batch_id,
      v_submitted_by
    ) RETURNING id INTO v_queue_id;

    v_count := v_count + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'ok',             true,
      'queue_id',       v_queue_id,
      'recipient_name', v_name
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok',           true,
    'batch_id',     v_batch_id,
    'count',        v_count,
    'scheduled_at', v_scheduled_at,
    'items',        v_results
  );
END
$$;

-- ── RPC: pick ───────────────────────────────────────────────────────────
-- Pega ate p_limit items pending elegiveis · marca como processing (FOR UPDATE
-- SKIP LOCKED pra concorrencia segura · multi-worker safe).
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
       SET status          = 'processing',
           attempts        = attempts + 1,
           last_attempt_at = now()
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

-- ── RPC: complete ──────────────────────────────────────────────────────
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
  v_count int;
BEGIN
  UPDATE public.b2b_voucher_dispatch_queue
     SET status          = 'done',
         voucher_id      = p_voucher_id,
         error_message   = NULL,
         last_attempt_at = now()
   WHERE id = p_queue_id
     AND status = 'processing';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_count > 0, 'updated', v_count);
END
$$;

-- ── RPC: fail ──────────────────────────────────────────────────────────
-- Increment attempts · se < 3, volta pra pending (retry); senao marca failed.
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
  v_attempts int;
  v_new_status text;
  v_count int;
BEGIN
  SELECT attempts INTO v_attempts
    FROM public.b2b_voucher_dispatch_queue
   WHERE id = p_queue_id
   LIMIT 1;
  IF v_attempts IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'queue_id_not_found');
  END IF;

  -- attempts ja foi incrementado no pick · se >= 3 marca failed, senao volta pending
  IF v_attempts >= 3 THEN
    v_new_status := 'failed';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE public.b2b_voucher_dispatch_queue
     SET status          = v_new_status,
         error_message   = LEFT(COALESCE(p_error, 'unknown_error'), 1000),
         last_attempt_at = now()
   WHERE id = p_queue_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',          v_count > 0,
    'new_status',  v_new_status,
    'attempts',    v_attempts
  );
END
$$;

-- ── RPC: cancel_batch ──────────────────────────────────────────────────
-- Marca todos pending do batch como cancelled · nao toca em processing/done/failed.
CREATE OR REPLACE FUNCTION public.b2b_dispatch_queue_cancel_batch(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  IF p_batch_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'batch_id_required');
  END IF;

  UPDATE public.b2b_voucher_dispatch_queue
     SET status        = 'cancelled',
         error_message = 'cancelled_by_caller',
         last_attempt_at = now()
   WHERE batch_id = p_batch_id
     AND status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'cancelled', v_count);
END
$$;

-- ── Permissions ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.b2b_dispatch_queue_enqueue(jsonb)            TO service_role;
GRANT EXECUTE ON FUNCTION public.b2b_dispatch_queue_pick(int)                 TO service_role;
GRANT EXECUTE ON FUNCTION public.b2b_dispatch_queue_complete(uuid, uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION public.b2b_dispatch_queue_fail(uuid, text)          TO service_role;
GRANT EXECUTE ON FUNCTION public.b2b_dispatch_queue_cancel_batch(uuid)        TO service_role;

-- ── Sanity check ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_table     boolean;
  v_enq       boolean;
  v_pick      boolean;
  v_complete  boolean;
  v_fail      boolean;
  v_cancel    boolean;
  v_trig      boolean;
  v_idx_pick  boolean;
  v_idx_batch boolean;
  v_idx_pst   boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables
                WHERE table_schema='public' AND table_name='b2b_voucher_dispatch_queue')
    INTO v_table;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_enqueue')
    INTO v_enq;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_pick')
    INTO v_pick;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_complete')
    INTO v_complete;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_fail')
    INTO v_fail;
  SELECT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                WHERE n.nspname='public' AND p.proname='b2b_dispatch_queue_cancel_batch')
    INTO v_cancel;
  SELECT EXISTS(SELECT 1 FROM pg_trigger
                WHERE tgname='trg_b2b_dispatch_queue_updated_at' AND NOT tgisinternal)
    INTO v_trig;
  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
                  AND indexname='idx_b2b_dispatch_queue_pick') INTO v_idx_pick;
  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
                  AND indexname='idx_b2b_dispatch_queue_batch') INTO v_idx_batch;
  SELECT EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
                  AND indexname='idx_b2b_dispatch_queue_partnership_status') INTO v_idx_pst;

  IF NOT (v_table AND v_enq AND v_pick AND v_complete AND v_fail AND v_cancel
          AND v_trig AND v_idx_pick AND v_idx_batch AND v_idx_pst) THEN
    RAISE EXCEPTION 'Sanity 800-06 FAIL · table=% enq=% pick=% complete=% fail=% cancel=% trig=% idx(pick=% batch=% pst=%)',
      v_table, v_enq, v_pick, v_complete, v_fail, v_cancel, v_trig,
      v_idx_pick, v_idx_batch, v_idx_pst;
  END IF;

  RAISE NOTICE 'Migration 800-06 OK · b2b_voucher_dispatch_queue + 5 RPCs + 3 indices + trigger';
END $$;

NOTIFY pgrst, 'reload schema';
