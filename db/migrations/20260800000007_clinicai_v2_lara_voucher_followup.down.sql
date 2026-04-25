-- Down · 800-07 · Lara voucher follow-up
-- Remove RPCs, indices, CHECK constraint e colunas. Idempotente.

DROP FUNCTION IF EXISTS public.lara_voucher_mark_followup_sent(uuid, text);
DROP FUNCTION IF EXISTS public.lara_voucher_mark_engaged(uuid);
DROP FUNCTION IF EXISTS public.lara_voucher_followup_pick(timestamptz);

DROP INDEX IF EXISTS public.idx_b2b_vouchers_recipient_phone_recent;
DROP INDEX IF EXISTS public.idx_b2b_vouchers_lara_followup_pick;

ALTER TABLE public.b2b_vouchers
  DROP CONSTRAINT IF EXISTS b2b_vouchers_lara_followup_state_chk;

ALTER TABLE public.b2b_vouchers
  DROP COLUMN IF EXISTS lara_followup_sent_72h_at;

ALTER TABLE public.b2b_vouchers
  DROP COLUMN IF EXISTS lara_followup_sent_48h_at;

ALTER TABLE public.b2b_vouchers
  DROP COLUMN IF EXISTS lara_followup_sent_24h_at;

ALTER TABLE public.b2b_vouchers
  DROP COLUMN IF EXISTS lara_engaged_at;

ALTER TABLE public.b2b_vouchers
  DROP COLUMN IF EXISTS lara_followup_state;

NOTIFY pgrst, 'reload schema';
