-- Rollback mig 800-84 · drop RPC b2b_refer_lead_safe.
-- Caller voltaria pro pipeline manual (leads.create + b2b_attributions.create).
DROP FUNCTION IF EXISTS public.b2b_refer_lead_safe(uuid, uuid, text, text, text, text, jsonb);
NOTIFY pgrst, 'reload schema';
