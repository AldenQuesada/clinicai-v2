-- Rollback migration 847 · drop em ordem reversa.

DROP FUNCTION IF EXISTS public.inbox_notification_mark_read(uuid);
DROP FUNCTION IF EXISTS public.inbox_notification_create(uuid, uuid, text, text, jsonb);
DROP TABLE IF EXISTS public.inbox_notifications;

NOTIFY pgrst, 'reload schema';
