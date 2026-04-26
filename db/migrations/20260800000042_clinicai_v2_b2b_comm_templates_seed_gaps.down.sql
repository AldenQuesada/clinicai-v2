-- DOWN mig 800-42 · remove os 13 templates seedados (notes match)
BEGIN;
DELETE FROM public.b2b_comm_templates
 WHERE notes LIKE '%mig 800-42%';
COMMIT;
