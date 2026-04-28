BEGIN;

DROP POLICY IF EXISTS flipbook_comm_dispatches_authed_read ON public.flipbook_comm_dispatches;
DROP TRIGGER IF EXISTS flipbook_comm_dispatches_set_updated_at ON public.flipbook_comm_dispatches;
DROP INDEX IF EXISTS flipbook_comm_dispatches_buyer_idx;
DROP INDEX IF EXISTS flipbook_comm_dispatches_status_scheduled_idx;
DROP INDEX IF EXISTS flipbook_comm_dispatches_buyer_step_unique;
DROP TABLE IF EXISTS public.flipbook_comm_dispatches;

DROP POLICY IF EXISTS flipbook_comm_sequence_steps_authed_all ON public.flipbook_comm_sequence_steps;
DROP TRIGGER IF EXISTS flipbook_comm_sequence_steps_set_updated_at ON public.flipbook_comm_sequence_steps;
DROP INDEX IF EXISTS flipbook_comm_sequence_steps_seq_pos_idx;
DROP TABLE IF EXISTS public.flipbook_comm_sequence_steps;

DROP POLICY IF EXISTS flipbook_comm_sequences_authed_all ON public.flipbook_comm_sequences;
DROP TRIGGER IF EXISTS flipbook_comm_sequences_set_updated_at ON public.flipbook_comm_sequences;
DROP TABLE IF EXISTS public.flipbook_comm_sequences;

COMMIT;
NOTIFY pgrst, 'reload schema';
