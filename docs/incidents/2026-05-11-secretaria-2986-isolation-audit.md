# Auditoria de Isolamento · Secretaria/Mih (2986) · 2026-05-11

> **Tipo:** read-only audit · zero patch · zero alteração de dados
> **Escopo:** isolamento entre fluxo cotidiano de conversa e fluxo programado (agenda/CRM/outbox) no canal `5544991622986` (Mih/Secretaria)
> **Companheiro:** [flow-map.md](2026-05-11-secretaria-2986-flow-map.md) (diagramas Mermaid)

---

## 1 · Resumo executivo

Três falhas convergem para "dash da Secretaria parece vazia/stale" mesmo com `wa_messages` recebendo dados em tempo real:

1. **🔴 ESCOPO ERRADO NA QUERY DA LISTA** — `ConversationRepository.listByStatus` filtra apenas por `inbox_role='secretaria'` SEM `wa_number_id`. Como 4 dos 5 canais carregam esse role (`Mih`, `Mira`, `Mira Marci`, `Canal auxiliar`), a tela `/secretaria` mistura canais e dilui o Mih. **Mais grave dos três.**

2. **🟠 PREVIEW DRIFT RESIDUAL** — 10+ conversas Mih com `wa_conversations.last_message_at` atrasado em **até ~24h** (88 123 s) vs `MAX(wa_messages.sent_at)`. Janela do drift bate com o **incidente do trigger zumbi 2026-05-04** (memória `project_trigger_zumbi_2026_05_04`). O trigger foi restaurado mas o **backfill do drift residual nunca foi feito**.

3. **🟡 DOUBLE-WRITE DO PREVIEW NO CÓDIGO TS** — `apps/lara/src/app/api/webhook/whatsapp-evolution/route.ts:1561` chama `updateLastMessage(..., isInbound=false)` em outbound-from-device, e `MessageRepository.saveOutbound:327-345` também faz `update wa_conversations.last_message_text` na mão. O trigger SQL `_sync_wa_conversation_preview_v2` já cuida disso. **Redundância** → race conditions possíveis, e a versão TS tem semântica diferente da SQL (não preserva `last_lead_msg`/`last_inbound_time`).

**Boa notícia (lado SQL):**
- ✅ **Zero trigger** em `wa_outbox` que atualize `wa_conversations` ou `wa_messages`.
- ✅ **Zero trigger** em `agenda_alerts_log` com side-effect em conversa.
- ✅ `_enqueue_agenda_alert` (mig 156/158) insere SÓ em `wa_outbox` e `agenda_alerts_log` — não toca `wa_conversations`.
- ✅ Job 71 (`wa_outbox_worker_tick`) está **OFF** → fluxo programado não dispara WhatsApp nem fecha o loop voltando pra conversa real.

**Verdict:** o **fluxo programado NÃO está contaminando o fluxo cotidiano no banco**. O incidente é primariamente de **query/escopo no dash** (defeito 1) agravado por **resíduo de incidente passado** (defeito 2) e **redundância arquitetural** (defeito 3).

---

## 2 · Incidente observado

| Métrica | Valor |
|---|---|
| Janela | 2026-05-11 09:00 BRT → 13:06 BRT |
| Webhooks recebidos (Mih) | 129 |
| `wa_messages` persistidas (24h, todo o sistema) | 32 (todas Mih) |
| `wa_conversations` Mih total / ativas | 119 / **115** |
| Última `wa_messages.sent_at` Mih | 2026-05-11 13:06:14 BRT (real) |
| `_sync_wa_conversation_preview_v2` trigger | ✅ enabled |
| Dash `/secretaria` reportado | "vazio/stale" |

Verdict prévio do user: `DB_OK_MESSAGES_EXIST_AND_SHOULD_RENDER__IF_DASH_EMPTY_FRONTEND_QUERY_CACHE_OR_FILTER_BROKEN` — **confirmado por esta auditoria**.

---

## 3 · O que já foi provado (preparatório + esta audit)

