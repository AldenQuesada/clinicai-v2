-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║ Mig 144 · 2026-05-07 · wa_messages.payload jsonb                       ║
-- ║                                                                        ║
-- ║ Camada "WhatsApp Web operacional" no dash · módulo inicial: contato    ║
-- ║ compartilhado.                                                         ║
-- ║                                                                        ║
-- ║ Auditoria 2026-05-07:                                                  ║
-- ║   · Cloud salva contato com content_type='contacts' e content=         ║
-- ║     '[contacts recebido]' · perde nome/telefone do array contacts.     ║
-- ║   · Evolution descarta contactMessage / contactsArrayMessage como      ║
-- ║     skip:'empty_message' · drop silencioso sem rastro.                 ║
-- ║   · wa_messages não tem metadata/payload/jsonb.                        ║
-- ║                                                                        ║
-- ║ Solução arquitetural:                                                  ║
-- ║   · 1 coluna jsonb genérica · cobre contact + futuras features         ║
-- ║     (location, reaction, sticker metadata, forward, poll, edited,      ║
-- ║     deleted) sem 1 migration por feature.                              ║
-- ║   · Shape normalizado · NUNCA payload bruto do provider.               ║
-- ║   · Helper centralizado mapInboundToPayload() em packages/whatsapp     ║
-- ║     será introduzido na próxima etapa (B do MVP). Aqui é só DDL.       ║
-- ║                                                                        ║
-- ║ Disciplina LGPD:                                                       ║
-- ║   · vCard cru (com email/endereço) NÃO entra no payload sem            ║
-- ║     necessidade · helper futuro extrai apenas {name, phone, wa_id}.    ║
-- ║   · Coluna nullable · ausência de payload é o estado normal pra        ║
-- ║     mensagens de texto/mídia simples (continuam usando content +       ║
-- ║     media_url legacy).                                                 ║
-- ║                                                                        ║
-- ║ Mudanças:                                                              ║
-- ║   1. ADD COLUMN payload jsonb · nullable · sem default                 ║
-- ║   2. CREATE INDEX idx_wa_messages_payload_kind · expressional          ║
-- ║      ((payload->>'kind')) · partial WHERE payload IS NOT NULL ·        ║
-- ║      cobre queries `WHERE payload->>'kind' = 'contact'`                ║
-- ║   3. NOTIFY pgrst pra recarregar schema cache do PostgREST             ║
-- ║                                                                        ║
-- ║ Idempotente · ADD COLUMN IF NOT EXISTS · CREATE INDEX IF NOT EXISTS.   ║
-- ║                                                                        ║
-- ║ Não toca:                                                              ║
-- ║   · CHECK constraints (content_type não tem CHECK · auditado pré-mig)  ║
-- ║   · webhooks Cloud ou Evolution                                        ║
-- ║   · UI MessageArea ou repositories                                     ║
-- ║   · quoted reply (mig 143) ou outros pipelines                         ║
-- ║   · B2B / Mira / vouchers                                              ║
-- ║                                                                        ║
-- ║ Down: 20260800000144_..._payload_jsonb.down.sql                        ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

BEGIN;

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS payload jsonb;

COMMENT ON COLUMN public.wa_messages.payload IS
'Mig 144 · payload normalizado para mensagens ricas do WhatsApp no dash. Usado para contact, location, reaction, sticker, forward, poll e metadados futuros. Não armazenar payload bruto do provider; salvar somente shape mínimo normalizado.';

CREATE INDEX IF NOT EXISTS idx_wa_messages_payload_kind
  ON public.wa_messages ((payload->>'kind'))
  WHERE payload IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
