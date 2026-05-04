-- Rollback de mig 111 · re-abre bucket `media` + remove policies.
--
-- Use APENAS se UI parar de renderizar imagens em prod E você precisar
-- de tempo pra investigar (ex: signed URLs falhando por bug no helper).
-- Re-abre o bucket = volta a expor objects publicamente · só deve viver
-- por minutos enquanto fix sai.

BEGIN;

DROP POLICY IF EXISTS "Clinics can only delete their own media" ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only update their own media" ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only upload to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only read their own media" ON storage.objects;

UPDATE storage.buckets SET public = true WHERE id = 'media';

DO $$
BEGIN
  RAISE WARNING 'rollback mig 111 · bucket media de volta a PUBLIC · LGPD risk reativado · fix e re-aplicar mig 111 ASAP';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
