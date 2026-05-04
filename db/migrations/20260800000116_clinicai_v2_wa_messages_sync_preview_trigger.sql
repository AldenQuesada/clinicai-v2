-- ============================================================================
-- Trigger AFTER INSERT em wa_messages · sync preview em wa_conversations
-- ============================================================================
--
-- Contexto · audit 2026-05-04:
--
-- 1. Trigger zumbi `fn_sync_wa_conversation_preview` foi DROPPED de manhã
--    (04:21 UTC) pq usava colunas inexistentes (last_message_content,
--    is_outbound) e quebrou TODO insert em wa_messages por horas.
--
-- 2. Sync hoje vive em código aplicacional (`repos.conversations.updateLastMessage`)
--    chamado após saveInbound nos 2 webhooks. Funciona pra inbounds via webhook
--    MAS não cobre:
--      a. Inserts de cron pg interno (broadcasts aniversário · b2b_voucher_followup · etc)
--      b. Inserts de edge functions / n8n legacy
--      c. last_inbound_time (app esqueceu · NULL em ~todas convs)
--      d. unread_count (app NUNCA incrementa · 0 em todas)
--
-- 3. Bug 2026-05-03 ("preview 'Sim' sem msg") voltaria se app esquecer
--    updateLastMessage. Trigger é defesa em profundidade.
--
-- O que esta mig faz:
--
--   Cria fn _sync_wa_conversation_preview_v2 (nome v2 pra distinguir do zumbi)
--   + trigger trg_sync_wa_conversation_preview_v2 AFTER INSERT em wa_messages.
--
--   Atualiza wa_conversations.{last_message_at, last_message_text, last_lead_msg,
--   last_ai_msg, last_inbound_time, unread_count} de forma RACE-SAFE e idempotente.
--
-- Guards (críticos · evita que trigger duplique ou regrida):
--
--   1. Internal note (status='note' OR internal_note=true) → skip · não afeta preview
--   2. WHERE last_message_at IS NULL OR last_message_at < NEW.sent_at
--      → preview só anda PRA FRENTE no tempo · evita race com app updateLastMessage
--      (se app já atualizou pra timestamp mais recente, trigger é no-op)
--   3. unread_count incremento APENAS pra direction='inbound'
--   4. Outbound humano (sender='humano' · seja Luciana real ou auto-greeting) → reset unread_count=0
--   5. EXCEPTION WHEN OTHERS → log + RETURN NEW · NUNCA bloquear o INSERT
--      (lição aprendida do trigger zumbi · prefere preview desatualizado a inbox quebrado)
--
-- ADR-029: SECURITY DEFINER + SET search_path · GRANT só pelo trigger (auto).
-- GOLD-STANDARD: idempotente · sanity check final · rollback completo.

BEGIN;

-- ── 0. Pré-checks defensivos ──────────────────────────────────────────────
DO $$
DECLARE
  v_check INT;
BEGIN
  -- Confirma que TODAS as colunas alvo existem em wa_conversations
  -- (lição do trigger zumbi · referenciava cols inexistentes)
  SELECT count(*) INTO v_check
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='wa_conversations'
    AND column_name IN ('last_message_at','last_message_text','last_lead_msg','last_ai_msg','last_inbound_time','unread_count');

  IF v_check <> 6 THEN
    RAISE EXCEPTION 'mig 116 ABORT · wa_conversations não tem as 6 colunas alvo · encontrou só %', v_check;
  END IF;

  -- Confirma que zumbi não voltou
  IF EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='fn_sync_wa_conversation_preview') THEN
    RAISE EXCEPTION 'mig 116 ABORT · fn_sync_wa_conversation_preview (zumbi) ainda existe · investigar antes';
  END IF;
END $$;

