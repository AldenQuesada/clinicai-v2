-- ============================================================================
-- Rollback de mig 122 · reabre bucket `media` + restaura policies públicas
-- ============================================================================
--
-- ⚠️  ATENÇÃO · ROLLBACK REABRE EXPOSIÇÃO LGPD ⚠️
--
-- Este DOWN é estritamente operacional · usar APENAS pra emergência onde
-- é necessário voltar o bucket pra estado público temporariamente
-- (ex: integração externa que dependa de URL pública e ainda não foi
-- migrada). Em produção normal, NÃO há motivo pra reverter.
--
-- O que este DOWN faz:
--   1. Drop das 4 policies privadas por clinic_id
--   2. Recria as 4 policies públicas legadas (media_public_read, etc)
--   3. UPDATE storage.buckets SET public = true WHERE id = 'media'
--
-- O que este DOWN NÃO faz:
--   - NÃO reverte storage.objects.name (paths permanecem em <clinic_id>/...)
--   - NÃO reverte wa_messages.media_url, wa_broadcasts.media_url,
--     wa_outbox.media_url, wa_media_bank.url
--   - NÃO reverte logs em _lgpd_storage_path_migration_log
--   - NÃO toca dados de negócio
--
-- Consequência prática após rollback:
--   - URLs públicas em /storage/v1/object/public/media/... voltam a servir
--     objetos · qualquer URL leaked vira acessível.
--   - Frontend continua funcionando porque app usa signed URLs (path-based)
--     em writes novos · API resolve via service-role.
--   - URLs públicas em DB (legacy backfilled · 0 atualmente) não retornam
--     porque o backfill não é desfeito.
--
-- Idempotente · DROP/CREATE com IF NOT EXISTS · reaplicar = no-op.

BEGIN;

-- ── 1. Drop das 4 policies privadas por clinic_id ─────────────────────────

DROP POLICY IF EXISTS "Clinics can only read their own media"          ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only upload to their own folder"    ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only update their own media"        ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only delete their own media"        ON storage.objects;

-- ── 2. Recria as 4 policies públicas legadas (rollback operacional) ───────
-- Recria com mesmos nomes/escopo das policies originais pré-Fase-2 LGPD ·
-- DROPs IF EXISTS antes de cada CREATE pra ser idempotente.

DROP POLICY IF EXISTS "media_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "media_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_read"          ON storage.objects;
DROP POLICY IF EXISTS "media_upload"        ON storage.objects;

CREATE POLICY "media_public_read"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'media');

CREATE POLICY "media_public_insert"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'media');

CREATE POLICY "media_read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'media');

CREATE POLICY "media_upload"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'media');

-- ── 3. Reabre bucket ──────────────────────────────────────────────────────

UPDATE storage.buckets SET public = true WHERE id = 'media';

DO $$
DECLARE
  v_is_public BOOLEAN;
BEGIN
  SELECT public INTO v_is_public FROM storage.buckets WHERE id = 'media';
  IF v_is_public IS NULL THEN
    RAISE EXCEPTION 'mig 122 DOWN · bucket media não existe';
  END IF;
  IF v_is_public IS NOT TRUE THEN
    RAISE EXCEPTION 'mig 122 DOWN · bucket media ainda private após UPDATE · investigar';
  END IF;
  RAISE WARNING 'mig 122 DOWN · bucket media voltou a PÚBLICO · LGPD exposure REABERTA · revisar urgência do rollback';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
