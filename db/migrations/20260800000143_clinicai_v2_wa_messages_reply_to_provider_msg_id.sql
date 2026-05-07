-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 800-143 · clinicai-v2 · wa_messages reply_to_provider_msg_id  ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Adiciona coluna pra vincular mensagem outbound ao quoted reply alvo.    ║
-- ║                                                                          ║
-- ║ Identificador canônico: provider_msg_id da mensagem original respondida.║
-- ║   - Cloud Meta:        wamid.HBgN... (formato wamid)                    ║
-- ║   - Evolution/Baileys: 32-char hex (key.id)                              ║
-- ║ Mesmo campo único · single source coberto por wa_messages.provider_msg_id║
-- ║ que já existe pra ambos providers · zero impedance mismatch.            ║
-- ║                                                                          ║
-- ║ Auditoria pré-mig confirmou que wa_messages NÃO tem coluna metadata     ║
-- ║ (nem raw/context). Por isso adicionamos campo dedicado e indexável em   ║
-- ║ vez de tentar usar jsonb soft-link.                                     ║
-- ║                                                                          ║
-- ║ Backend (POST /api/conversations/[id]/messages · próximo bloco) vai     ║
-- ║ aceitar `reply_to_message_id` (uuid interno de wa_messages) e fazer     ║
-- ║ lookup local pra extrair o provider_msg_id alvo · client nunca vê       ║
-- ║ provider_msg_id direto · isolamento ADR-005.                            ║
-- ║                                                                          ║
-- ║ Mudanças:                                                                ║
-- ║   1. ADD COLUMN reply_to_provider_msg_id text · nullable                ║
-- ║   2. COMMENT ON COLUMN documenta semantica + cobertura cross-provider   ║
-- ║   3. INDEX parcial idx_wa_messages_reply_to_provider_msg_id             ║
-- ║      (lookup reverso · "quem respondeu mensagem X?" pra UI futura)      ║
-- ║   4. NOTIFY pgrst                                                        ║
-- ║                                                                          ║
-- ║ NÃO mudou:                                                               ║
-- ║   - schema de outras tabelas (wa_conversations, b2b_*, mira_*)          ║
-- ║   - API /api/conversations/[id]/messages (sem mudança runtime)          ║
-- ║   - providers Cloud / Evolution                                          ║
-- ║   - webhooks                                                             ║
-- ║   - ledger b2b_voucher_dispatch_events                                  ║
-- ║   - delivery_policy / Authorization                                      ║
-- ║                                                                          ║
-- ║ Idempotente · ADD COLUMN IF NOT EXISTS · CREATE INDEX IF NOT EXISTS ·   ║
-- ║ pode rodar múltiplas vezes sem efeito colateral.                        ║
-- ║                                                                          ║
-- ║ Migration ADITIVA · zero breaking change · INSERT existente continua    ║
-- ║ funcional sem o novo campo (NULL default · nullable).                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

BEGIN;

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS reply_to_provider_msg_id text;

COMMENT ON COLUMN public.wa_messages.reply_to_provider_msg_id IS
'Mig 143 · provider_msg_id da mensagem original respondida via quoted reply. Cobre Cloud wamid e Evolution/Baileys key.id. NULL para mensagens sem reply.';

CREATE INDEX IF NOT EXISTS idx_wa_messages_reply_to_provider_msg_id
  ON public.wa_messages (reply_to_provider_msg_id)
  WHERE reply_to_provider_msg_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