-- ── 1. Function ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._sync_wa_conversation_preview_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_preview_text TEXT;
BEGIN
  -- Guard 1: notas internas não afetam preview · usa status='note' (mig 86
  -- adicionaria coluna internal_note · ainda não aplicada em prod 2026-05-04 ·
  -- safe fallback é só status pra evitar ERROR record "new" has no field).
  IF NEW.status = 'note' THEN
    RETURN NEW;
  END IF;

  -- Guard 2: content vazio · skip
  IF NEW.content IS NULL OR length(trim(NEW.content)) = 0 THEN
    RETURN NEW;
  END IF;

  v_preview_text := substring(trim(NEW.content), 1, 200);

  BEGIN
    IF NEW.direction = 'inbound' THEN
      -- Inbound do paciente: avança preview + last_lead_msg + last_inbound_time + unread++
      UPDATE public.wa_conversations
      SET
        last_message_at   = NEW.sent_at,
        last_message_text = v_preview_text,
        last_lead_msg     = NEW.sent_at,
        last_inbound_time = NEW.sent_at,
        unread_count      = COALESCE(unread_count, 0) + 1,
        updated_at        = NOW()
      WHERE id = NEW.conversation_id
        AND (last_message_at IS NULL OR last_message_at < NEW.sent_at);

    ELSIF NEW.direction = 'outbound' AND NEW.sender = 'humano' THEN
      -- Humano respondeu (Luciana real OU auto-greeting): zera unread + avança preview
      UPDATE public.wa_conversations
      SET
        last_message_at   = NEW.sent_at,
        last_message_text = v_preview_text,
        unread_count      = 0,
        updated_at        = NOW()
      WHERE id = NEW.conversation_id
        AND (last_message_at IS NULL OR last_message_at < NEW.sent_at);

    ELSIF NEW.direction = 'outbound' AND NEW.sender = 'lara' THEN
      -- IA respondeu: avança last_ai_msg + preview · NÃO zera unread
      -- (paciente ainda pode ter inbound não-vista pendente que IA não tratou)
      UPDATE public.wa_conversations
      SET
        last_message_at   = NEW.sent_at,
        last_message_text = v_preview_text,
        last_ai_msg       = NEW.sent_at,
        updated_at        = NOW()
      WHERE id = NEW.conversation_id
        AND (last_message_at IS NULL OR last_message_at < NEW.sent_at);

    ELSE
      -- Outros (system, atendente, etc): só atualiza preview se mais recente
      UPDATE public.wa_conversations
      SET
        last_message_at   = NEW.sent_at,
        last_message_text = v_preview_text,
        updated_at        = NOW()
      WHERE id = NEW.conversation_id
        AND (last_message_at IS NULL OR last_message_at < NEW.sent_at);
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- LIÇÃO DO TRIGGER ZUMBI: NUNCA quebrar o INSERT por causa do sync.
    -- Loga em _trigger_error_log se a infra existir · senão silent.
    BEGIN
      PERFORM public._trigger_log(
        '_sync_wa_conversation_preview_v2', 'wa_messages',
        SQLERRM, SQLSTATE,
        jsonb_build_object('msg_id', NEW.id, 'conversation_id', NEW.conversation_id, 'direction', NEW.direction, 'sender', NEW.sender)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._sync_wa_conversation_preview_v2() IS
  'Sync wa_conversations.{last_message_*, last_lead_msg, last_inbound_time, unread_count} after wa_messages INSERT. Race-safe · idempotente · NUNCA bloqueia INSERT.';

-- ── 2. Trigger ─────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_sync_wa_conversation_preview_v2 ON public.wa_messages;

CREATE TRIGGER trg_sync_wa_conversation_preview_v2
AFTER INSERT ON public.wa_messages
FOR EACH ROW
EXECUTE FUNCTION public._sync_wa_conversation_preview_v2();

-- ── 3. Sanity check ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_func_exists INT;
  v_trigger_exists INT;
  v_func_definer BOOLEAN;
BEGIN
  SELECT count(*) INTO v_func_exists
  FROM pg_proc
  WHERE pronamespace='public'::regnamespace AND proname='_sync_wa_conversation_preview_v2';
  IF v_func_exists <> 1 THEN
    RAISE EXCEPTION 'mig 116 · function não criada · count=%', v_func_exists;
  END IF;

  SELECT count(*) INTO v_trigger_exists
  FROM information_schema.triggers
  WHERE event_object_schema='public'
    AND event_object_table='wa_messages'
    AND trigger_name='trg_sync_wa_conversation_preview_v2';
  IF v_trigger_exists <> 1 THEN
    RAISE EXCEPTION 'mig 116 · trigger não criada · count=%', v_trigger_exists;
  END IF;

  SELECT prosecdef INTO v_func_definer
  FROM pg_proc
  WHERE pronamespace='public'::regnamespace AND proname='_sync_wa_conversation_preview_v2';
  IF v_func_definer IS NOT TRUE THEN
    RAISE EXCEPTION 'mig 116 · function não é SECURITY DEFINER';
  END IF;

  RAISE NOTICE 'mig 116 · trigger v2 criado · function DEFINER · sync ativo em wa_messages AFTER INSERT';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
