-- Rollback: 20260800000001_clinicai_v2_mira_discriminators

DROP INDEX IF EXISTS public.idx_leads_source_clinic;
DROP INDEX IF EXISTS public.idx_wa_conversations_context_clinic;

ALTER TABLE public.leads             DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE public.wa_conversations  DROP CONSTRAINT IF EXISTS wa_conversations_context_type_check;
ALTER TABLE public.wa_messages       DROP CONSTRAINT IF EXISTS wa_messages_channel_check;

ALTER TABLE public.leads             DROP COLUMN IF EXISTS source;
ALTER TABLE public.wa_conversations  DROP COLUMN IF EXISTS context_type;
ALTER TABLE public.wa_messages       DROP COLUMN IF EXISTS channel;

NOTIFY pgrst, 'reload schema';
