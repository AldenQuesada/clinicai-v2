-- ─────────────────────────────────────────────────────────────────────
-- Sprint C · 2026-04-29 · /conversas paridade WhatsApp
-- ─────────────────────────────────────────────────────────────────────
-- Adiciona 2 colunas em wa_messages pra Sprint C:
--
-- 1. internal_note (boolean default false)
--    - SC-03 / W-11 · nota interna entre atendentes
--    - Quando true, a mensagem NAO e enviada pro paciente (WhatsApp)
--    - UI renderiza como card amarelo · so atendentes veem
--    - Webhooks/triggers de envio devem ignorar rows com internal_note=true
--
-- 2. delivery_status (text · null | sent | delivered | read | failed)
--    - SC-01 / W-06 · paridade visual com WhatsApp Web (✓ ✓✓ azul)
--    - Atualizado por webhook do WhatsApp Cloud API ao receber status
--    - UI renderiza icone correspondente em msgs assistant/manual
--
-- Idempotente · safe re-run.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS internal_note boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_status text;

-- Constraint pra delivery_status valores conhecidos (se nao constraint ja
-- existir · adiciona idempotente via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wa_messages_delivery_status_check'
  ) THEN
    ALTER TABLE public.wa_messages
      ADD CONSTRAINT wa_messages_delivery_status_check
      CHECK (delivery_status IS NULL OR delivery_status IN ('sent', 'delivered', 'read', 'failed'));
  END IF;
END $$;

-- Index parcial pra olhar notas internas em conversa especifica (raras, mas
-- queries de UI podem filtrar por elas · keep barato)
CREATE INDEX IF NOT EXISTS wa_messages_internal_note_idx
  ON public.wa_messages(conversation_id)
  WHERE internal_note = true;

-- Index parcial pra delivery_status pendente · usado por jobs de retry/audit
CREATE INDEX IF NOT EXISTS wa_messages_delivery_status_pending_idx
  ON public.wa_messages(conversation_id, sent_at)
  WHERE delivery_status IS NULL OR delivery_status = 'sent';

-- PostgREST refresh
NOTIFY pgrst, 'reload schema';
