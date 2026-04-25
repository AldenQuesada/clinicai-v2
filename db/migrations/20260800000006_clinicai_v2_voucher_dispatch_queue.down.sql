-- Rollback: 20260800000006_clinicai_v2_voucher_dispatch_queue

DROP FUNCTION IF EXISTS public.b2b_dispatch_queue_cancel_batch(uuid);
DROP FUNCTION IF EXISTS public.b2b_dispatch_queue_fail(uuid, text);
DROP FUNCTION IF EXISTS public.b2b_dispatch_queue_complete(uuid, uuid);
DROP FUNCTION IF EXISTS public.b2b_dispatch_queue_pick(int);
DROP FUNCTION IF EXISTS public.b2b_dispatch_queue_enqueue(jsonb);

DROP TRIGGER IF EXISTS trg_b2b_dispatch_queue_updated_at ON public.b2b_voucher_dispatch_queue;
DROP FUNCTION IF EXISTS public._b2b_dispatch_queue_set_updated_at();

DROP INDEX IF EXISTS public.idx_b2b_dispatch_queue_partnership_status;
DROP INDEX IF EXISTS public.idx_b2b_dispatch_queue_batch;
DROP INDEX IF EXISTS public.idx_b2b_dispatch_queue_pick;

DROP TABLE IF EXISTS public.b2b_voucher_dispatch_queue;

NOTIFY pgrst, 'reload schema';
