-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ DOWN · Migration 800-11 · drop webhook_processing_queue + RPCs           ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Reverte: drop tabela + 5 RPCs + trigger function + indices.              ║
-- ║                                                                          ║
-- ║ Atencao: ANTES de aplicar este down, garanta que                         ║
-- ║   WEBHOOK_ASYNC_ENABLED=false em prod e que o webhook esta usando o      ║
-- ║   path sincrono legado · senao requests entrantes vao 500.               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP FUNCTION IF EXISTS public.webhook_queue_enqueue(jsonb);
DROP FUNCTION IF EXISTS public.webhook_queue_pick(int);
DROP FUNCTION IF EXISTS public.webhook_queue_complete(uuid);
DROP FUNCTION IF EXISTS public.webhook_queue_fail(uuid, text);
DROP FUNCTION IF EXISTS public.webhook_queue_reset_stuck(int);

DROP TRIGGER IF EXISTS trg_webhook_queue_updated_at ON public.webhook_processing_queue;
DROP FUNCTION IF EXISTS public._webhook_queue_set_updated_at();

DROP INDEX IF EXISTS public.idx_webhook_queue_pick;
DROP INDEX IF EXISTS public.idx_webhook_queue_processing_started;
DROP INDEX IF EXISTS public.uniq_webhook_queue_wa_message_id;

DROP TABLE IF EXISTS public.webhook_processing_queue;

NOTIFY pgrst, 'reload schema';
