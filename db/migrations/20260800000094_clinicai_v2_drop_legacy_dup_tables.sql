-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 94 · clinicai-v2 · DROP legacy duplicated tables               ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Drop 4 tabelas conceitualmente duplicadas (sem prefixo wa_) substituidas ║
-- ║ pelas canonicas com prefixo. Todas estao com 0 rows e UNUSED em todo    ║
-- ║ codigo (Lara v2, Mira, dashboard legacy) · auditoria 2026-05-03.        ║
-- ║                                                                          ║
-- ║   - conversations       → wa_conversations (73 rows)                    ║
-- ║   - messages            → wa_messages (531 rows)                         ║
-- ║   - notifications       → inbox_notifications (3 rows)                  ║
-- ║   - message_templates   → wa_message_templates (42 rows)                ║
-- ║                                                                          ║
-- ║ Doc: docs/audits/2026-05-03-database-audit.html secao 4b                 ║
-- ║ Rollback: ../20260800000094_..._drop_legacy_dup_tables.down.sql          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.message_templates CASCADE;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN (
     'conversations', 'messages', 'notifications', 'message_templates'
   );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Mig 94: % legacy tables nao foram dropadas', v_count;
  END IF;

  -- Sanity · canonicas continuam vivas
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wa_conversations') THEN
    RAISE EXCEPTION 'Mig 94: wa_conversations canonica desapareceu (BUG critico · NAO deveria acontecer)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wa_messages') THEN
    RAISE EXCEPTION 'Mig 94: wa_messages canonica desapareceu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inbox_notifications') THEN
    RAISE EXCEPTION 'Mig 94: inbox_notifications canonica desapareceu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wa_message_templates') THEN
    RAISE EXCEPTION 'Mig 94: wa_message_templates canonica desapareceu';
  END IF;

  RAISE NOTICE 'Mig 94 OK · 4 legacy dup tables dropadas · canonicas validadas';
END $$;
