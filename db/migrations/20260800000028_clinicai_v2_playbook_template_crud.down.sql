-- Rollback mig 800-28 · playbook_template CRUD RPCs
BEGIN;

DROP FUNCTION IF EXISTS public.b2b_playbook_template_delete(text, text);
DROP FUNCTION IF EXISTS public.b2b_playbook_template_upsert(jsonb);

COMMIT;
