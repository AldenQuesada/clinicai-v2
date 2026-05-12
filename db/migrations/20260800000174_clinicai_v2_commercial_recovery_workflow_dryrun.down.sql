-- Rollback Mig 174 · CRM_PHASE_2RC.1 workflow dry-run
BEGIN;

DROP VIEW IF EXISTS public.commercial_recovery_workflow_view;

DROP FUNCTION IF EXISTS public.commercial_recovery_workflow_create_or_get(text,uuid,uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS public.commercial_recovery_workflow_update_stage(uuid,text,text);
DROP FUNCTION IF EXISTS public.commercial_recovery_workflow_update_priority(uuid,text);
DROP FUNCTION IF EXISTS public.commercial_recovery_workflow_set_next_action(uuid,text,timestamptz,uuid);
DROP FUNCTION IF EXISTS public.commercial_recovery_workflow_add_note(uuid,text);
DROP FUNCTION IF EXISTS public.commercial_recovery_workflow_mark_recovered(uuid,text);
DROP FUNCTION IF EXISTS public.commercial_recovery_workflow_discard(uuid,text);
DROP FUNCTION IF EXISTS public.commercial_recovery_workflow_suggest_message(text,text,text);

DROP FUNCTION IF EXISTS public._recovery_workflow_role_ok();
DROP FUNCTION IF EXISTS public._recovery_workflow_clinic_id();

DROP TABLE IF EXISTS public.commercial_recovery_events CASCADE;
DROP TABLE IF EXISTS public.commercial_recovery_workflow_items CASCADE;

NOTIFY pgrst, 'reload schema';

COMMIT;
