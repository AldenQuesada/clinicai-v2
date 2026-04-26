-- Rollback mig 800-24 · b2b_comm_templates sequencias
BEGIN;

DROP FUNCTION IF EXISTS public.b2b_comm_template_assign_sequence(uuid, text);
DROP FUNCTION IF EXISTS public.b2b_comm_template_reorder(uuid, int);

DROP INDEX IF EXISTS public.idx_b2b_comm_templates_sequence;

ALTER TABLE public.b2b_comm_templates DROP COLUMN IF EXISTS sequence_order;
ALTER TABLE public.b2b_comm_templates DROP COLUMN IF EXISTS sequence_name;

COMMIT;
