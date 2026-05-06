-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-133 · clinicai-v2 · wa_chat_mirror                          ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Espelho da lista de chats da instância Evolution (Baileys store) ·       ║
-- ║ fonte de ordem REAL pro inbox /secretaria · supera limitação de          ║
-- ║ wa_conversations.last_message_at (que só registra o que o webhook        ║
-- ║ capturou · perde grupos, calls, eventos não-message).                    ║
-- ║                                                                          ║
-- ║ Fluxo:                                                                   ║
-- ║   1. Cron /api/cron/wa-chat-sync (a definir cadência) chama Evolution    ║
-- ║      POST /chat/findChats/{instance} body {} · retorna ~1066 chats       ║
-- ║   2. Normaliza cada item · extrai remote_jid de lastMessage.key.remoteJid║
-- ║      (top-level item.id é null em Evolution v2)                          ║
-- ║   3. UPSERT por (clinic_id, wa_number_id, remote_jid) · raw_chat jsonb   ║
-- ║      preserva payload completo pra audit/refactor futuro                 ║
-- ║   4. Dash novo lê desta tabela quando inbox=secretaria · ORDER BY        ║
-- ║      last_message_at DESC (próximo commit · não neste)                   ║
-- ║                                                                          ║
-- ║ Escopo Commit 1 (esta mig): só schema + trigger updated_at. Sync via    ║
-- ║ endpoint Next.js no próximo step. Integração com /api/conversations e    ║
-- ║ UI fica pra Commit 2.                                                    ║
-- ║                                                                          ║
-- ║ Idempotente · CREATE TABLE IF NOT EXISTS · CREATE INDEX IF NOT EXISTS ·  ║
-- ║ DROP TRIGGER + CREATE.                                                   ║
-- ║                                                                          ║
-- ║ ADR-029: SECURITY DEFINER + SET search_path · GRANT explícito           ║
-- ║ GOLD-STANDARD: idempotente · sanity check final · pgrst reload          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. CREATE TABLE wa_chat_mirror
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wa_chat_mirror (
  id                            uuid        NOT NULL DEFAULT gen_random_uuid(),

  clinic_id                     uuid        NOT NULL,
  wa_number_id                  uuid        NOT NULL,

  remote_jid                    text        NOT NULL,
  remote_kind                   text        NOT NULL,

  phone_e164                    text        NULL,
  group_id                      text        NULL,
  lid_id                        text        NULL,

  push_name                     text        NULL,
  group_subject                 text        NULL,
  display_name                  text        NULL,

  unread_count                  integer     NOT NULL DEFAULT 0,

  last_message_id               text        NULL,
  last_message_type             text        NULL,
  last_message_text             text        NULL,
  last_message_from_me          boolean     NULL,
  last_message_participant_jid  text        NULL,
  last_message_sender_pn        text        NULL,

  last_message_timestamp        bigint      NOT NULL,
  last_message_at               timestamptz NOT NULL,

  raw_chat                      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at                timestamptz NOT NULL DEFAULT now(),

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wa_chat_mirror_pkey PRIMARY KEY (id),
  CONSTRAINT wa_chat_mirror_remote_kind_check
    CHECK (remote_kind IN ('private', 'group', 'lid', 'unknown')),
  CONSTRAINT wa_chat_mirror_unique_per_channel
    UNIQUE (clinic_id, wa_number_id, remote_jid)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. FK wa_number_id → wa_numbers(id) ON DELETE CASCADE (DO block · guard)
-- ═══════════════════════════════════════════════════════════════════════════

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wa_chat_mirror'::regclass
      AND conname  = 'wa_chat_mirror_wa_number_id_fkey'
  ) THEN
    ALTER TABLE public.wa_chat_mirror
      ADD CONSTRAINT wa_chat_mirror_wa_number_id_fkey
      FOREIGN KEY (wa_number_id) REFERENCES public.wa_numbers(id) ON DELETE CASCADE;
  END IF;
END
$constraints$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- Inbox listing · ORDER BY last_message_at DESC scoped por clinic+canal
CREATE INDEX IF NOT EXISTS wa_chat_mirror_inbox_order
  ON public.wa_chat_mirror (clinic_id, wa_number_id, last_message_at DESC);

-- Filtro por tipo (private/group/lid)
CREATE INDEX IF NOT EXISTS wa_chat_mirror_kind
  ON public.wa_chat_mirror (clinic_id, wa_number_id, remote_kind);

-- Lookup por phone (matching com wa_conversations.phone)
CREATE INDEX IF NOT EXISTS wa_chat_mirror_phone
  ON public.wa_chat_mirror (wa_number_id, phone_e164)
  WHERE phone_e164 IS NOT NULL;

-- Lookup por LID (privacy mode resolution)
CREATE INDEX IF NOT EXISTS wa_chat_mirror_lid
  ON public.wa_chat_mirror (wa_number_id, lid_id)
  WHERE lid_id IS NOT NULL;

-- GIN pra queries jsonb ad-hoc no raw_chat (audit/debug)
CREATE INDEX IF NOT EXISTS wa_chat_mirror_raw_gin
  ON public.wa_chat_mirror USING GIN (raw_chat);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Trigger updated_at (espelha pattern de webhook_processing_queue mig 011)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._wa_chat_mirror_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_wa_chat_mirror_updated_at ON public.wa_chat_mirror;
CREATE TRIGGER trg_wa_chat_mirror_updated_at
  BEFORE UPDATE ON public.wa_chat_mirror
  FOR EACH ROW
  EXECUTE FUNCTION public._wa_chat_mirror_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. GRANTs · service_role only (sync interno via Next.js API)
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON TABLE public.wa_chat_mirror FROM PUBLIC, anon, authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON TABLE public.wa_chat_mirror TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Reload PostgREST schema cache (regra GOLD #10)
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Sanity check final (regra GOLD #7)
-- ═══════════════════════════════════════════════════════════════════════════

DO $sanity$
DECLARE
  v_check int;
BEGIN
  -- Tabela existe
  SELECT COUNT(*) INTO v_check
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name   = 'wa_chat_mirror';
  IF v_check < 1 THEN
    RAISE EXCEPTION '[mig 133 sanity] wa_chat_mirror NAO criada';
  END IF;

  -- Trigger existe
  SELECT COUNT(*) INTO v_check
    FROM pg_trigger
   WHERE tgname = 'trg_wa_chat_mirror_updated_at';
  IF v_check < 1 THEN
    RAISE EXCEPTION '[mig 133 sanity] trigger trg_wa_chat_mirror_updated_at NAO criada';
  END IF;

  -- Indexes esperados
  SELECT COUNT(*) INTO v_check
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename  = 'wa_chat_mirror';
  IF v_check < 5 THEN
    RAISE WARNING '[mig 133 sanity] esperava >=5 indexes em wa_chat_mirror, achou %', v_check;
  END IF;

  -- GRANT service_role
  SELECT COUNT(*) INTO v_check
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND table_name   = 'wa_chat_mirror'
     AND grantee      = 'service_role'
     AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  IF v_check < 4 THEN
    RAISE WARNING '[mig 133 sanity] GRANT service_role incompleto · achou % de 4', v_check;
  END IF;

  RAISE NOTICE '[mig 133] sanity ok · wa_chat_mirror pronta pra sync';
END
$sanity$;

COMMIT;
