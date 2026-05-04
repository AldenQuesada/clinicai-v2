-- ============================================================================
-- Fase 2 LGPD · cleanup final · bucket `media` privado + RLS por clinic_id
-- ============================================================================
--
-- Versiona o estado FINAL da Fase 2 LGPD que JÁ foi aplicado manualmente em
-- produção em 2026-05-04. Substitui a mig 111 (que estava staged mas não
-- removia explicitamente as 4 policies públicas legadas pelos nomes corretos).
--
-- Histórico do caminho até aqui:
--
--   1. Mig 110 (apply manual → rolled back parcial → reapply manual): moveu
--      storage.objects para layout `<clinic_id>/...` e backfill de DB rows
--      (wa_messages, wa_broadcasts, wa_outbox, wa_media_bank). Concluiu.
--
--   2. Cleanup das 4 BROKEN_MESSAGE (manual · 2026-05-04): mapeou
--      `before-after/ba-11-gedina-1.jpg` → `<clinic>/library/before-after/ba-11-gedina.jpg`
--      e `before-after/ba-03.jpg` → `<clinic>/library/before-after/ba-03-andreia.jpg`.
--      Logado em _lgpd_storage_path_migration_log.
--
--   3. UPDATE storage.buckets SET public=false WHERE id='media' (manual).
--
--   4. DROP das 4 policies públicas legadas (manual):
--        media_public_read, media_public_insert, media_read, media_upload
--
--   5. CREATE das 4 policies privadas (manual):
--        "Clinics can only read their own media"
--        "Clinics can only upload to their own folder"
--        "Clinics can only update their own media"
--        "Clinics can only delete their own media"
--      Todas para role `authenticated` · escopadas por
--        (storage.foldername(name))[1] = (public.app_clinic_id())::text
--
--   6. Probe HTTP externo confirmou: GET /storage/v1/object/public/media/...
--      retorna 400 "Bucket not found" (URLs públicas cortadas).
--
-- Estado validado em prod no momento de versionar:
--   - storage.objects: 142/142 com clinic_id prefix · 0 órfãos.
--   - DB rows: 0 URLs públicas em wa_messages/wa_broadcasts/wa_media_bank/wa_outbox.
--   - storage.buckets.media.public = false.
--   - 0 policies públicas legadas remanescentes.
--   - 4 policies privadas ativas.
--
-- Esta mig é IDEMPOTENTE: aplicada num DB que já está no estado final é no-op
-- (sanities passam · UPDATE bucket é no-op · DROPs IF EXISTS · CREATEs após DROPs).
--
-- O QUE ESTA MIG NÃO FAZ:
--   - NÃO toca paths em storage.objects.name.
--   - NÃO toca DB rows em wa_messages/wa_broadcasts/wa_media_bank/wa_outbox.
--   - NÃO drop _lgpd_storage_path_migration_log (preserva audit trail).
--   - NÃO toca buckets `flipbook-*` ou outros.
--   - NÃO toca dados de negócio.

BEGIN;

-- ── 0. Garante que a tabela de log LGPD existe (idempotente) ───────────────
-- Em prod já tem 133 rows · ausência indicaria reset acidental · recria DDL
-- compatível pra preservar rollbacks futuros.

