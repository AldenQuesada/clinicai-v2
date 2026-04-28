BEGIN;

DROP POLICY IF EXISTS flipbook_comm_templates_authed_all ON public.flipbook_comm_templates;
DROP TRIGGER IF EXISTS flipbook_comm_templates_set_updated_at ON public.flipbook_comm_templates;
DROP INDEX IF EXISTS flipbook_comm_templates_event_idx;
DROP INDEX IF EXISTS flipbook_comm_templates_active_unique;
DROP TABLE IF EXISTS public.flipbook_comm_templates;

DROP POLICY IF EXISTS flipbook_comm_event_keys_authed_all ON public.flipbook_comm_event_keys;
DROP TRIGGER IF EXISTS flipbook_comm_event_keys_set_updated_at ON public.flipbook_comm_event_keys;
DROP INDEX IF EXISTS flipbook_comm_event_keys_category_idx;
DROP TABLE IF EXISTS public.flipbook_comm_event_keys;

COMMIT;
NOTIFY pgrst, 'reload schema';
