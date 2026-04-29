-- Reverte mig 800-82 · drop functions + index + columns.
BEGIN;

DROP FUNCTION IF EXISTS public.orcamento_followup_mark_sent(UUID);
DROP FUNCTION IF EXISTS public.orcamento_followup_clear_stuck(INT);
DROP FUNCTION IF EXISTS public.orcamento_followup_pick(INT);

DROP INDEX IF EXISTS public.idx_orc_followup_due;

ALTER TABLE public.orcamentos
  DROP COLUMN IF EXISTS picking_at,
  DROP COLUMN IF EXISTS last_followup_at;

COMMIT;
