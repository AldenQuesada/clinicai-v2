-- Rollback de mig 110 · LGPD media path migration.
--
-- Estratégia: usa _lgpd_storage_path_migration_log pra reverter cada move/update
-- 1:1. Tabela de log foi mantida pós-mig (drop após cooling period).
--
-- ATENÇÃO: rollback só funciona se _lgpd_storage_path_migration_log ainda existir
-- E não foi truncada. Se foi dropada, recovery exige restore de backup.

BEGIN;

-- ── 1. Reverter wa_media_bank ──────────────────────────────────────────────
DO $$
DECLARE
  rec RECORD;
  v_count INT := 0;
  v_table_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = '_lgpd_storage_path_migration_log'
  ) INTO v_table_exists;
  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'rollback impossível · _lgpd_storage_path_migration_log dropada · use backup';
  END IF;

  FOR rec IN
    SELECT source_row_id, old_name
    FROM public._lgpd_storage_path_migration_log
    WHERE source = 'wa_media_bank'
    ORDER BY id DESC
  LOOP
    UPDATE public.wa_media_bank SET url = rec.old_name WHERE id::TEXT = rec.source_row_id;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'rollback mig 110 · wa_media_bank: % reverted', v_count;
END $$;

-- ── 2. Reverter broadcasts ─────────────────────────────────────────────────
DO $$
DECLARE
  rec RECORD;
  v_count INT := 0;
BEGIN
  FOR rec IN
    SELECT source_row_id, old_name
    FROM public._lgpd_storage_path_migration_log
    WHERE source = 'broadcasts'
    ORDER BY id DESC
  LOOP
    UPDATE public.broadcasts SET media_url = rec.old_name WHERE id::TEXT = rec.source_row_id;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'rollback mig 110 · broadcasts: % reverted', v_count;
END $$;

-- ── 3. Reverter wa_messages ────────────────────────────────────────────────
DO $$
DECLARE
  rec RECORD;
  v_count INT := 0;
BEGIN
  FOR rec IN
    SELECT source_row_id, old_name
    FROM public._lgpd_storage_path_migration_log
    WHERE source = 'wa_messages'
    ORDER BY id DESC
  LOOP
    UPDATE public.wa_messages SET media_url = rec.old_name WHERE id::TEXT = rec.source_row_id;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'rollback mig 110 · wa_messages: % reverted', v_count;
END $$;

-- ── 4. Reverter storage.objects ────────────────────────────────────────────
DO $$
DECLARE
  rec RECORD;
  v_count INT := 0;
BEGIN
  FOR rec IN
    SELECT storage_object_id, old_name
    FROM public._lgpd_storage_path_migration_log
    WHERE source = 'storage.objects'
    ORDER BY id DESC
  LOOP
    UPDATE storage.objects SET name = rec.old_name WHERE id = rec.storage_object_id;
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'rollback mig 110 · storage.objects: % reverted', v_count;
END $$;

-- ── 5. Drop tabela de log ──────────────────────────────────────────────────
DROP TABLE IF EXISTS public._lgpd_storage_path_migration_log;

NOTIFY pgrst, 'reload schema';

COMMIT;
