# Handoff Lara → Secretaria · Mig 91

**Status:** v1 implementada · 2026-05-03

## Problema

A clínica tem 2 números WhatsApp distintos:

- **Lara SDR** · `554499588773` · Cloud API · IA conduz o lead até estar pronto
- **Secretaria** · número próprio da clínica · humano (sem IA)

Casos a cobrir:

1. **Inbound direto na secretaria** — lead manda direto no número da clínica, sem passar pela Lara
2. **Handoff Lara → Secretaria** — Lara conduziu, achou ponto certo, entrega pra secretaria fechar agendamento

## Arquitetura

### Schema (mig 91)

```
wa_numbers
  ├─ inbox_role  text NOT NULL DEFAULT 'sdr'  CHECK in ('sdr', 'secretaria')
  └─ ...

wa_conversations
  ├─ inbox_role  text NOT NULL DEFAULT 'sdr'   -- denorm cache
  ├─ handoff_to_secretaria_at  timestamptz NULL
  ├─ handoff_to_secretaria_by  uuid → profiles(id)
  └─ trigger fn_wa_conversations_inbox_role_sync
       BEFORE INSERT/UPDATE OF wa_number_id
       → copia inbox_role do wa_numbers
```

### Routing inbound

Webhook recebe Meta payload com `phone_number_id`. Resolve `wa_number_id` via
RPC `wa_numbers_resolve_by_phone_number_id`. Cria/encontra conversation com
esse `wa_number_id` (trigger sincroniza `inbox_role`).

```
if conv.inbox_role === 'secretaria':
    save inbound message
    create inbox_notification (kind='inbound_secretaria')
    return  ← SEM IA
else:
    flow normal Lara (debounce, lock, IA, dispatch)
```

### Routing outbound

Já per-tenant desde mig 800-49. A `/secretaria` reusa
`/api/conversations/[id]/messages` que chama `createWhatsAppCloudFromWaNumber`
com `conv.wa_number_id` → token correto resolvido automaticamente.

### Handoff signal

Lara emite tag `[ACIONAR_HUMANO:secretaria]` quando IA decide passar.
Webhook chama RPC `wa_conversation_handoff_secretaria(conv_id)` que:

1. Marca `handoff_to_secretaria_at = now()`
2. Pausa Lara 30 dias (`ai_paused_until`, `ai_enabled=false`, `ai_paused_by='handoff_secretaria'`)
3. Dispara `inbox_notification(source='system', kind='handoff_secretaria')`

Botão "Passar pra secretaria" no painel direito do `/conversas` chama o mesmo
RPC via `POST /api/conversations/[id]/handoff-secretaria`.

RPC é **idempotente** — re-chamar não duplica notificação.

### UI

| Rota          | Filtro                                       | Sem                                           |
| ------------- | -------------------------------------------- | --------------------------------------------- |
| `/conversas`  | `inbox_role='sdr'`                           | -                                             |
| `/secretaria` | `inbox_role='secretaria'`                    | AgentPauseSection · NextActions IA · botão handoff |

## Operação

### Cadastrar número da secretaria

1. Onboarding Meta Cloud API pro novo número (BSP/Embedded Signup) →
   gera `phone_number_id` + `access_token`
2. SQL pra registrar:

```sql
INSERT INTO wa_numbers
  (clinic_id, phone, label, phone_number_id, access_token, verify_token,
   number_type, inbox_role, is_active)
VALUES
  ('<clinic_uuid>', '<phone_e164>', 'Secretaria', '<phone_number_id_meta>',
   '<access_token>', '<verify_token>', 'oficial', 'secretaria', true);
```

3. Configurar webhook Meta apontando pro mesmo `/api/webhook/whatsapp` (o
   webhook resolve o número correto via `phone_number_id`)

### V1 limitações conhecidas

- **Pickup de handoff é manual.** Quando Lara faz handoff, a conversa
  original continua com `wa_number_id = lara`. Pra secretaria iniciar do
  número dela, atendente precisa abrir contato manual via UI fora da
  conversa (V2: botão "Pegar handoff" cria nova conversation com
  `wa_number_id = secretaria` + envia template Cloud API)
- **Histórico fragmentado.** Conversa Lara fica visível em `/conversas`,
  conversa Secretaria (V2) fica em `/secretaria`. Não há merge view do
  mesmo lead cross-inbox

### Rollback

```sql
\i db/migrations/20260800000091_clinicai_v2_inbox_role_secretaria_handoff.down.sql
```

Frontend volta sozinho ao próximo deploy se reverter os arquivos:
- `apps/lara/src/app/(authed)/secretaria/`
- `apps/lara/src/app/api/conversations/[id]/handoff-secretaria/`
- Mudanças em `route.ts` webhook + `LeadInfoPanel` + `useConversations` + `sections.ts`

## Files-chave

| Arquivo | Papel |
| --- | --- |
| `db/migrations/20260800000091_*.sql` | Schema + trigger + RPC |
| `apps/lara/src/app/api/webhook/whatsapp/route.ts` | Bifurcação inbox · handoff RPC |
| `apps/lara/src/lib/webhook/ai-tags-parser.ts` | `parseHandoffTarget` |
| `apps/lara/src/lib/webhook/lead-conversation.ts` | `resolveConversation(waNumberId)` |
| `apps/lara/src/app/api/conversations/[id]/handoff-secretaria/route.ts` | Endpoint manual |
| `apps/lara/src/app/(authed)/conversas/components/HandoffSecretariaSection.tsx` | Botão UI |
| `apps/lara/src/app/(authed)/secretaria/page.tsx` | Dashboard secretaria |
| `apps/lara/src/components/nav/sections.ts` | Sidebar entry |
| `packages/repositories/src/conversation.repository.ts` | `handoffSecretaria` + `listByStatus(inboxRole)` |