- DB tem dados frescos do dia (32 msgs/24h no canal Mih).
- Trigger `_sync_wa_conversation_preview_v2` em `wa_messages` está habilitado e bem desenhado (`EXCEPTION WHEN OTHERS` para nunca quebrar INSERT — lição do trigger zumbi).
- Fluxo programado (job 72 `agenda_alert_min_before_tick`) acabou de ser **dry-activated** mas job 71 (worker) permanece OFF — zero envio real.
- 4 canais carregam `inbox_role='secretaria'`. **Apenas Mih tem volume operacional** (115 ativas + 32 msgs/24h); Mira tem 5 ativas, os outros 2 zerados.

---

## 4 · Hipótese principal

A **convergência indevida** acontece em UM ponto canônico: `wa_conversations.last_message_at + last_message_text` é a fonte de verdade do preview do dash, escrita por **três caminhos diferentes**:

1. **Caminho canônico (correto):** trigger `_sync_wa_conversation_preview_v2` em INSERT em `wa_messages`.
2. **Caminho redundante TS — webhook outbound-from-device:** `whatsapp-evolution/route.ts:1561` chama `repos.conversations.updateLastMessage(conv.id, content, false, sentAtStr)`.
3. **Caminho redundante TS — saveOutbound humano:** `message.repository.ts:321-345` faz `.from('wa_conversations').update({last_message_text, last_message_at})`.

E **uma fonte que NÃO escreve no preview**: `wa_outbox` (zero trigger, zero update por código). ✅

Logo: **o preview drift NÃO é causado pelo fluxo programado**. É causado por:
- (a) trigger zumbi 2026-05-04 que quebrou INSERTs em wa_messages por ~48h (já corrigido, drift residual não-limpado);
- (b) double-write TS que pode estar criando race conditions sutis (ainda não confirmadas, mas arquiteturalmente errado).

E o defeito que **torna o problema visível** é a **query do dash**: ela mistura 4 canais e ordena por preview drifted.

---

## 5 · Arquivos / objetos encontrados

### 5.1 · Tabelas envolvidas

| Tabela | Papel | Schema-chave |
|---|---|---|
| `wa_webhook_log` | Trace bruto de cada webhook (Cloud + Evolution) | sem `created_at`; tem outras colunas (não relevante p/ root cause) |
| `wa_messages` | Mensagens reais persistidas (inbound + outbound) | `id, conversation_id, direction, sender, content, sent_at, status, provider_msg_id, ...` |
| `wa_conversations` | Estado de conversa + preview (fonte do dash) | `id, clinic_id, wa_number_id, phone, status, inbox_role, last_message_at, last_message_text, last_lead_msg, last_inbound_time, last_ai_msg, unread_count, ...` |
| `wa_outbox` | Fila de envios programados | `id, clinic_id, lead_id (uuid NOT NULL), phone, content, status, rule_id, appt_ref, vars_snapshot, ...` (sem `conversation_id` link na maioria dos enqueuers) |
| `agenda_alerts_log` | Idempotência de alertas agendados | `id, appt_id (text), lead_id (text), alert_kind, rule_id, outbox_id, recipient, ...` · UNIQUE(`appt_id, alert_kind`) |
| `wa_numbers` | Map canal → telefone → instance | 5 rows; **4 com `inbox_role='secretaria'`** |
| `wa_pending_lid_events` | Fila de LIDs não resolvidos (Evolution Privacy Mode) | sem side-effect na conversa |
| `appointments` | Agenda real | FK `professional_id → professional_profiles(id)` (mig 157) |
| `wa_agenda_automations` | Regras de alertas | `is_active`, `trigger_type`, `trigger_config:{minutes}`, `alert_title`, `content_template` |

### 5.2 · Funções relevantes (mapeadas)

