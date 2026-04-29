-- Rollback mig 800-83 · drop RPC anatomy_quiz_lara_dispatch_mark.
-- Caller voltaria pro UPDATE direto · ja existia antes.
DROP FUNCTION IF EXISTS public.anatomy_quiz_lara_dispatch_mark(uuid, text, text, uuid, integer, text);
NOTIFY pgrst, 'reload schema';
