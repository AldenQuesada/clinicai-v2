-- ============================================================================
-- DROP de 3 colunas mortas em wa_conversations e wa_messages
-- ============================================================================
--
-- Contexto · audit 2026-05-04 (Passo 6 do plano da auditoria):
--
-- As 3 colunas abaixo foram adicionadas em algum momento ao schema (provavelmente
-- via Supabase Studio sem versionamento) e nunca foram exercitadas:
--
--   1. public.wa_conversations.daily_ai_responses (integer · DEFAULT 0)
--      - zero uso em runtime aplicacional
--      - zero uso em RPCs / functions / views / triggers
--      - 0/111 rows com valor > 0 em prod
--      - intenção parecia ser daily-limit de respostas IA · feature nunca implementada
--
--   2. public.wa_messages.read_at (timestamptz · NULLABLE)
--      - zero uso em runtime aplicacional (matches em outros arquivos referenciam
--        inbox_notifications.read_at OU tabelas legacy · não wa_messages)
--      - zero uso em RPCs / functions / views / triggers
--      - 0/917 rows populadas em prod
--      - intenção parecia ser read-receipt do Cloud (Meta) · feature nunca implementada
--
--   3. public.wa_messages.debounce_processed (boolean · DEFAULT false)
--      - zero uso em runtime aplicacional (debounce vive no app via setTimeout 5s)
--      - zero uso em RPCs / functions / views / triggers
--      - 0/917 rows com valor true em prod
--      - flag nunca foi escrita
--
-- O QUE ESTA MIG NÃO TOCA (mantém):
--   - wa_conversations.handoff_to_secretaria_at / _by  → feature pronta end-to-end
--     (UI + RPC wa_conversation_handoff_secretaria + DTO + mapper)
--   - wa_conversations.processing_lock_id / processing_locked_at → CRÍTICO ·
--     usado em TODA inbound Cloud via wa_claim/release/clear_stuck/claim_reactivation_batch
--   - wa_messages.deleted_at → usado por RPC wa_secretaria_auto_greeting_claim
--     (mig 117) E RLS wa_messages_select_clinic (mig 121) · ambas pushadas hoje
--
-- Pré-checks (aborta se houver dados):
--   Mesmo o audit confirmando 0 rows, a mig roda os checks DE NOVO no momento
--   da aplicação · proteção contra surpresa em ambientes que aplicaram desvio
--   recente (staging/dev). Aborta com mensagem clara em vez de perder dados.
--
-- ATENÇÃO CALLER:
--   Após aplicar esta mig em prod, regenerar packages/supabase/src/types.ts
--   (Database['public']['Tables'].wa_conversations / wa_messages) · senão
--   typecheck do app vai reclamar das 3 propriedades fantasma. Não é mig issue ·
--   é manutenção de tipos auto-gerados.

BEGIN;

-- ── 0. Sanity pré-condição · aborta se houver dados ───────────────────────

DO $$
DECLARE
  v_dailyai_count   INT;
  v_readat_count    INT;
  v_debounce_count  INT;
  v_dailyai_exists  BOOLEAN;
  v_readat_exists   BOOLEAN;
  v_debounce_exists BOOLEAN;
BEGIN
  -- Verifica existência (idempotente · se coluna já foi dropada, skip o count)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wa_conversations' AND column_name='daily_ai_responses'
  ) INTO v_dailyai_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wa_messages' AND column_name='read_at'
  ) INTO v_readat_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wa_messages' AND column_name='debounce_processed'
  ) INTO v_debounce_exists;

  IF v_dailyai_exists THEN
    EXECUTE 'SELECT count(*) FROM public.wa_conversations WHERE COALESCE(daily_ai_responses, 0) > 0'
      INTO v_dailyai_count;
    IF v_dailyai_count > 0 THEN
      RAISE EXCEPTION 'mig 123 ABORT · wa_conversations.daily_ai_responses tem % rows com valor > 0 · feature foi exercitada · re-auditar antes de dropar', v_dailyai_count;
    END IF;
  END IF;

  IF v_readat_exists THEN
    EXECUTE 'SELECT count(*) FROM public.wa_messages WHERE read_at IS NOT NULL'
      INTO v_readat_count;
    IF v_readat_count > 0 THEN
      RAISE EXCEPTION 'mig 123 ABORT · wa_messages.read_at tem % rows populadas · feature foi exercitada · re-auditar antes de dropar', v_readat_count;
    END IF;
  END IF;

  IF v_debounce_exists THEN
    EXECUTE 'SELECT count(*) FROM public.wa_messages WHERE debounce_processed = true'
      INTO v_debounce_count;
    IF v_debounce_count > 0 THEN
      RAISE EXCEPTION 'mig 123 ABORT · wa_messages.debounce_processed tem % rows com valor true · feature foi exercitada · re-auditar antes de dropar', v_debounce_count;
    END IF;
  END IF;

  RAISE NOTICE 'mig 123 · sanity pré OK · 0 dados nas 3 colunas alvo (existência: dailyai=% readat=% debounce=%)',
    v_dailyai_exists, v_readat_exists, v_debounce_exists;
END $$;

-- ── 1. DROP das 3 colunas (idempotente via IF EXISTS) ─────────────────────

ALTER TABLE public.wa_conversations
  DROP COLUMN IF EXISTS daily_ai_responses;

ALTER TABLE public.wa_messages
  DROP COLUMN IF EXISTS read_at;

ALTER TABLE public.wa_messages
  DROP COLUMN IF EXISTS debounce_processed;

-- ── 2. Sanity pós · confirma que as 3 colunas não existem mais ────────────

DO $$
DECLARE
  v_remaining INT;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'wa_conversations' AND column_name = 'daily_ai_responses')
      OR (table_name = 'wa_messages' AND column_name = 'read_at')
      OR (table_name = 'wa_messages' AND column_name = 'debounce_processed')
    );

  IF v_remaining <> 0 THEN
    RAISE EXCEPTION 'mig 123 · % colunas ainda existem após DROP · estado inesperado', v_remaining;
  END IF;

  RAISE NOTICE 'mig 123 · 3 colunas mortas removidas · daily_ai_responses + read_at + debounce_processed · OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