| Função | Tipo | Toca preview? | Notas |
|---|---|---|---|
| `_sync_wa_conversation_preview_v2()` | trigger fn em `wa_messages` AFTER INSERT | ✅ **SIM (canônico)** | guarda guard de status='note' e content vazio · `EXCEPTION WHEN OTHERS` p/ não quebrar INSERT |
| `_enqueue_agenda_alert(uuid, record, text, record, text)` | function chamada por `_agenda_alert_min_before_tick` | ❌ não toca preview | só insere em `wa_outbox` + `agenda_alerts_log` (mig 156 + mig 158 NULLIF fix) |
| `_agenda_alert_min_before_tick()` | function exec. por cron job 72 | ❌ | só lê appointments + chama `_enqueue_agenda_alert` |
| `wa_daily_summary()` | function exec. por cron job 12 | ❌ | só insere em `wa_outbox` (broadcast-like, sem conversation_id) |
| `_wa_outbox_tick()` | worker | ⚠️ (potencialmente) | **JOB 71 OFF** · não executa atualmente |
| `_appt_professional_phone(record)` | helper resolve phone do prof. | ❌ | só lê `professional_profiles` |
| `wa_emergency_alert()` | trigger em `wa_conversations` | indireto | side-effect: pode disparar alerta interno |
| `wa_auto_confirm_appointment()` | trigger em `wa_messages` | indireto | confirma appointment se inbound matcha |
| `wa_reset_reactivation()` | trigger em `wa_messages` | indireto | reativa convs arquivadas |
| `wa_birthday_detect_response()` | trigger em `wa_messages` | indireto | side-effect aniversário |
| `_vpi_detect_aceito`, `_vpi_ind_stage_on_inbound`, `_vpi_ind_stage_on_outbox` | triggers VPI | indireto | side-effect VPI · `_vpi_ind_stage_on_outbox` é **o único trigger em `wa_outbox`** (não atualiza preview, só `vpi_*`) |
| `trg_normalize_phone` (várias) | trigger normalização | ❌ | só ajusta phone |
| `fn_wa_conversations_inbox_role_sync()` | trigger em `wa_conversations` | ❌ | denormaliza `inbox_role` do canal para a conversa (mig 91) |
| `_audit_wa_conversations()` | trigger audit | ❌ | só audita |

### 5.3 · Triggers nas tabelas críticas

```
wa_messages:       trg_sync_wa_conversation_preview_v2  ← CANÔNICO PARA PREVIEW
                   trg_wa_auto_confirm
                   trg_reset_reactivation
                   trg_birthday_detect_response
                   trg_vpi_detect_aceito
                   trg_vpi_ind_stage_on_inbound
wa_conversations:  trg_wa_conversations_inbox_role_sync (mig 91)
                   trg_audit_wa_conversations
                   trg_emergency_alert
                   trg_wa_conv_normalize_phone
wa_outbox:         trg_wa_outbox_normalize_phone        ← NÃO toca conversa
                   trg_vpi_ind_stage_on_outbox          ← NÃO toca conversa
agenda_alerts_log: NENHUM
wa_webhook_log:    NENHUM
wa_numbers:        trg_wa_numbers_normalize_phone
appointments:      appointments_normalize_phone, appointments_updated_at
```

**Achado:** **zero trigger SQL** que cause vazamento programado → cotidiano. A separação no banco está limpa.

### 5.4 · Cron jobs relevantes

| jobid | jobname | schedule | active | Fluxo |
|---|---|---|---|---|
| 9 | `wa-outbox-cleanup` | `*/5 * * * *` | ✅ true | apenas limpa `wa_outbox` velho |
| 12 | `daily-agenda-summary` | `0 11 * * *` | ✅ true | enqueue diário em `wa_outbox` (broadcast) |
| 23 | `magazine_dispatch_runner` | `*/10 * * * *` | ✅ true | dispatch de magazine |
| 26-33 | `b2b_cron_*` | mensal | ✅ true | B2B dispatch (Mira→Mih) |
| **71** | `wa_outbox_worker_tick` | `*/1 * * * *` | **❌ false** | **WORKER REAL DE ENVIO** — gate global de envio |
| **72** | `agenda_alert_min_before_tick` | `*/1 * * * *` | ✅ true (recém dry-activated) | enqueue de alertas 10min · não dispara envio |

