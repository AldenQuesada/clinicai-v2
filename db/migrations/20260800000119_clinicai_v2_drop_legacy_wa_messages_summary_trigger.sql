-- ============================================================================
-- Drop trigger legado trg_wa_messages_sync_conversation_summary
-- ============================================================================
--
-- Contexto · audit 2026-05-04:
--
-- Após mig 116 introduzir `trg_sync_wa_conversation_preview_v2` como defesa
-- em profundidade pra sync de preview/unread em wa_conversations, o trigger
-- legado `trg_wa_messages_sync_conversation_summary` continuou ativo. Os
-- dois rodavam AFTER INSERT em wa_messages, ambos atualizando os MESMOS
-- campos de wa_conversations (last_message_*, last_lead_msg, last_inbound_time,
-- unread_count, last_ai_msg).
--
-- Efeito observado:
--   - unread_count incrementado 2x por inbound · contagem inflada na inbox
--   - 2 UPDATEs no mesmo row de wa_conversations por mensagem · race window
--     dobrada · custo I/O dobrado
--   - preview text idêntico nos 2 (idempotente) · só desperdício
--
-- Resolução manual em prod (2026-05-04): trigger legado foi removido via
-- DDL ad-hoc. Ficou apenas `trg_sync_wa_conversation_preview_v2` apontando
-- pra `_sync_wa_conversation_preview_v2()` (canônico mig 116 · race-safe ·
-- exception-safe · com guard de status='note' e content vazio).
--
-- Esta migration apenas VERSIONA no git a remoção já aplicada em prod.
-- DROP IF EXISTS é idempotente · reaplicar em prod = no-op.
--
-- O QUE NÃO FAZ:
--   - NÃO dropa a função `_wa_messages_sync_conversation_summary()` · ela
--     fica órfã mas inofensiva. Manter permite que o DOWN deste arquivo
--     reverta sem precisar recriar a função (que tem 2.6KB de lógica que
--     não queremos perder caso precise rollback).
--   - NÃO toca em `trg_sync_wa_conversation_preview_v2` (mig 116) nem na
--     função canônica `_sync_wa_conversation_preview_v2()`.
--   - NÃO toca em dados.

BEGIN;

-- ── 1. Drop trigger legado ────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_wa_messages_sync_conversation_summary
  ON public.wa_messages;

-- ── 2. Sanity check ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_legacy_exists  INT;
  v_v2_exists      INT;
  v_v2_func        TEXT;
BEGIN
  -- (a) trigger legado NÃO deve mais existir
  SELECT count(*) INTO v_legacy_exists
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE NOT t.tgisinternal
    AND c.relname = 'wa_messages'
    AND t.tgname  = 'trg_wa_messages_sync_conversation_summary';

  IF v_legacy_exists <> 0 THEN
    RAISE EXCEPTION 'mig 119 · trg_wa_messages_sync_conversation_summary ainda existe · DROP falhou';
  END IF;

  -- (b) trigger v2 (mig 116) DEVE existir
  SELECT count(*) INTO v_v2_exists
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  WHERE NOT t.tgisinternal
    AND c.relname = 'wa_messages'
    AND t.tgname  = 'trg_sync_wa_conversation_preview_v2';

  IF v_v2_exists <> 1 THEN
    RAISE EXCEPTION 'mig 119 · trg_sync_wa_conversation_preview_v2 (canônico mig 116) NÃO existe · estado inconsistente · ABORT';
  END IF;

  -- (c) v2 aponta para a função canônica
  SELECT p.proname INTO v_v2_func
  FROM pg_trigger t
  JOIN pg_class c ON t.tgrelid = c.oid
  JOIN pg_proc  p ON t.tgfoid  = p.oid
  WHERE NOT t.tgisinternal
    AND c.relname = 'wa_messages'
    AND t.tgname  = 'trg_sync_wa_conversation_preview_v2';

  IF v_v2_func IS DISTINCT FROM '_sync_wa_conversation_preview_v2' THEN
    RAISE EXCEPTION 'mig 119 · trg_sync_wa_conversation_preview_v2 aponta pra função inesperada · proname=%', v_v2_func;
  END IF;

  RAISE NOTICE 'mig 119 · trg_wa_messages_sync_conversation_summary removido · v2 canônico intacto · OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
