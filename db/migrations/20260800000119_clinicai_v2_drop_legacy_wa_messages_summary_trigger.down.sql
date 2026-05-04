-- ============================================================================
-- Rollback de mig 119 · recria trigger legado trg_wa_messages_sync_conversation_summary
-- ============================================================================
--
-- ⚠️  ATENÇÃO · ROLLBACK REINTRODUZ DOUBLE-SYNC ⚠️
--
-- Este DOWN re-cria APENAS o trigger legado, apontando pra função
-- `public._wa_messages_sync_conversation_summary()` que ficou órfã (a
-- mig UP intencionalmente NÃO dropou a função pra permitir este rollback
-- sem precisar reconstruir 2.6KB de lógica).
--
-- IMPORTANTE: se `trg_sync_wa_conversation_preview_v2` (mig 116) também
-- estiver ativo neste momento (estado prod 2026-05-04), o resultado será
-- VOLTA do bug de DOUBLE-SYNC:
--   - unread_count incrementado 2x por inbound
--   - 2 UPDATEs concorrentes em wa_conversations
--   - mesmo problema que motivou mig 119
--
-- Use este DOWN APENAS se:
--   1. Você quer reverter mig 119 isoladamente para investigação, OU
--   2. Você vai rodar logo em seguida `DROP TRIGGER trg_sync_wa_conversation_preview_v2`
--      pra evitar a coexistência (cuidado: mig 116 fica sem efeito).
--
-- Defesas deste arquivo:
--   - Só recria o trigger se ele NÃO existir (DO block · evita erro 42710).
--   - Aborta se a função `_wa_messages_sync_conversation_summary` não existir
--     (caso alguém tenha dropado a função em outra migration · sem ela o
--     CREATE TRIGGER falharia com 42883).
--
-- Não toca: trigger v2 · função canônica v2 · dados · outras constraints.

BEGIN;

DO $$
DECLARE
  v_func_exists    INT;
  v_legacy_exists  INT;
BEGIN
  -- Pré-check: função legada precisa existir pra recriar o trigger
  SELECT count(*) INTO v_func_exists
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname      = '_wa_messages_sync_conversation_summary';

  IF v_func_exists <> 1 THEN
    RAISE EXCEPTION 'mig 119 DOWN · função public._wa_messages_sync_conversation_summary NÃO existe · não dá pra recriar trigger · ABORT';
  END IF;

  -- Recria só se ausente · idempotente
  SELECT count(*) INTO v_legacy_exists
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE NOT t.tgisinternal
    AND c.relname = 'wa_messages'
    AND t.tgname  = 'trg_wa_messages_sync_conversation_summary';

  IF v_legacy_exists = 0 THEN
    EXECUTE $ddl$
      CREATE TRIGGER trg_wa_messages_sync_conversation_summary
      AFTER INSERT ON public.wa_messages
      FOR EACH ROW
      EXECUTE FUNCTION public._wa_messages_sync_conversation_summary()
    $ddl$;

    RAISE NOTICE 'mig 119 DOWN · trg_wa_messages_sync_conversation_summary (legacy) recriado · ATENÇÃO double-sync se v2 ativo';
  ELSE
    RAISE NOTICE 'mig 119 DOWN · trg_wa_messages_sync_conversation_summary já existe · skip';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