> Estado atual = **dry mode**: alertas geram outbox, mas worker (71) está OFF → zero WhatsApp/Evolution.

### 5.5 · Query/API do dash (TypeScript)

- `apps/lara/src/app/(authed)/secretaria/page.tsx:75` — entry; usa `useConversations({inbox:'secretaria'})` + `useSecretariaKpis()`.
- `apps/lara/src/app/api/conversations/route.ts` — `force-dynamic`; enriquece com `wa_conversations_operational_view`.
- `packages/repositories/src/conversation.repository.ts:113-161` — **`listByStatus`** filtra: `clinic_id`, `status IN ('active','paused')`, `inbox_role='secretaria'`. Ordem: `last_message_at DESC`. **SEM `wa_number_id`.**
- `conversation.repository.ts:272-285` — `updateLastMessage` (helper TS, usado pelo webhook).
- `apps/lara/src/app/api/secretaria/kpis/route.ts:30` — 6 counts paralelos via `wa_conversations_operational_view` · **também sem filtro de `wa_number_id`**.
- `apps/lara/src/hooks/useConversations.ts:378-430` — SSE com backoff 1-30s; refetch on connect.

---

## 6 · Pontos de convergência (tabelas/funções/jobs comuns)

| Ponto | Quem usa do lado cotidiano | Quem usa do lado programado | Risco |
|---|---|---|---|
| `wa_numbers.phone` (Mih = 5544991622986) | webhook Evolution + dash query | `_appt_professional_phone` resolve telefone do prof, mas envia via Lara (8773) **não** via Mih | ✅ baixo (canais separados) |
| `wa_outbox.phone` | — | TODOS os enqueuers programados | ✅ baixo (worker desligado) |
| `wa_conversations.last_message_at` | **trigger SQL canônico** (inbound/outbound real) | **NÃO** (programado não escreve) | ✅ **isolado no DB** |
| `wa_conversations.last_message_at` (TS) | `updateLastMessage` chamado por webhook E `saveOutbound` | NÃO (mas duplica o trigger SQL) | ⚠️ double-write redundante |
| `wa_messages` (INSERT) | webhook real | NÃO direto (só via worker quando enviado) | ✅ atualmente seguro |
| `wa_pending_lid_events` | webhook Evolution | NÃO | ✅ |
| `appointments` | nenhum acesso pelo fluxo cotidiano de chat | mig 157 (FK) + agenda CRM | ✅ |

---

## 7 · Pontos de acoplamento perigoso

| # | Onde | Severidade | Sintoma observado |
|---|---|---|---|
| 1 | `conversation.repository.ts:113` — `listByStatus` sem `wa_number_id` | 🔴 alta | dash mistura Mih + Mira + Marci + Auxiliar |
| 2 | `apps/lara/.../kpis/route.ts:30` → repo `getSecretariaKpiCounts` sem `wa_number_id` | 🔴 alta | KPI counts inflados |
| 3 | Preview drift residual em ~10 convs Mih | 🟠 média | conversas com inbound real recente flutuam fora de ordem |
| 4 | `webhook/whatsapp-evolution/route.ts:1561` — double-write de preview | 🟡 baixa-média | race condition latente, semântica TS ≠ SQL |
| 5 | `message.repository.ts:321-345` — `saveOutbound` faz update wa_conversations | 🟡 baixa-média | mesma redundância do ponto 4 |
| 6 | `wa_daily_summary` insere em `wa_outbox` sem `conversation_id` link | 🟢 baixa | OK enquanto worker OFF |
| 7 | Conversa reativa de `archived → active` em `saveOutbound:363-389` | 🟢 baixa | comportamento intencional (Alden ok) |

---

## 8 · Causa raiz provável (ranqueada)

### 🥇 ROOT CAUSE #1 — Query do dash sem escopo de `wa_number_id`

**Localização:** `packages/repositories/src/conversation.repository.ts:113-161`

