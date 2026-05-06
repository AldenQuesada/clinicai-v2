-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-131 · clinicai-v2 · b2b_voucher_audio_queue                ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Versiona a fila de despacho assincrono de audio de voucher (audit       ║
-- ║ 2026-05-06). DDL ja aplicado em prod manualmente · esta mig serve       ║
-- ║ pra versionar no repo + permitir reaplicar em ambientes novos.           ║
-- ║                                                                          ║
-- ║ Snapshot de producao validado:                                           ║
-- ║   1. b2b_voucher_audio_queue (15 cols · status check · attempts check ·  ║
-- ║      unique voucher_id · 2 indexes).                                     ║
-- ║   2. b2b_voucher_dispatch_errors (9 cols com clinic_id/reason/detail/    ║
-- ║      payload/resolved_at/resolved_by · 2 indexes).                       ║
-- ║   3. Trigger AFTER INSERT _b2b_voucher_audio_after_insert · ENFILEIRA    ║
-- ║      apenas (zero net.http_post · worker faz dispatch).                  ║
-- ║   4. Worker b2b_voucher_audio_queue_dispatch_pending(int) · pickPending  ║
-- ║      FOR UPDATE SKIP LOCKED · POST edge · marca dispatched/requeue/      ║
-- ║      failed · loga em b2b_voucher_dispatch_errors com reason+detail+     ║
-- ║      payload (sqlstate, queue_id, attempts).                             ║
-- ║   5. Cron `b2b-voucher-audio-queue-dispatch-every-minute` chamando       ║
-- ║      worker(5) a cada 1min.                                              ║
-- ║                                                                          ║
-- ║ Idempotente · CREATE TABLE IF NOT EXISTS · ALTER TABLE ADD COLUMN        ║
-- ║ IF NOT EXISTS · DO blocks com guards · CREATE INDEX IF NOT EXISTS ·     ║
-- ║ CREATE OR REPLACE FUNCTION · DROP TRIGGER + CREATE.                      ║
-- ║                                                                          ║
-- ║ ADR-029: SECURITY DEFINER + SET search_path · GRANT explicito           ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · pgrst reload          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CREATE TABLE b2b_voucher_audio_queue
--    Schema validado em producao · 15 colunas · sem dispatch_error_count.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.b2b_voucher_audio_queue (
  id                     uuid        NOT NULL DEFAULT gen_random_uuid(),
  clinic_id              uuid        NOT NULL,
  voucher_id             uuid        NOT NULL,
  status                 text        NOT NULL DEFAULT 'pending',
  scheduled_at           timestamptz NOT NULL DEFAULT now(),
  attempts               integer     NOT NULL DEFAULT 0,
  max_attempts           integer     NOT NULL DEFAULT 5,
  processing_started_at  timestamptz NULL,
  last_attempt_at        timestamptz NULL,
  dispatched_at          timestamptz NULL,
  request_id             bigint      NULL,
  error_message          text        NULL,
  payload                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2b_voucher_audio_queue_pkey PRIMARY KEY (id)
);

-- Idempotente · cobre caso de tabela existente sem alguma coluna nova.
ALTER TABLE public.b2b_voucher_audio_queue ADD COLUMN IF NOT EXISTS payload                jsonb       NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.b2b_voucher_audio_queue ADD COLUMN IF NOT EXISTS processing_started_at  timestamptz NULL;
ALTER TABLE public.b2b_voucher_audio_queue ADD COLUMN IF NOT EXISTS last_attempt_at        timestamptz NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Constraints b2b_voucher_audio_queue (DO block · guards)
-- ═══════════════════════════════════════════════════════════════════════════

