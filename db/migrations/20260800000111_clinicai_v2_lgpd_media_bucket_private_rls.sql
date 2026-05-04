-- ============================================================================
-- Fase 2 LGPD · fechar bucket `media` + RLS por folder com clinic_id
-- ============================================================================
--
-- Pré-requisito INEGOCIÁVEL: mig 110 aplicada COM SUCESSO · todos objects
-- em storage.objects do bucket `media` precisam estar no layout
-- `<clinic_id>/...` (sanity check abaixo aborta se não estiverem).
--
-- O que esta mig faz:
--   1. Sanity check · todos objects layout-correct
--   2. UPDATE storage.buckets SET public = false WHERE id = 'media'
--   3. Drop policies antigas (defensivo · re-rodável)
--   4. CREATE POLICY · authenticated SELECT só vê próprio clinic_id
--   5. CREATE POLICY · authenticated INSERT só sobe pro próprio folder
--   6. CREATE POLICY · authenticated UPDATE/DELETE só toca próprio folder
--   7. service_role mantém acesso total (webhook depende disso)
--
-- O que NÃO faz:
--   - NÃO drop _lgpd_storage_path_migration_log · cooling period 7d antes
--   - NÃO toca buckets `flipbook-*` (tem layout próprio · análise separada)
--   - NÃO migra paths · isso é mig 110
--
-- Recovery se algo quebrar pós-deploy:
--   UPDATE storage.buckets SET public = true WHERE id = 'media';
--   DROP POLICY ... (rollback nas mesmas 3 policies)
--   .down.sql faz isso automaticamente.

BEGIN;

-- ── 0. Sanity pré-condição · todos objects layout-correct ─────────────────

DO $$
DECLARE
  v_orphan_count INT;
  v_orphan_sample TEXT;
BEGIN
  SELECT count(*), string_agg(name, ', ' ORDER BY name LIMIT 5)
  INTO v_orphan_count, v_orphan_sample
  FROM storage.objects
  WHERE bucket_id = 'media'
    AND (storage.foldername(name))[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'mig 111 ABORT · % objects ainda sem clinic_id no path · sample: %. Re-rodar mig 110 ou investigar via _lgpd_storage_path_migration_log antes de fechar bucket.',
      v_orphan_count, v_orphan_sample;
  END IF;

  RAISE NOTICE 'mig 111 · sanity pre-check OK · todos objects no layout <clinic_id>/...';
END $$;

-- ── 1. Fecha o bucket ──────────────────────────────────────────────────────

UPDATE storage.buckets SET public = false WHERE id = 'media';

DO $$
DECLARE
  v_is_public BOOLEAN;
BEGIN
  SELECT public INTO v_is_public FROM storage.buckets WHERE id = 'media';
  IF v_is_public IS NULL THEN
    RAISE EXCEPTION 'mig 111 · bucket media não existe';
  END IF;
  IF v_is_public THEN
    RAISE EXCEPTION 'mig 111 · bucket media ainda está public após UPDATE · investigar';
  END IF;
  RAISE NOTICE 'mig 111 · bucket media agora private';
END $$;

-- ── 2. Drop policies antigas (defensivo · re-rodável) ─────────────────────

DROP POLICY IF EXISTS "Clinics can only read their own media" ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only upload to their own folder" ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only update their own media" ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only delete their own media" ON storage.objects;

-- ── 3. Policies authenticated · scope por clinic_id no folder[1] ──────────
-- app_clinic_id() vem do JWT claim · setado pelo custom_access_token_hook.
-- Service role bypassa RLS por default · webhook continua funcionando.

CREATE POLICY "Clinics can only read their own media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = (public.app_clinic_id())::text
);

CREATE POLICY "Clinics can only upload to their own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = (public.app_clinic_id())::text
);

CREATE POLICY "Clinics can only update their own media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = (public.app_clinic_id())::text
)
WITH CHECK (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = (public.app_clinic_id())::text
);

CREATE POLICY "Clinics can only delete their own media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'media'
  AND (storage.foldername(name))[1] = (public.app_clinic_id())::text
);

-- ── 4. Sanity pós-criação ─────────────────────────────────────────────────

DO $$
DECLARE
  v_policy_count INT;
BEGIN
  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'Clinics can only read their own media',
      'Clinics can only upload to their own folder',
      'Clinics can only update their own media',
      'Clinics can only delete their own media'
    );

  IF v_policy_count <> 4 THEN
    RAISE EXCEPTION 'mig 111 · esperado 4 policies, encontrou %', v_policy_count;
  END IF;
  RAISE NOTICE 'mig 111 · 4 policies criadas · authenticated escopado por <clinic_id>/.';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
