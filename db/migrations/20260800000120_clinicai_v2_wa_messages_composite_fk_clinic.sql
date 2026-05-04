-- ============================================================================
-- FK composta wa_messages(conversation_id, clinic_id) → wa_conversations(id, clinic_id)
-- ============================================================================
--
-- Contexto · audit 2026-05-04:
--
-- Antes desta migration, wa_messages tinha 2 FKs simples independentes:
--   1. wa_messages_conversation_id_fkey: (conversation_id) → wa_conversations(id)
--   2. fk_wa_messages_clinic:            (clinic_id)       → clinics(id)
--
-- Essa configuração permitia, em teoria, que uma mensagem fosse inserida com
-- conversation_id apontando pra uma conversa DA CLÍNICA A e clinic_id sendo
-- DA CLÍNICA B · cross-tenant write não bloqueado pelo DB (RLS/ADR-028
-- protegiam, mas falha de aplicação ou bypass via service_role escapava).
--
-- Esta mig adiciona defesa estrutural no DB:
--
--   uq_wa_conversations_id_clinic_id     UNIQUE (id, clinic_id)
--     → tecnicamente redundante (id já é PK · sempre único), mas necessário
--       porque PG exige UNIQUE/PK no target de uma FK composta. Custo: 1
--       índice extra (~1 row por wa_conversations · 95 rows hoje · trivial).
--
--   fk_wa_messages_conversation_clinic   FK composta com ON DELETE CASCADE
--     → o banco passa a REJEITAR INSERT em wa_messages onde
--       (conversation_id, clinic_id) não case com wa_conversations(id, clinic_id).
--       CASCADE preserva comportamento atual (delete de conversa cascateia mensagens).
--
-- Validação manual prévia em prod (2026-05-04):
--   - cross-tenant mismatches = 0
--   - missing conversations  = 0
--   - messages_with_null_conversation_id = 3 (não bloqueiam FK · NULL é permitido)
--
-- Esta migration apenas VERSIONA no git as 2 constraints já criadas em prod.
-- ADD CONSTRAINT via DO block · só cria se ausente · idempotente.
--
-- O QUE NÃO FAZ:
--   - NÃO remove FK simples `wa_messages_conversation_id_fkey` (coexiste · triplo cinto).
--   - NÃO remove `fk_wa_messages_clinic` (FK simples a clinics).
--   - NÃO mexe nas 3 mensagens com conversation_id NULL · FK composta aceita NULLs.
--   - NÃO toca em dados.

BEGIN;

-- ── 0. Sanity pré-check ────────────────────────────────────────────────────
-- Se houver violação real (mismatch ou missing), aborta antes de tentar criar
-- a FK · evita ERROR 23503 confuso em produção e força investigação manual.

DO $$
DECLARE
  v_missing      INT;
  v_mismatch     INT;
BEGIN
  -- (a) wa_messages com conversation_id não-nulo apontando pra conversa que não existe
  SELECT count(*) INTO v_missing
  FROM public.wa_messages m
  WHERE m.conversation_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.wa_conversations c
      WHERE c.id = m.conversation_id
    );

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'mig 120 ABORT · % mensagens com conversation_id apontando pra conversa inexistente · investigar antes', v_missing;
  END IF;

  -- (b) wa_messages com conversation_id não-nulo cujo clinic_id diverge da conversa
  SELECT count(*) INTO v_mismatch
  FROM public.wa_messages m
  JOIN public.wa_conversations c ON c.id = m.conversation_id
  WHERE m.clinic_id IS DISTINCT FROM c.clinic_id;

  IF v_mismatch > 0 THEN
    RAISE EXCEPTION 'mig 120 ABORT · % mensagens cross-tenant (clinic_id diverge da conversa) · investigar antes', v_mismatch;
  END IF;

  RAISE NOTICE 'mig 120 · pré-check OK · 0 missing · 0 mismatch';
END $$;

-- ── 1. UNIQUE (id, clinic_id) em wa_conversations ─────────────────────────
-- Necessário como target da FK composta · idempotente.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wa_conversations'::regclass
      AND conname  = 'uq_wa_conversations_id_clinic_id'
  ) THEN
    ALTER TABLE public.wa_conversations
      ADD CONSTRAINT uq_wa_conversations_id_clinic_id
      UNIQUE (id, clinic_id);

    RAISE NOTICE 'mig 120 · uq_wa_conversations_id_clinic_id criado';
  ELSE
    RAISE NOTICE 'mig 120 · uq_wa_conversations_id_clinic_id já existe · skip';
  END IF;
END $$;

-- ── 2. FK composta (conversation_id, clinic_id) → wa_conversations(id, clinic_id) ──

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wa_messages'::regclass
      AND conname  = 'fk_wa_messages_conversation_clinic'
  ) THEN
    ALTER TABLE public.wa_messages
      ADD CONSTRAINT fk_wa_messages_conversation_clinic
      FOREIGN KEY (conversation_id, clinic_id)
      REFERENCES public.wa_conversations(id, clinic_id)
      ON DELETE CASCADE;

    RAISE NOTICE 'mig 120 · fk_wa_messages_conversation_clinic criada';
  ELSE
    RAISE NOTICE 'mig 120 · fk_wa_messages_conversation_clinic já existe · skip';
  END IF;
END $$;

-- ── 3. Sanity pós-check ────────────────────────────────────────────────────

DO $$
DECLARE
  v_uniq_exists  INT;
  v_fk_exists    INT;
  v_fk_def       TEXT;
BEGIN
  SELECT count(*) INTO v_uniq_exists
  FROM pg_constraint
  WHERE conrelid = 'public.wa_conversations'::regclass
    AND conname  = 'uq_wa_conversations_id_clinic_id';
  IF v_uniq_exists <> 1 THEN
    RAISE EXCEPTION 'mig 120 · uq_wa_conversations_id_clinic_id não existe pós-mig';
  END IF;

  SELECT count(*) INTO v_fk_exists
  FROM pg_constraint
  WHERE conrelid = 'public.wa_messages'::regclass
    AND conname  = 'fk_wa_messages_conversation_clinic';
  IF v_fk_exists <> 1 THEN
    RAISE EXCEPTION 'mig 120 · fk_wa_messages_conversation_clinic não existe pós-mig';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_fk_def
  FROM pg_constraint
  WHERE conrelid = 'public.wa_messages'::regclass
    AND conname  = 'fk_wa_messages_conversation_clinic';
  IF v_fk_def NOT ILIKE '%(conversation_id, clinic_id)%'
     OR v_fk_def NOT ILIKE '%wa_conversations(id, clinic_id)%'
     OR v_fk_def NOT ILIKE '%CASCADE%' THEN
    RAISE EXCEPTION 'mig 120 · FK composta com definição inesperada · def=%', v_fk_def;
  END IF;

  RAISE NOTICE 'mig 120 · UNIQUE + FK composta validados · OK';
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
