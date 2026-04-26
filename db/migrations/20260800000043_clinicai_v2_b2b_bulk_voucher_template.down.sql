BEGIN;
DELETE FROM public.b2b_comm_templates WHERE event_key='bulk_voucher_enqueued' AND notes LIKE '%mig 800-43%';
DELETE FROM public.b2b_comm_event_keys WHERE key='bulk_voucher_enqueued';
COMMIT;