DO $constraints_queue$
BEGIN
  -- FK voucher_id -> b2b_vouchers(id) ON DELETE CASCADE
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.b2b_voucher_audio_queue'::regclass
      AND conname  = 'b2b_voucher_audio_queue_voucher_id_fkey'
  ) THEN
    ALTER TABLE public.b2b_voucher_audio_queue
      ADD CONSTRAINT b2b_voucher_audio_queue_voucher_id_fkey
      FOREIGN KEY (voucher_id) REFERENCES public.b2b_vouchers(id) ON DELETE CASCADE;
  END IF;

  -- status check · 5 valores permitidos
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.b2b_voucher_audio_queue'::regclass
      AND conname  = 'b2b_voucher_audio_queue_status_check'
  ) THEN
    ALTER TABLE public.b2b_voucher_audio_queue
      ADD CONSTRAINT b2b_voucher_audio_queue_status_check
      CHECK (status IN ('pending', 'processing', 'dispatched', 'failed', 'cancelled'));
  END IF;

  -- attempts check · alinha com producao (sem attempts <= max_attempts)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.b2b_voucher_audio_queue'::regclass
      AND conname  = 'b2b_voucher_audio_queue_attempts_check'
  ) THEN
    ALTER TABLE public.b2b_voucher_audio_queue
      ADD CONSTRAINT b2b_voucher_audio_queue_attempts_check
      CHECK (attempts >= 0 AND max_attempts >= 1);
  END IF;

  -- unique voucher_id · 1 fila por voucher · trigger ON CONFLICT reenfileira.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.b2b_voucher_audio_queue'::regclass
      AND conname  = 'b2b_voucher_audio_queue_voucher_id_uniq'
  ) THEN
    ALTER TABLE public.b2b_voucher_audio_queue
      ADD CONSTRAINT b2b_voucher_audio_queue_voucher_id_uniq UNIQUE (voucher_id);
  END IF;
