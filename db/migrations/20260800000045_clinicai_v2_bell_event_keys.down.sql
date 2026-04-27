BEGIN;
DELETE FROM public.b2b_comm_templates WHERE notes LIKE '%mig 800-45%';
DELETE FROM public.b2b_comm_event_keys WHERE key LIKE 'bell_%';
COMMIT;