**Evidência:**
- 4 canais carregam `inbox_role='secretaria'`: Mih (115 active), Mira (5), Marci (0), Auxiliar (0).
- `listByStatus` aplica `WHERE inbox_role='secretaria' AND status IN ('active','paused') ORDER BY last_message_at DESC`.
- Sem filtro `wa_number_id` → resultado é 120 convs misturadas.
- Quando user pensa "deveria ver só 115 Mih", está vendo 115 Mih + 5 Mira + ordem por preview drifted = sensação de "vazio/errado".

**Por que causa o sintoma:** dash misturando canais é o que torna o "preview drift" visível como cosmético quando na verdade tem dado real lá. A query NÃO está olhando o canal certo.

**Confiança:** alta.

### 🥈 ROOT CAUSE #2 — Preview drift residual do trigger zumbi (2026-05-04)

**Localização:** estado de dados em `wa_conversations` (10+ rows com drift até 24h).

**Evidência:**
- Memória `project_trigger_zumbi_2026_05_04`: DDL ad-hoc via Studio criou trigger usando colunas inexistentes em `wa_conversations` → quebrou todo INSERT em `wa_messages` por horas.
- O drift residual cai nos dias **2026-05-04 a 2026-05-06** (janela exata do incidente + reprocessamento parcial).
- Backfill de `last_message_at` nunca foi feito após a correção.

**Por que causa o sintoma:** algumas conversas Mih com inbound real recente continuam com `last_message_at` antigo → ordenam para baixo no dash mesmo tendo mensagem nova.

**Confiança:** média-alta (correlação temporal forte; precisa confirmar com `MAX(sent_at) - last_message_at` em todas as convs Mih, não só 10).

### 🥉 ROOT CAUSE #3 — Double-write TS de preview (latente)

**Localização:**
- `apps/lara/src/app/api/webhook/whatsapp-evolution/route.ts:1561`
- `packages/repositories/src/message.repository.ts:321-345`

**Evidência:**
- Trigger SQL `_sync_wa_conversation_preview_v2` JÁ atualiza `last_message_at/text/lead_msg/inbound_time/unread_count` no INSERT de `wa_messages`.
- Mas o código TS faz `update wa_conversations` adicional, com semântica simplificada (sem `last_lead_msg`, sem `last_inbound_time`, sem `unread_count++` para inbound).
- A versão TS pode SOBRESCREVER campos que só o trigger SQL preenche.

**Por que causa sintoma:** se TS roda APÓS o INSERT do trigger SQL, pode pisar em `last_message_at` mais novo, ou simplesmente confundir o estado quando há retry/race entre webhook handlers.

**Confiança:** média (arquiteturalmente errado; impacto operacional precisa de verificação em logs).

---

## 9 · Validação das regras arquiteturais

| Regra | Status | Notas |
|---|---|---|
| A — Mensagem cotidiana real entra em `wa_messages` via webhook | ✅ | confirmado |
| A — Conversa operacional atualiza | ⚠️ | via trigger SQL OK; mas double-write TS pode mascarar |
| B — Mensagem programada nasce em `wa_outbox` | ✅ | `_enqueue_agenda_alert` + `wa_daily_summary` |
| B — Programada não vira mensagem operacional antes do envio | ✅ | worker OFF; nenhum INSERT cedo em `wa_messages` |
| B — Programada não "parece conversa real" antes do envio | ✅ no SQL · ⚠️ no TS quando worker for ligado | quando job 71 ligar, é o worker que precisa `saveOutbound` corretamente |
| C — `last_message_at/text` não contaminado por outbox pendente | ✅ | nenhum trigger; nenhum código TS reads from outbox to update preview |
| D — Query do dash não depende só de campos voláteis | ❌ | depende de `last_message_at` (drift), `inbox_role` (4 canais misturam), sem fallback a `wa_messages.sent_at` |
| E — Convergência explícita e segura | ⚠️ | convergência existe no preview, mas é informal: trigger SQL + 2 paths TS |

---

## 10 · Patch mínimo recomendado (não aplicado · só sugerido)

### Patch 1 (🔴 crítico) — Escopo por canal na query do dash