END
$constraints_queue$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Indexes b2b_voucher_audio_queue · alinhados com producao
--    pending: (status, scheduled_at, created_at) WHERE status='pending'
--    clinic_status: (clinic_id, status, created_at)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_b2b_voucher_audio_queue_pending
  ON public.b2b_voucher_audio_queue (status, scheduled_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_b2b_voucher_audio_queue_clinic_status
  ON public.b2b_voucher_audio_queue (clinic_id, status, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. CREATE TABLE b2b_voucher_dispatch_errors
--    Schema validado em producao · 9 colunas · clinic_id/reason/detail/
--    payload/resolved_at/resolved_by.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.b2b_voucher_dispatch_errors (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  voucher_id  uuid        NOT NULL,
  clinic_id   uuid        NOT NULL,
  reason      text        NOT NULL,
  detail      text        NULL,
  payload     jsonb       NULL,
  resolved_at timestamptz NULL,
  resolved_by uuid        NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2b_voucher_dispatch_errors_pkey PRIMARY KEY (id)
);

-- Idempotente · cobre caso de tabela legada sem colunas novas.
ALTER TABLE public.b2b_voucher_dispatch_errors ADD COLUMN IF NOT EXISTS clinic_id   uuid        NULL;
ALTER TABLE public.b2b_voucher_dispatch_errors ADD COLUMN IF NOT EXISTS reason      text        NULL;
ALTER TABLE public.b2b_voucher_dispatch_errors ADD COLUMN IF NOT EXISTS detail      text        NULL;
ALTER TABLE public.b2b_voucher_dispatch_errors ADD COLUMN IF NOT EXISTS payload     jsonb       NULL;
ALTER TABLE public.b2b_voucher_dispatch_errors ADD COLUMN IF NOT EXISTS resolved_at timestamptz NULL;
ALTER TABLE public.b2b_voucher_dispatch_errors ADD COLUMN IF NOT EXISTS resolved_by uuid        NULL;

-- Constraints + FKs (DO block · guards · alinha com producao)
DO $constraints_errors$
BEGIN
  -- FK voucher_id -> b2b_vouchers(id) ON DELETE CASCADE
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.b2b_voucher_dispatch_errors'::regclass
      AND conname  = 'b2b_voucher_dispatch_errors_voucher_id_fkey'
  ) THEN
    ALTER TABLE public.b2b_voucher_dispatch_errors
      ADD CONSTRAINT b2b_voucher_dispatch_errors_voucher_id_fkey
      FOREIGN KEY (voucher_id) REFERENCES public.b2b_vouchers(id) ON DELETE CASCADE;
  END IF;

  -- FK clinic_id -> clinics(id) ON DELETE CASCADE
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.b2b_voucher_dispatch_errors'::regclass
      AND conname  = 'b2b_voucher_dispatch_errors_clinic_id_fkey'
  ) THEN
    ALTER TABLE public.b2b_voucher_dispatch_errors
      ADD CONSTRAINT b2b_voucher_dispatch_errors_clinic_id_fkey
      FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE CASCADE;
  END IF;

  -- FK resolved_by -> auth.users(id) (sem CASCADE · usuario pode ser deletado)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.b2b_voucher_dispatch_errors'::regclass
      AND conname  = 'b2b_voucher_dispatch_errors_resolved_by_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.b2b_voucher_dispatch_errors
        ADD CONSTRAINT b2b_voucher_dispatch_errors_resolved_by_fkey
        FOREIGN KEY (resolved_by) REFERENCES auth.users(id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[mig 131] FK resolved_by -> auth.users falhou (auth schema indisponivel?): %', SQLERRM;
    END;
  END IF;
END
$constraints_errors$;

-- Indexes b2b_voucher_dispatch_errors · alinhados com producao
CREATE INDEX IF NOT EXISTS b2b_voucher_dispatch_errors_voucher_idx
  ON public.b2b_voucher_dispatch_errors (voucher_id);

CREATE INDEX IF NOT EXISTS b2b_voucher_dispatch_errors_unresolved_idx
  ON public.b2b_voucher_dispatch_errors (clinic_id, created_at DESC)
  WHERE resolved_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Trigger function · _b2b_voucher_audio_after_insert
--    APENAS enfileira · NAO chama net.http_post (worker faz isso).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._b2b_voucher_audio_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
BEGIN
  -- Voucher demo: nao envia audio beneficiario.
  IF COALESCE(NEW.is_demo, false) THEN
    RETURN NEW;
  END IF;

  -- Audio ja enviado · skip.
  IF NEW.audio_sent_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Enfileira · payload mantem rastro pra debug/audit.
  -- ON CONFLICT preservativo:
  --   · status IN ('failed','cancelled') → reabre como pending + reseta scheduled_at
  --   · status IN ('pending','processing','dispatched') → preserva tudo (NAO reseta)
  --   Sempre: zera error_message, atualiza updated_at, acumula payload com requeued info.
  INSERT INTO public.b2b_voucher_audio_queue (
    clinic_id,
    voucher_id,
    status,
    scheduled_at,
    payload
  ) VALUES (
    NEW.clinic_id,
    NEW.id,
    'pending',
    now(),
    jsonb_build_object(
      'source',          'trg_b2b_voucher_audio_auto',
      'voucher_id',      NEW.id::text,
      'partnership_id',  NEW.partnership_id::text,
      'recipient_phone', NEW.recipient_phone,
      'recipient_name',  NEW.recipient_name,
      'queued_at',       now()
    )
  )
  ON CONFLICT (voucher_id) DO UPDATE SET
    status = CASE
      WHEN public.b2b_voucher_audio_queue.status IN ('failed', 'cancelled')
        THEN 'pending'
      ELSE public.b2b_voucher_audio_queue.status
    END,
    scheduled_at = CASE
      WHEN public.b2b_voucher_audio_queue.status IN ('failed', 'cancelled')
        THEN now()
      ELSE public.b2b_voucher_audio_queue.scheduled_at
    END,
    error_message = NULL,
    updated_at    = now(),
    payload       = COALESCE(public.b2b_voucher_audio_queue.payload, '{}'::jsonb)
                    || jsonb_build_object(
                         'requeued_by', 'trg_b2b_voucher_audio_auto',
                         'requeued_at', now()
                       );

  RETURN NEW;
END
$fn$;

-- Garantir trigger ativo (existe via mig 800-04 · so reaffirma estado).
ALTER TABLE public.b2b_vouchers ENABLE TRIGGER trg_b2b_voucher_audio_auto;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Worker function · b2b_voucher_audio_queue_dispatch_pending(int)
--    Pickpending FOR UPDATE SKIP LOCKED · POST edge · marca status final.
--    Snapshot prod: limit clamped 1..50 · filtra attempts<max_attempts +
--    voucher.audio_sent_at IS NULL + not voucher.is_demo · loga errors com
--    reason/detail/payload(queue_id,attempts,sqlstate).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_voucher_audio_queue_dispatch_pending(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_limit        integer;
  v_sb_url       text;
  v_audio_sec    text;
  v_service_key  text;
  v_picked       record;
  v_payload      jsonb;
  v_headers      jsonb;
  v_req_id       bigint;
  v_dispatched   integer := 0;
  v_failed       integer := 0;
  v_items        jsonb   := '[]'::jsonb;
  v_sqlstate     text;
  v_sqlerrm      text;
BEGIN
  -- Clamp p_limit · default 10 · range 1..50.
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 10), 50));

  -- Le secrets do clinic_secrets.
  SELECT value INTO v_sb_url
    FROM public.clinic_secrets WHERE key = 'supabase_url' LIMIT 1;
  SELECT value INTO v_audio_sec
    FROM public.clinic_secrets WHERE key = 'voucher_audio_secret' LIMIT 1;
  SELECT value INTO v_service_key
    FROM public.clinic_secrets WHERE key = 'supabase_service_role_key' LIMIT 1;

  -- Fallback URL (project ref publico).
  IF v_sb_url IS NULL OR v_sb_url = '' THEN
    v_sb_url := 'https://oqboitkpcvuaudouwvkl.supabase.co';
  END IF;

  IF v_audio_sec IS NULL OR v_audio_sec = '' THEN
    RAISE WARNING '[voucher_audio_queue] secret voucher_audio_secret nao configurado';
    RETURN jsonb_build_object('ok', false, 'error', 'missing_voucher_audio_secret');
  END IF;

  IF v_service_key IS NULL OR v_service_key = '' THEN
    RAISE WARNING '[voucher_audio_queue] secret supabase_service_role_key nao configurado';
    RETURN jsonb_build_object('ok', false, 'error', 'missing_supabase_service_role_key');
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type',           'application/json',
    'Authorization',          'Bearer ' || v_service_key,
    'X-Voucher-Audio-Secret', v_audio_sec
  );

  -- Pickpending · marca processing + incrementa attempts + popula timestamps
  -- de tracking + lock SKIP LOCKED. JOIN com b2b_vouchers pra filtrar:
  --   · attempts < max_attempts (nao re-pega items esgotados)
  --   · voucher nao e demo
  --   · voucher.audio_sent_at IS NULL (nao re-envia se ja saiu)
  FOR v_picked IN
    UPDATE public.b2b_voucher_audio_queue q
       SET status                = 'processing',
           attempts              = q.attempts + 1,
           processing_started_at = now(),
           last_attempt_at       = now(),
           updated_at            = now()
     WHERE q.id IN (
       SELECT q2.id
         FROM public.b2b_voucher_audio_queue q2
         JOIN public.b2b_vouchers v ON v.id = q2.voucher_id
        WHERE q2.status = 'pending'
          AND q2.scheduled_at <= now()
          AND q2.attempts < q2.max_attempts
          AND COALESCE(v.is_demo, false) = false
          AND v.audio_sent_at IS NULL
        ORDER BY q2.scheduled_at ASC, q2.created_at ASC
        LIMIT v_limit
        FOR UPDATE OF q2 SKIP LOCKED
     )
    RETURNING q.id, q.voucher_id, q.clinic_id, q.attempts, q.max_attempts
  LOOP
    v_payload := jsonb_build_object(
      'voucher_id',   v_picked.voucher_id,
      'skip_if_sent', true
    );

    BEGIN
      SELECT net.http_post(
        url                   := v_sb_url || '/functions/v1/b2b-voucher-audio',
        headers               := v_headers,
        body                  := v_payload,
        timeout_milliseconds  := 30000
      ) INTO v_req_id;

      -- Sucesso · marca dispatched + grava request_id + reseta processing_started_at.
      UPDATE public.b2b_voucher_audio_queue
         SET status                = 'dispatched',
             dispatched_at         = now(),
             request_id            = v_req_id,
             processing_started_at = NULL,
             error_message         = NULL,
             updated_at            = now()
       WHERE id = v_picked.id;
      v_dispatched := v_dispatched + 1;

      v_items := v_items || jsonb_build_object(
        'queue_id',   v_picked.id,
        'voucher_id', v_picked.voucher_id,
        'status',     'dispatched',
        'request_id', v_req_id
      );

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS
        v_sqlstate = RETURNED_SQLSTATE,
        v_sqlerrm  = MESSAGE_TEXT;

      -- Registra erro detalhado (reason+detail+payload com queue_id/attempts/sqlstate).
      BEGIN
        INSERT INTO public.b2b_voucher_dispatch_errors (
          voucher_id, clinic_id, reason, detail, payload, created_at
        ) VALUES (
          v_picked.voucher_id,
          v_picked.clinic_id,
          'audio_queue_dispatch_failed',
          v_sqlerrm,
          jsonb_build_object(
            'queue_id',  v_picked.id,
            'attempts',  v_picked.attempts,
            'sqlstate',  v_sqlstate
          ),
          now()
        );
      EXCEPTION WHEN OTHERS THEN
        NULL; -- absorve falha de log
      END;

      IF v_picked.attempts >= v_picked.max_attempts THEN
        -- Esgotou retries · marca failed.
        UPDATE public.b2b_voucher_audio_queue
           SET status                = 'failed',
               processing_started_at = NULL,
               error_message         = v_sqlerrm,
               updated_at            = now()
         WHERE id = v_picked.id;
        v_failed := v_failed + 1;
        v_items := v_items || jsonb_build_object(
          'queue_id',   v_picked.id,
          'voucher_id', v_picked.voucher_id,
          'status',     'failed',
          'error',      v_sqlerrm
        );
      ELSE
        -- Re-enqueue · scheduled_at + 2min · proximo tick do cron pega.
        UPDATE public.b2b_voucher_audio_queue
           SET status                = 'pending',
               scheduled_at          = now() + interval '2 minutes',
               processing_started_at = NULL,
               error_message         = v_sqlerrm,
               updated_at            = now()
         WHERE id = v_picked.id;
        v_failed := v_failed + 1;
        v_items := v_items || jsonb_build_object(
          'queue_id',   v_picked.id,
          'voucher_id', v_picked.voucher_id,
          'status',     'pending_retry',
          'error',      v_sqlerrm
        );
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',          true,
    'picked_limit', v_limit,
    'dispatched',  v_dispatched,
    'failed',      v_failed,
    'items',       v_items
  );
