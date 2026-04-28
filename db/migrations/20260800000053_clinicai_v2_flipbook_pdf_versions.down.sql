BEGIN;
DROP TABLE IF EXISTS public.flipbook_pdf_versions CASCADE;
COMMIT;
NOTIFY pgrst, 'reload schema';
