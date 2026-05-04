-- ============================================================================
-- Fase 1 LGPD · migrar paths do bucket `media` pra layout `<clinic_id>/...`
-- ============================================================================
--
-- Contexto (audit Passo 7 · 2026-05-04):
-- Bucket `media` é PÚBLICO sem expiração · fotos/áudios de pacientes acessíveis
-- por qualquer URL leaked (LGPD risk). Fase 1 estabelece path canonical com
-- clinic_id no início. Fase 2 fecha bucket + RLS por folder.
--
-- Antes desta mig:
--   media/wa-media/<conv_id>/<uuid>.<ext>           (Cloud inbound)
--   media/wa-evolution-inbound/<clinic_id>/<uuid>.<ext>  (Evolution inbound)
--   media/wa-uploads/<clinic_id>/<conv_id>/<uuid>.<ext>  (UI upload)
--   media/before-after/<funnel>/<filename>          (library)
--   media/<category>/<filename>                     (institutional)
--   media/broadcasts/<ts>-<name>                    (campaigns)
--
-- Depois desta mig:
--   media/<clinic_id>/wa-cloud/<conv_id>/<uuid>.<ext>
--   media/<clinic_id>/wa-evolution/<conv_id|pending>/<uuid>.<ext>
--   media/<clinic_id>/wa-uploads/<conv_id>/<uuid>.<ext>
--   media/<clinic_id>/library/before-after/<funnel>/<filename>
--   media/<clinic_id>/library/<category>/<filename>
--   media/<clinic_id>/broadcasts/<ts>-<name>
--
-- Todas referências em wa_messages.media_url, broadcasts.media_url,
-- wa_media_bank.url são atualizadas pra novo path. URLs legacy
-- (https://<proj>.supabase.co/storage/v1/object/public/media/<path>) são
-- detectadas e convertidas pra path puro.
--
-- Single-tenant assumption: rows sem clinic_id derivável (broadcasts/, library
-- non-tenant) recebem _default_clinic_id() · funciona pra Mirian. Multi-tenant
-- futuro: re-rodar migration por tenant antes de migrar dados.
--
-- ADR-029: SECURITY DEFINER pra funções helper · GOLD-STANDARD: idempotente,
-- com sanity check final e contadores em RAISE NOTICE.

BEGIN;

-- ── 0. Helpers temporários ──────────────────────────────────────────────────

-- Resolve clinic_id pra path antigo · usado pra moves em storage + atualizações em DB.
CREATE OR REPLACE FUNCTION _lgpd_resolve_clinic_for_path(p_old_path TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_first TEXT;
  v_second TEXT;
  v_conv_id UUID;
  v_clinic UUID;
  v_default UUID;
BEGIN
  -- Trim leading slash + split em /
  p_old_path := ltrim(p_old_path, '/');
  v_first := split_part(p_old_path, '/', 1);
  v_second := split_part(p_old_path, '/', 2);

  -- Caso 1: wa-media/<conv_id>/... → lookup wa_conversations
  IF v_first = 'wa-media' AND v_second ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    BEGIN
      v_conv_id := v_second::UUID;
      SELECT clinic_id INTO v_clinic FROM public.wa_conversations WHERE id = v_conv_id LIMIT 1;
      IF v_clinic IS NOT NULL THEN
        RETURN v_clinic;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- conv UUID inválido ou tabela sem row · cai pro default abaixo
      NULL;
    END;
  END IF;

  -- Caso 2: wa-evolution-inbound/<clinic_id>/... → clinic_id é o 2º folder
  IF v_first = 'wa-evolution-inbound' AND v_second ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v_second::UUID;
  END IF;

  -- Caso 3: wa-uploads/<clinic_id>/<conv_id>/... → clinic_id é o 2º folder
  IF v_first = 'wa-uploads' AND v_second ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v_second::UUID;
  END IF;

  -- Caso 4: já está no layout novo (<clinic_id>/...) · skip
  IF v_first ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN v_first::UUID;
  END IF;

  -- Caso 5: institucional/library (before-after/, consulta/, broadcasts/, etc)
  -- Single-tenant assumption · _default_clinic_id() retorna Mirian.
  SELECT public._default_clinic_id() INTO v_default;
  RETURN v_default;
END;
$$;

-- Constrói path novo a partir do antigo + clinic_id resolvido.
CREATE OR REPLACE FUNCTION _lgpd_build_new_path(p_old_path TEXT, p_clinic_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_first TEXT;
  v_rest TEXT;
  v_clinic_str TEXT;
BEGIN
  p_old_path := ltrim(p_old_path, '/');
  v_first := split_part(p_old_path, '/', 1);
  v_clinic_str := p_clinic_id::TEXT;

  -- Já está no layout novo · retorna como-está (idempotente)
  IF v_first = v_clinic_str THEN
    RETURN p_old_path;
  END IF;

  -- wa-media/<conv>/... → <clinic>/wa-cloud/<conv>/... (renomeia tb pro nome canonical novo)
  IF v_first = 'wa-media' THEN
    v_rest := substring(p_old_path FROM length('wa-media/') + 1);
    RETURN v_clinic_str || '/wa-cloud/' || v_rest;
  END IF;

  -- wa-evolution-inbound/<clinic>/<file> → <clinic>/wa-evolution/pending/<file>
  -- (path antigo não tinha conv_id · pending matches mediaPaths.evolutionInbound(null))
  IF v_first = 'wa-evolution-inbound' THEN
    v_rest := substring(p_old_path FROM length('wa-evolution-inbound/') + 1);
    -- Strip o 1º folder (que era clinic_id) · sobra <file>
    v_rest := substring(v_rest FROM strpos(v_rest, '/') + 1);
    RETURN v_clinic_str || '/wa-evolution/pending/' || v_rest;
  END IF;

  -- wa-uploads/<clinic>/<conv>/<file> → <clinic>/wa-uploads/<conv>/<file>
  IF v_first = 'wa-uploads' THEN
    v_rest := substring(p_old_path FROM length('wa-uploads/') + 1);
    -- Strip o 1º folder (que era clinic_id) · sobra <conv>/<file>
    v_rest := substring(v_rest FROM strpos(v_rest, '/') + 1);
    RETURN v_clinic_str || '/wa-uploads/' || v_rest;
  END IF;

  -- broadcasts/<ts>-<name> → <clinic>/broadcasts/<ts>-<name>
  IF v_first = 'broadcasts' THEN
    RETURN v_clinic_str || '/' || p_old_path;
  END IF;

  -- before-after/<funnel>/<file> → <clinic>/library/before-after/<funnel>/<file>
  IF v_first = 'before-after' THEN
    RETURN v_clinic_str || '/library/' || p_old_path;
  END IF;

  -- Categoria institucional (consulta, anovator, biometria, clinica)
  -- → <clinic>/library/<category>/<file>
  IF v_first IN ('consulta', 'anovator', 'biometria', 'clinica') THEN
    RETURN v_clinic_str || '/library/' || p_old_path;
  END IF;

  -- Default: prefix com clinic_id (path desconhecido · move pra namespace tenant)
  RETURN v_clinic_str || '/legacy/' || p_old_path;
END;
$$;

-- Extrai path de URL pública legacy.
-- 'https://<proj>.supabase.co/storage/v1/object/public/media/wa-media/x/y.jpg' → 'wa-media/x/y.jpg'
-- Retorna NULL se URL não bate o padrão (URL externa, JSON null, path puro, etc).
CREATE OR REPLACE FUNCTION _lgpd_extract_path_from_url(p_value TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_marker TEXT := '/storage/v1/object/public/media/';
  v_idx INT;
BEGIN
  IF p_value IS NULL OR p_value = '' THEN RETURN NULL; END IF;
  v_idx := position(v_marker IN p_value);
  IF v_idx = 0 THEN RETURN NULL; END IF;
  RETURN substring(p_value FROM v_idx + length(v_marker));
END;
$$;

-- ── 1. Backup de auditoria · pra rollback granular se algo der errado ──────

CREATE TABLE IF NOT EXISTS _lgpd_storage_path_migration_log (
  id BIGSERIAL PRIMARY KEY,
  bucket_id TEXT NOT NULL,
  storage_object_id UUID,
  old_name TEXT NOT NULL,
  new_name TEXT NOT NULL,
  resolved_clinic_id UUID,
  source TEXT NOT NULL, -- 'storage.objects' | 'wa_messages' | 'broadcasts' | 'wa_media_bank'
  source_row_id TEXT,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE _lgpd_storage_path_migration_log IS
  'Audit trail mig 110 · pode rodar rollback usando old_name. Drop após cooling period (7d).';

-- ── 2. Move objects no bucket `media` ──────────────────────────────────────
-- Atualiza storage.objects.name · referência ao blob não muda (id UUID estável).

DO $$
DECLARE
  rec RECORD;
  v_clinic UUID;
  v_new_name TEXT;
  v_count_moved INT := 0;
  v_count_skipped INT := 0;
BEGIN
  FOR rec IN
    SELECT id, name
    FROM storage.objects
    WHERE bucket_id = 'media'
    ORDER BY created_at ASC
  LOOP
    v_clinic := _lgpd_resolve_clinic_for_path(rec.name);
    IF v_clinic IS NULL THEN
      v_count_skipped := v_count_skipped + 1;
      CONTINUE;
    END IF;
    v_new_name := _lgpd_build_new_path(rec.name, v_clinic);
    IF v_new_name = rec.name THEN
      v_count_skipped := v_count_skipped + 1;
      CONTINUE;
    END IF;
    -- Log antes do update · permite rollback granular
    INSERT INTO _lgpd_storage_path_migration_log (
      bucket_id, storage_object_id, old_name, new_name, resolved_clinic_id, source, source_row_id
    ) VALUES (
      'media', rec.id, rec.name, v_new_name, v_clinic, 'storage.objects', rec.id::TEXT
    );
    UPDATE storage.objects SET name = v_new_name WHERE id = rec.id;
    v_count_moved := v_count_moved + 1;
  END LOOP;
  RAISE NOTICE 'mig 110 · storage.objects: % moved, % skipped (already-new or no-clinic)', v_count_moved, v_count_skipped;
END $$;

-- ── 3. Update wa_messages.media_url ────────────────────────────────────────
-- Lógica: se URL legacy → extrai path; se path antigo → migra; se já novo → skip.

DO $$
DECLARE
  rec RECORD;
  v_path TEXT;
  v_clinic UUID;
  v_new_path TEXT;
  v_count_url INT := 0;
  v_count_path INT := 0;
  v_count_skipped INT := 0;
BEGIN
  FOR rec IN
    SELECT id, clinic_id, media_url
    FROM public.wa_messages
    WHERE media_url IS NOT NULL AND media_url <> ''
  LOOP
    -- Tenta extrair path de URL legacy
    v_path := _lgpd_extract_path_from_url(rec.media_url);
    IF v_path IS NOT NULL THEN
      -- URL legacy → path
      v_clinic := COALESCE(rec.clinic_id, _lgpd_resolve_clinic_for_path(v_path));
      v_new_path := _lgpd_build_new_path(v_path, v_clinic);
      INSERT INTO _lgpd_storage_path_migration_log (
        bucket_id, old_name, new_name, resolved_clinic_id, source, source_row_id
      ) VALUES ('media', rec.media_url, v_new_path, v_clinic, 'wa_messages', rec.id::TEXT);
      UPDATE public.wa_messages SET media_url = v_new_path WHERE id = rec.id;
      v_count_url := v_count_url + 1;
    ELSIF rec.media_url NOT LIKE 'http%' THEN
      -- Já é path · pode estar no layout antigo
      v_clinic := COALESCE(rec.clinic_id, _lgpd_resolve_clinic_for_path(rec.media_url));
      v_new_path := _lgpd_build_new_path(rec.media_url, v_clinic);
      IF v_new_path <> rec.media_url THEN
        INSERT INTO _lgpd_storage_path_migration_log (
          bucket_id, old_name, new_name, resolved_clinic_id, source, source_row_id
        ) VALUES ('media', rec.media_url, v_new_path, v_clinic, 'wa_messages', rec.id::TEXT);
        UPDATE public.wa_messages SET media_url = v_new_path WHERE id = rec.id;
        v_count_path := v_count_path + 1;
      ELSE
        v_count_skipped := v_count_skipped + 1;
      END IF;
    ELSE
      -- URL externa (não Supabase storage) · skip
      v_count_skipped := v_count_skipped + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'mig 110 · wa_messages: % URL→path, % path-only migrated, % skipped',
    v_count_url, v_count_path, v_count_skipped;
END $$;

-- ── 4. Update broadcasts.media_url ─────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
  v_path TEXT;
  v_clinic UUID;
  v_new_path TEXT;
  v_count INT := 0;
BEGIN
  -- Broadcasts não tem clinic_id direto · usa default (single-tenant)
  -- Se schema futuro adicionar clinic_id em broadcasts, atualizar query.
  FOR rec IN
    SELECT id, media_url
    FROM public.broadcasts
    WHERE media_url IS NOT NULL AND media_url <> ''
  LOOP
    v_path := _lgpd_extract_path_from_url(rec.media_url);
    IF v_path IS NOT NULL THEN
      v_clinic := _lgpd_resolve_clinic_for_path(v_path);
      v_new_path := _lgpd_build_new_path(v_path, v_clinic);
      INSERT INTO _lgpd_storage_path_migration_log (
        bucket_id, old_name, new_name, resolved_clinic_id, source, source_row_id
      ) VALUES ('media', rec.media_url, v_new_path, v_clinic, 'broadcasts', rec.id::TEXT);
      UPDATE public.broadcasts SET media_url = v_new_path WHERE id = rec.id;
      v_count := v_count + 1;
    ELSIF rec.media_url NOT LIKE 'http%' THEN
      v_clinic := _lgpd_resolve_clinic_for_path(rec.media_url);
      v_new_path := _lgpd_build_new_path(rec.media_url, v_clinic);
      IF v_new_path <> rec.media_url THEN
        INSERT INTO _lgpd_storage_path_migration_log (
          bucket_id, old_name, new_name, resolved_clinic_id, source, source_row_id
        ) VALUES ('media', rec.media_url, v_new_path, v_clinic, 'broadcasts', rec.id::TEXT);
        UPDATE public.broadcasts SET media_url = v_new_path WHERE id = rec.id;
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'mig 110 · broadcasts: % migrated', v_count;
END $$;

-- ── 5. Update wa_media_bank.url ────────────────────────────────────────────
-- wa_media_bank tem clinic_id explícito · usa esse pra builder.

DO $$
DECLARE
  rec RECORD;
  v_path TEXT;
  v_new_path TEXT;
  v_count INT := 0;
  v_table_exists BOOLEAN;
BEGIN
  -- Tabela pode não existir em alguns deploys · check defensivo.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wa_media_bank'
  ) INTO v_table_exists;
  IF NOT v_table_exists THEN
    RAISE NOTICE 'mig 110 · wa_media_bank · tabela não existe · skip';
    RETURN;
  END IF;

  FOR rec IN
    SELECT id, clinic_id, url
    FROM public.wa_media_bank
    WHERE url IS NOT NULL AND url <> ''
  LOOP
    v_path := _lgpd_extract_path_from_url(rec.url);
    IF v_path IS NOT NULL THEN
      v_new_path := _lgpd_build_new_path(v_path, rec.clinic_id);
      INSERT INTO _lgpd_storage_path_migration_log (
        bucket_id, old_name, new_name, resolved_clinic_id, source, source_row_id
      ) VALUES ('media', rec.url, v_new_path, rec.clinic_id, 'wa_media_bank', rec.id::TEXT);
      UPDATE public.wa_media_bank SET url = v_new_path WHERE id = rec.id;
      v_count := v_count + 1;
    ELSIF rec.url NOT LIKE 'http%' THEN
      v_new_path := _lgpd_build_new_path(rec.url, rec.clinic_id);
      IF v_new_path <> rec.url THEN
        INSERT INTO _lgpd_storage_path_migration_log (
          bucket_id, old_name, new_name, resolved_clinic_id, source, source_row_id
        ) VALUES ('media', rec.url, v_new_path, rec.clinic_id, 'wa_media_bank', rec.id::TEXT);
        UPDATE public.wa_media_bank SET url = v_new_path WHERE id = rec.id;
        v_count := v_count + 1;
      END IF;
    END IF;
  END LOOP;
  RAISE NOTICE 'mig 110 · wa_media_bank: % migrated', v_count;
END $$;

-- ── 6. Drop helpers temporários ────────────────────────────────────────────

DROP FUNCTION IF EXISTS _lgpd_resolve_clinic_for_path(TEXT);
DROP FUNCTION IF EXISTS _lgpd_build_new_path(TEXT, UUID);
DROP FUNCTION IF EXISTS _lgpd_extract_path_from_url(TEXT);

-- ── 7. Sanity check ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_orphan_count INT;
BEGIN
  -- Conta storage.objects que NÃO começam com UUID (clinic_id) · esperado: 0
  SELECT count(*) INTO v_orphan_count
  FROM storage.objects
  WHERE bucket_id = 'media'
    AND (storage.foldername(name))[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  IF v_orphan_count > 0 THEN
    RAISE WARNING 'mig 110 · % objects ainda sem clinic_id no path · investigar antes de Fase 2 (RLS)', v_orphan_count;
    -- NÃO fazemos RAISE EXCEPTION · permite progresso parcial · admin investiga via _lgpd_storage_path_migration_log
  ELSE
    RAISE NOTICE 'mig 110 · sanity OK · todos objects no layout <clinic_id>/...';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