**Arquivo:** `packages/repositories/src/conversation.repository.ts`

**Mudança no `listByStatus`:**
```ts
listByStatus(opts: { clinic_id, inbox_role, wa_number_id?, ... }) {
  let q = this.supabase.from('wa_conversations')
    .select('...')
    .eq('clinic_id', opts.clinic_id)
    .eq('inbox_role', opts.inbox_role)
    .in('status', ['active', 'paused'])
    .order('last_message_at', { ascending: false })
  if (opts.wa_number_id) q = q.eq('wa_number_id', opts.wa_number_id)  // ← NOVO
  return q
}
```

E na chamada do `/secretaria`: passar `wa_number_id = id_da_Mih` (ou um helper `getSecretariaChannelId(clinicId)`). Mesmo fix em `getSecretariaKpiCounts`.

**Impacto:** dash mostra exatamente o que Alden espera (canal Mih), KPIs voltam ao número real.

### Patch 2 (🟠) — Backfill do preview drift residual

**SQL (a aplicar como mig 159 prep + apply controlado):**
```sql
UPDATE public.wa_conversations cv
   SET last_message_at = m.max_sent,
       last_message_text = COALESCE(
         (SELECT m2.content FROM public.wa_messages m2 WHERE m2.conversation_id = cv.id ORDER BY m2.sent_at DESC LIMIT 1),
         cv.last_message_text
       )
  FROM (
    SELECT m.conversation_id, max(m.sent_at) AS max_sent
    FROM public.wa_messages m
    WHERE m.status <> 'note'
    GROUP BY m.conversation_id
  ) m
 WHERE cv.id = m.conversation_id
   AND m.max_sent > cv.last_message_at + interval '60 seconds';
```

**Impacto:** zera o drift residual. Idempotente — pode rodar 2x sem efeito colateral.

### Patch 3 (🟡) — Remover double-write TS

**Arquivo 1:** `apps/lara/src/app/api/webhook/whatsapp-evolution/route.ts:1561`
- Remover o `await repos.conversations.updateLastMessage(...)` quando `isOutboundFromDevice`. O trigger SQL já cuida.

**Arquivo 2:** `packages/repositories/src/message.repository.ts:321-345`
- Remover o bloco `update wa_conversations` dentro de `saveOutbound`. Trigger SQL é canônico.

**Impacto:** elimina race, simplifica fluxo, garante que `last_lead_msg` e `last_inbound_time` voltam a ser preenchidos corretamente em outbound device echo.

---

## 11 · Blindagem estrutural recomendada (camadas)

### Camada 1 — Banco

- **Regra:** **TRIGGER SQL é a ÚNICA fonte de verdade do preview**. Código TS NÃO atualiza `wa_conversations.last_message_at/text` em path nenhum.
- **Adicionar coluna `last_real_message_at`** computada por sub-query / trigger separado, que sempre reflete `MAX(wa_messages.sent_at)` mesmo se outro código bagunçar `last_message_at`. Fallback de emergência.
- **CHECK constraint** em `wa_outbox` impedindo `appt_ref IS NOT NULL AND lead_id IS NULL` (já parcialmente garantido pelo mig 156, formalizar).
- **Não criar trigger** em `wa_outbox` que escreva em `wa_conversations`. Hoje não existe ✅. Manter assim.

### Camada 2 — Query/API

- **Canônica `getSecretariaInbox({clinicId, waNumberId})`** que SEMPRE recebe `waNumberId` explícito.
- Fallback de ordenação: `ORDER BY GREATEST(cv.last_message_at, (SELECT max(sent_at) FROM wa_messages WHERE conversation_id = cv.id)) DESC` — robusto a drift.
- Filtro defensivo: `cv.status IN ('active','paused')` + check de coerência por `inbox_role`.
- View materializada `wa_conversations_inbox_view(wa_number_id, ...)` com refresh leve via NOTIFY ou trigger; o dash lê dela.

### Camada 3 — Frontend

