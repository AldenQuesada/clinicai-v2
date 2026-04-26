-- DOWN da mig 800-39 · remove colunas IA + view
BEGIN;

DROP VIEW IF EXISTS public.v_wa_pro_cost_by_pro;
DROP INDEX IF EXISTS public.idx_wa_pro_audit_pro_date;

ALTER TABLE public.wa_pro_audit_log
  DROP COLUMN IF EXISTS tokens_in,
  DROP COLUMN IF EXISTS tokens_out,
  DROP COLUMN IF EXISTS model,
  DROP COLUMN IF EXISTS cost_usd;

COMMIT;
