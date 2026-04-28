BEGIN;

-- Remove só as linhas semeadas pelo trio · não dropa as tabelas (essas têm own .down)
DELETE FROM public.flipbook_comm_sequence_steps
 WHERE sequence_id IN (
   SELECT id FROM public.flipbook_comm_sequences WHERE name IN ('lead_recovery','buyer_onboarding')
 );

DELETE FROM public.flipbook_comm_sequences WHERE name IN ('lead_recovery','buyer_onboarding');

DELETE FROM public.flipbook_comm_templates
 WHERE event_key IN (
   'buyer_purchase_confirmed',
   'lead_recovery_30min','lead_recovery_6h','lead_recovery_24h','lead_recovery_72h',
   'buyer_onboarding_d1','buyer_onboarding_d7_upsell','buyer_onboarding_d30_referral'
 );

DELETE FROM public.flipbook_comm_event_keys
 WHERE key IN (
   'buyer_purchase_confirmed',
   'lead_recovery_30min','lead_recovery_6h','lead_recovery_24h','lead_recovery_72h',
   'buyer_onboarding_d1','buyer_onboarding_d7_upsell','buyer_onboarding_d30_referral'
 );

COMMIT;
NOTIFY pgrst, 'reload schema';