- `useConversations({inbox, waNumberId})` — sempre passa `waNumberId`. Se faltar, hook lança erro em dev.
- `useSWR`/Realtime: invalidação focada em rows do canal, não global.
- Stale guard visual: se `last_message_at` < `MAX(wa_messages.sent_at)` no card, mostrar badge "preview defasado, atualizando" — diagnóstico in-vivo.

### Camada 4 — Observabilidade

- Health check periódico: para cada `wa_number` ativo, `COUNT(wa_conversations WHERE last_message_at < MAX(wa_messages.sent_at) - 60s)`. Alertar se > 0.
- Mismatch alerta: `webhook_count_24h(channel) > 0 AND wa_messages_24h(channel) = 0` → trigger zumbi recidiva.
- Smoke read-only diário: pega 1 conversa Mih, valida que `last_message_at = MAX(sent_at)`.

---

## 12 · Veredito final

### O que provavelmente aconteceu

**Hipótese vencedora:** confluência de 2 falhas + 1 redundância:

1. **(causa imediata, defeito 1)** Dash `/secretaria` chama query sem `wa_number_id`. Mistura 4 canais com `inbox_role='secretaria'`. Usuário vê algo que parece "vazio/errado" porque KPIs e ordem não batem com expectativa do canal Mih.

2. **(causa raiz histórica, defeito 2)** Trigger zumbi 2026-05-04 quebrou INSERTs em wa_messages por horas → 10+ Mih conversations com `last_message_at` antigo. Trigger restaurado, mas drift residual nunca foi corrigido. Quando dash ordena por `last_message_at`, essas conversas afundam.

3. **(redundância latente, defeito 3)** Código TS duplica responsabilidade do trigger SQL. Não está causando o incidente atual, mas é território fértil para próximos bugs e mascarar incidentes futuros.

**O problema foi:**

- **Não contaminação de banco** pelo fluxo programado (confirmado: zero trigger, zero TS path do outbox → conversation preview).
- **Não outbox vazando** para conversa (worker OFF; nenhum INSERT em wa_messages cedo).
- **Sim:** query/API do dash mal-escopada + drift de dados residual + double-write TS arquiteturalmente confuso.

### Confiança

- Defeito 1 (escopo da query): **alta** (evidência direta do código + counts dos 4 canais).
- Defeito 2 (drift): **alta** (10 rows confirmadas, correlação temporal com trigger zumbi).
- Defeito 3 (double-write): **alta** (código direto + def do trigger SQL).

### Fase 2 (mudaria estes arquivos)

- `packages/repositories/src/conversation.repository.ts` (Patch 1, 3)
- `apps/lara/src/app/api/conversations/route.ts` (pass `waNumberId`)
- `apps/lara/src/app/api/secretaria/kpis/route.ts` (Patch 1 KPI)
- `apps/lara/src/app/(authed)/secretaria/page.tsx` + hooks (`useConversations`, `useSecretariaKpis`)
- `apps/lara/src/app/api/webhook/whatsapp-evolution/route.ts:1561` (Patch 3)
- `packages/repositories/src/message.repository.ts:321-345` (Patch 3)
- Nova migration: `db/migrations/2026XXXX_secretaria_preview_backfill.sql` (Patch 2)

---

## 13 · Confirmações negativas

- ❌ Zero patch aplicado nesta fase
- ❌ Zero apply de migration
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero mutativo no banco
- ❌ Zero cron change
- ❌ Zero job activation
- ❌ Zero WhatsApp/Evolution send
- ❌ Zero alteração TS/app code
- ❌ Zero mensagem fake / backfill / dado plantado
- ❌ Zero mudança em CRM phases / agenda operacional / Mira / vouchers
- ❌ Zero ação no monitoramento `2986→7773`
- ❌ Zero secret persistido (token `sbp_...` só inline em comando)

---

## 14 · Histórico

- 2026-05-11: auditoria executada · status `READ_ONLY_DIAGNOSTIC_COMPLETE`.
- Próximo: review humano → autorização de Patches 1, 2, 3 em ordem.