END
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. GRANT · worker so chamavel por service_role (cron usa essa role)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.b2b_voucher_audio_queue_dispatch_pending(integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.b2b_voucher_audio_queue_dispatch_pending(integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Cron job idempotente · nao recria se ja existe.
-- ═══════════════════════════════════════════════════════════════════════════

DO $cron_setup$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
     WHERE jobname = 'b2b-voucher-audio-queue-dispatch-every-minute'
  ) THEN
    PERFORM cron.schedule(
      'b2b-voucher-audio-queue-dispatch-every-minute',
      '* * * * *',
      $cron_cmd$SELECT public.b2b_voucher_audio_queue_dispatch_pending(5);$cron_cmd$
    );
    RAISE NOTICE '[mig 131] cron job criado · b2b-voucher-audio-queue-dispatch-every-minute';
  ELSE
    RAISE NOTICE '[mig 131] cron job ja existe · skip create';
  END IF;
EXCEPTION WHEN undefined_table THEN
  RAISE WARNING '[mig 131] extension pg_cron ausente · cron job NAO registrado';
END
$cron_setup$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Sanity check final (regra GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_check int;
BEGIN
  -- Tabela queue
  SELECT COUNT(*) INTO v_check
    FROM pg_class
   WHERE relname     = 'b2b_voucher_audio_queue'
     AND relnamespace = 'public'::regnamespace;
  IF v_check < 1 THEN
    RAISE EXCEPTION '[mig 131 sanity] b2b_voucher_audio_queue NAO criada';
  END IF;

  -- Tabela errors
  SELECT COUNT(*) INTO v_check
    FROM pg_class
   WHERE relname     = 'b2b_voucher_dispatch_errors'
     AND relnamespace = 'public'::regnamespace;
  IF v_check < 1 THEN
    RAISE EXCEPTION '[mig 131 sanity] b2b_voucher_dispatch_errors NAO criada';
  END IF;

  -- Colunas snapshot da errors (clinic_id, reason, detail, payload, resolved_at, resolved_by)
  SELECT COUNT(*) INTO v_check
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'b2b_voucher_dispatch_errors'
     AND column_name IN ('clinic_id','reason','detail','payload','resolved_at','resolved_by');
  IF v_check < 6 THEN
    RAISE WARNING '[mig 131 sanity] b2b_voucher_dispatch_errors faltando coluna(s) snapshot · achei % de 6', v_check;
  END IF;

  -- Trigger function
  SELECT COUNT(*) INTO v_check
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname      = '_b2b_voucher_audio_after_insert';
  IF v_check < 1 THEN
    RAISE EXCEPTION '[mig 131 sanity] _b2b_voucher_audio_after_insert NAO criada';
  END IF;

  -- Worker function
  SELECT COUNT(*) INTO v_check
    FROM pg_proc
   WHERE pronamespace = 'public'::regnamespace
     AND proname      = 'b2b_voucher_audio_queue_dispatch_pending';
  IF v_check < 1 THEN
    RAISE EXCEPTION '[mig 131 sanity] b2b_voucher_audio_queue_dispatch_pending NAO criada';
  END IF;

  -- Constraints queue
  SELECT COUNT(*) INTO v_check
    FROM pg_constraint
   WHERE conrelid = 'public.b2b_voucher_audio_queue'::regclass
     AND conname IN (
       'b2b_voucher_audio_queue_status_check',
       'b2b_voucher_audio_queue_attempts_check',
       'b2b_voucher_audio_queue_voucher_id_uniq'
     );
  IF v_check < 3 THEN
    RAISE EXCEPTION '[mig 131 sanity] constraints b2b_voucher_audio_queue incompletas (achei %)', v_check;
  END IF;

  -- Indexes queue
  SELECT COUNT(*) INTO v_check
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename  = 'b2b_voucher_audio_queue'
     AND indexname IN (
       'idx_b2b_voucher_audio_queue_pending',
       'idx_b2b_voucher_audio_queue_clinic_status'
     );
  IF v_check < 2 THEN
    RAISE WARNING '[mig 131 sanity] indexes queue faltando · achei % de 2', v_check;
  END IF;

  -- Indexes errors
  SELECT COUNT(*) INTO v_check
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename  = 'b2b_voucher_dispatch_errors'
     AND indexname IN (
       'b2b_voucher_dispatch_errors_voucher_idx',
       'b2b_voucher_dispatch_errors_unresolved_idx'
     );
  IF v_check < 2 THEN
    RAISE WARNING '[mig 131 sanity] indexes errors faltando · achei % de 2', v_check;
  END IF;

  -- Cron (warning · pg_cron pode nao estar instalado)
  BEGIN
    SELECT COUNT(*) INTO v_check
      FROM cron.job
     WHERE jobname = 'b2b-voucher-audio-queue-dispatch-every-minute';
    IF v_check < 1 THEN
      RAISE WARNING '[mig 131 sanity] cron job nao registrado · verifique pg_cron';
    END IF;
  EXCEPTION WHEN undefined_table THEN
    RAISE WARNING '[mig 131 sanity] extension pg_cron ausente · cron skip';
  END;

  RAISE NOTICE '[mig 131] sanity ok · queue + errors + trigger fn + worker fn + constraints + indexes OK';
END
$sanity$;

COMMIT;
