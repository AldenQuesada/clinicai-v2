-- Rollback Mig 96 · volta os 3 wa_numbers Mira/B2B pra 'sdr' e remove 'b2b' do CHECK
UPDATE public.wa_conversations SET inbox_role = 'sdr'
 WHERE wa_number_id IN (
   '42bc681f-e73c-435a-a8f7-1bc45c0460ea',
   'ba402890-409c-40e0-974b-f56cedb872f8',
   '8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'
 );

UPDATE public.wa_numbers SET inbox_role = 'sdr', updated_at = now()
 WHERE id IN (
   '42bc681f-e73c-435a-a8f7-1bc45c0460ea',
   'ba402890-409c-40e0-974b-f56cedb872f8',
   '8f33e269-b1c4-4d3d-8e5b-3a11f8adf7db'
 );

ALTER TABLE public.wa_numbers DROP CONSTRAINT IF EXISTS wa_numbers_inbox_role_check;
ALTER TABLE public.wa_numbers ADD CONSTRAINT wa_numbers_inbox_role_check
  CHECK (inbox_role IN ('sdr', 'secretaria'));

ALTER TABLE public.wa_conversations DROP CONSTRAINT IF EXISTS wa_conversations_inbox_role_check;
ALTER TABLE public.wa_conversations ADD CONSTRAINT wa_conversations_inbox_role_check
  CHECK (inbox_role IN ('sdr', 'secretaria'));
