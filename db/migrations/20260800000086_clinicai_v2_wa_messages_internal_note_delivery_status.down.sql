-- Rollback Sprint C · paridade WhatsApp

DROP INDEX IF EXISTS public.wa_messages_internal_note_idx;
DROP INDEX IF EXISTS public.wa_messages_delivery_status_pending_idx;

ALTER TABLE public.wa_messages
  DROP CONSTRAINT IF EXISTS wa_messages_delivery_status_check;

ALTER TABLE public.wa_messages
  DROP COLUMN IF EXISTS internal_note,
  DROP COLUMN IF EXISTS delivery_status;

NOTIFY pgrst, 'reload schema';
