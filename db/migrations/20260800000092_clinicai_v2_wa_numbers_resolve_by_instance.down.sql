-- Rollback Mig 92
DROP FUNCTION IF EXISTS public.wa_numbers_resolve_by_instance(text);
NOTIFY pgrst, 'reload schema';
