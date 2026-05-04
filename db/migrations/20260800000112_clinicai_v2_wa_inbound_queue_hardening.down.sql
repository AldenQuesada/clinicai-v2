-- Rollback de mig 112 · wa_inbound_queue hardening.
--
-- Reverte: drop RLS · drop policies · drop 3 RPCs novas · re-grant anon (PERIGOSO!) ·
-- drop colunas obs · re-cria pick original (SECURITY INVOKER, sem worker_id).
--
-- ATENÇÃO: este rollback REABRE o hole de segurança (GRANT anon).
-- Use APENAS se algum worker quebrar irreversivelmente · re-aplicar mig 112 ASAP.

BEGIN;

-- 1. Drop policies + RLS
DROP POLICY IF EXISTS "wa_inbound_queue_admin_select" ON public.wa_inbound_queue;
DROP POLICY IF EXISTS "wa_inbound_queue_block_writes" ON public.wa_inbound_queue;
ALTER TABLE public.wa_inbound_queue DISABLE ROW LEVEL SECURITY;

-- 2. Drop RPCs novas
DROP FUNCTION IF EXISTS public.wa_inbound_queue_requeue_stuck(INT);
DROP FUNCTION IF EXISTS public.wa_inbound_queue_fail(UUID, TEXT, INT);
DROP FUNCTION IF EXISTS public.wa_inbound_queue_complete(UUID);
DROP FUNCTION IF EXISTS public.wa_inbound_queue_pick(INT, TEXT);

-- 3. Re-cria pick original (SECURITY INVOKER · estado pre-mig)
CREATE OR REPLACE FUNCTION public.wa_inbound_queue_pick(p_limit INT DEFAULT 10)
RETURNS SETOF public.wa_inbound_queue
LANGUAGE plpgsql
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
    UPDATE public.wa_inbound_queue
    SET status = 'processing', attempts = attempts + 1
    FROM target
    WHERE wa_inbound_queue.id = target.id
    RETURNING wa_inbound_queue.*;
END;
$$;

-- 4. Re-grant pra anon/auth/PUBLIC (estado pre-mig · RECOLOCA HOLE)
GRANT EXECUTE ON FUNCTION public.wa_inbound_queue_pick(INT) TO PUBLIC, anon, authenticated, service_role;

-- 5. Drop colunas obs
DROP INDEX IF EXISTS public.idx_wa_inbound_queue_processing_started;
ALTER TABLE public.wa_inbound_queue
  DROP COLUMN IF EXISTS started_at,
  DROP COLUMN IF EXISTS worker_id,
  DROP COLUMN IF EXISTS last_error;

DO $$ BEGIN
  RAISE WARNING 'rollback mig 112 · GRANT anon REATIVADO · LGPD breach reactivated · re-apply ASAP';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