CREATE TABLE IF NOT EXISTS public._lgpd_storage_path_migration_log (
  id BIGSERIAL PRIMARY KEY,
  bucket_id TEXT NOT NULL,
  storage_object_id UUID,
  old_name TEXT NOT NULL,
  new_name TEXT NOT NULL,
  resolved_clinic_id UUID,
  source TEXT NOT NULL,
  source_row_id TEXT,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public._lgpd_storage_path_migration_log IS
  'Audit trail Fase 1+2 LGPD · old_name → new_name · drop após cooling period (rollback usa).';

-- ── 1. Sanity pré-condições · storage.objects todos com clinic_id ─────────

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
    RAISE EXCEPTION 'mig 122 ABORT · % objects em storage.objects sem clinic_id no path · sample: %. Backfill de paths (mig 110) precisa ser concluído antes de fechar bucket.',
      v_orphan_count, v_orphan_sample;
  END IF;

  RAISE NOTICE 'mig 122 · sanity storage.objects OK · 0 órfãos';
END $$;

-- ── 2. Sanity pré-condições · DB rows sem URLs públicas ───────────────────
-- Aborta se restou QUALQUER URL HTTP nas 4 tabelas críticas. Isso protege
-- contra fechar o bucket com refs legacy que viram 404 na UI.

DO $$
DECLARE
  v_msg_http      INT;
  v_msg_public    INT;
  v_brd_http      INT;
  v_brd_public    INT;
  v_obx_http      INT;
  v_obx_public    INT;
  v_bank_http     INT;
  v_bank_public   INT;
  v_bank_exists   BOOLEAN;
BEGIN
  SELECT count(*) FILTER (WHERE media_url ILIKE 'http%'),
         count(*) FILTER (WHERE media_url ILIKE 'https://%/storage/v1/object/public/media/%')
    INTO v_msg_http, v_msg_public
  FROM public.wa_messages;

  IF v_msg_public > 0 OR v_msg_http > 0 THEN
    RAISE EXCEPTION 'mig 122 ABORT · wa_messages tem URLs HTTP/públicas · http=% public=%', v_msg_http, v_msg_public;
  END IF;

  SELECT count(*) FILTER (WHERE media_url ILIKE 'http%'),
         count(*) FILTER (WHERE media_url ILIKE 'https://%/storage/v1/object/public/media/%')
    INTO v_brd_http, v_brd_public
  FROM public.wa_broadcasts;

  IF v_brd_public > 0 OR v_brd_http > 0 THEN
    RAISE EXCEPTION 'mig 122 ABORT · wa_broadcasts tem URLs HTTP/públicas · http=% public=%', v_brd_http, v_brd_public;
  END IF;

  SELECT count(*) FILTER (WHERE media_url ILIKE 'http%'),
         count(*) FILTER (WHERE media_url ILIKE 'https://%/storage/v1/object/public/media/%')
    INTO v_obx_http, v_obx_public
  FROM public.wa_outbox;

  IF v_obx_public > 0 OR v_obx_http > 0 THEN
    RAISE EXCEPTION 'mig 122 ABORT · wa_outbox tem URLs HTTP/públicas · http=% public=%', v_obx_http, v_obx_public;
  END IF;

  -- wa_media_bank pode não existir em alguns deploys · check defensivo
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wa_media_bank'
  ) INTO v_bank_exists;

  IF v_bank_exists THEN
    EXECUTE $sql$
      SELECT count(*) FILTER (WHERE url ILIKE 'http%'),
             count(*) FILTER (WHERE url ILIKE 'https://%/storage/v1/object/public/media/%')
      FROM public.wa_media_bank
    $sql$ INTO v_bank_http, v_bank_public;

    IF v_bank_public > 0 OR v_bank_http > 0 THEN
      RAISE EXCEPTION 'mig 122 ABORT · wa_media_bank tem URLs HTTP/públicas · http=% public=%', v_bank_http, v_bank_public;
    END IF;
  END IF;

  RAISE NOTICE 'mig 122 · sanity DB OK · 0 URLs HTTP em wa_messages/wa_broadcasts/wa_outbox/wa_media_bank';
END $$;

-- ── 3. Bucket privado (idempotente · UPDATE no-op se já privado) ──────────

UPDATE storage.buckets SET public = false WHERE id = 'media';

DO $$
DECLARE
  v_is_public BOOLEAN;
BEGIN
  SELECT public INTO v_is_public FROM storage.buckets WHERE id = 'media';
  IF v_is_public IS NULL THEN
    RAISE EXCEPTION 'mig 122 · bucket media não existe';
  END IF;
  IF v_is_public THEN
    RAISE EXCEPTION 'mig 122 · bucket media ainda public após UPDATE · investigar';
  END IF;
  RAISE NOTICE 'mig 122 · bucket media private';
END $$;

-- ── 4. Drop policies públicas legadas (idempotente · re-rodável) ──────────
-- Em prod já estão removidas · este DROP é defensivo pra rerun em ambientes
-- novos (staging/dev) que podem ainda ter as 4 policies originais.

DROP POLICY IF EXISTS "media_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "media_public_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_read"          ON storage.objects;
DROP POLICY IF EXISTS "media_upload"        ON storage.objects;

-- ── 5. Drop policies privadas atuais (defensivo · permite recriar limpo) ──

DROP POLICY IF EXISTS "Clinics can only read their own media"          ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only upload to their own folder"    ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only update their own media"        ON storage.objects;
DROP POLICY IF EXISTS "Clinics can only delete their own media"        ON storage.objects;

-- ── 6. Recria as 4 policies privadas · authenticated escopado por clinic_id ──
-- app_clinic_id() vem do JWT claim · service_role bypassa RLS por default ·
-- webhook continua funcionando.

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

-- ── 7. Sanity pós · bucket privado + 0 policies legadas + 4 privadas ──────

DO $$
DECLARE
  v_is_public         BOOLEAN;
  v_old_policy_count  INT;
  v_new_policy_count  INT;
BEGIN
  SELECT public INTO v_is_public FROM storage.buckets WHERE id = 'media';
  IF v_is_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'mig 122 · bucket media não está private · public=%', v_is_public;
  END IF;

  SELECT count(*) INTO v_old_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN ('media_public_read', 'media_public_insert', 'media_read', 'media_upload');

  IF v_old_policy_count <> 0 THEN
    RAISE EXCEPTION 'mig 122 · % policies públicas legadas ainda presentes', v_old_policy_count;
  END IF;

  SELECT count(*) INTO v_new_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'Clinics can only read their own media',
      'Clinics can only upload to their own folder',
      'Clinics can only update their own media',
      'Clinics can only delete their own media'
    );

  IF v_new_policy_count <> 4 THEN
    RAISE EXCEPTION 'mig 122 · esperado 4 policies privadas · encontrou %', v_new_policy_count;
  END IF;

  RAISE NOTICE 'mig 122 · LGPD Fase 2 sealed · bucket private · 0 legacy policies · 4 private policies ativas';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
