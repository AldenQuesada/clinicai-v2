# WhatsApp Secretaria · @lid Recovery & Hardening Canon

**Período:** 2026-05-08 → 2026-05-10
**Frente:** WhatsApp Secretaria / Evolution Baileys @lid
**Status:** todos os steps fechados em produção · pipeline @lid autônomo, observability end-to-end, fail-CLOSED.
**Audiência:** quem voltar a frente meses depois e precisa entender o porquê antes de mexer.

---

## 1. Resumo executivo

A inbox **`/secretaria`** (Lara · Next.js 16) deve espelhar **fielmente o WhatsApp real** — toda mensagem que chega ou sai no celular físico tem que aparecer na inbox, na ordem cronológica certa, com o conteúdo certo, no canal certo.

Três princípios inegociáveis que saíram dessa frente:

1. **Banco manda.** A UI lê de `wa_messages`/`wa_conversations` e nunca inventa nada. Se a UI mostra divergência, a fonte é o banco — patch sempre na ingestão (webhook + reprocessador), nunca em camada de exibição.
2. **Nenhum webhook pode sumir silenciosamente.** Todo evento Evolution `messages.upsert` tem que ter destino: ou virou `wa_messages` (caminho feliz), ou foi para `wa_pending_lid_events` (pendente identificável), ou foi rejeitado com `signature_reason` rastreável em `wa_webhook_log`. Não existe "perdido sem rastro".
3. **Idempotência por `provider_msg_id`.** Mensagens são deduplicadas pelo ID do provider. Reprocessar a mesma row N vezes nunca cria N mensagens · sempre retorna o mesmo registro.

Tudo neste documento decorre desses três princípios.

---

## 2. Problemas originais

A frente abriu porque a inbox `/secretaria` estava divergindo do celular real em casos não-óbvios:

### 2.1 `@lid` sem `senderPn`

WhatsApp Baileys ocasionalmente entrega eventos com `remoteJid` terminando em `@lid` (linked-id, identificador opaco anti-fingerprint) **sem o campo `senderPn`** (push number). Sem `senderPn`, o webhook não sabia o telefone E.164 real do remetente · descartava o evento silenciosamente · mensagem real do paciente sumia da inbox.

### 2.2 Falta de terminal traces

Quando o webhook bloqueava um evento (interno, identidade não resolvível, conversa duplicada), não havia trace estruturado. O `wa_webhook_log.signature_reason` ficava `null` ou genérico, então auditar "onde a mensagem X foi parar" exigia ler `raw_body` linha por linha.

### 2.3 `sent_at` incorreto antes do patch

Em algumas rotas o webhook usava `hit_at` (timestamp em que o servidor recebeu o webhook) como `sent_at` da mensagem. Isso degradava ordenação na UI quando o webhook chegava com atraso (ex: queue Evolution acumulou) · mensagens apareciam fora de ordem cronológica real.

### 2.4 Outbound externo @lid não persistia

Quando a Mirian respondia pelo celular físico (não pela inbox), o eco do Evolution chegava com `fromMe=true` + `remoteJid=@lid`. O webhook tratava como "echo bot-to-bot" e descartava. Resultado: respostas digitadas no celular não apareciam na inbox web.

### 2.5 Número interno bloqueado indevidamente

Heurística de "block internal numbers" estava bloqueando eventos vindos do **mesmo número da Secretaria** quando a Mirian falava direto com a secretaria pelo WhatsApp dela. Resultado: conversas internas (Mirian ↔ secretaria) sumiam da inbox.

### 2.6 Ausência de pending queue

Eventos não-roteáveis no momento (LID sem senderPn, identidade ambígua, conv inexistente) não tinham destino. Ou viravam erro silencioso, ou ficavam só em `wa_webhook_log` (que é log bruto, não fila reprocessável).

---

## 3. Recoveries históricos

### 3.1 PASS_NO_REMAINING_SAFE_CRITICAL_TEXT_LOSSES

Após fechar os patches da fase A (commits `8af901b` → `2d4816b`, datas 2026-05-09), uma **auditoria completa de perda silenciosa** percorreu `wa_webhook_log` filtrando todos os eventos `messages.upsert` em janela aberta, comparando contra `wa_messages` por `provider_msg_id`. Resultado: zero perdas de texto crítico não recuperadas.

Verdict cravado em memória: **`PASS_NO_REMAINING_SAFE_CRITICAL_TEXT_LOSSES`**.

### 3.2 22 mensagens recuperadas

Backfill manual (script ad-hoc, não cron) inseriu **22 mensagens** que tinham ficado em `wa_webhook_log` mas nunca chegaram em `wa_messages`. Cada uma marcada com `payload.kind=recovery_backfill` para distinguir de ingestão normal.

Casos canônicos:

- **Arildo** · paciente · texto crítico de agendamento que não havia entrado.
- **Luciana "Blz"** · resposta curta `Blz` que foi re-roteada via @lid sem senderPn.
- **Lead Instagram** · primeira mensagem de prospect que ficou perdida na transição de canal.

### 3.3 `payload.kind=recovery_backfill`

Toda mensagem recuperada manualmente carrega `payload.kind=recovery_backfill` no JSON da própria `wa_messages.payload`. Isso permite:

- Auditoria futura distinguir entre "ingestão normal" e "recovery manual".
- Métricas de inbox excluírem (ou destacarem) backfills se necessário.
- Triage de "tem msg recuperada nessa conv?" via `WHERE payload->>'kind' = 'recovery_backfill'`.

### 3.4 `sent_at` por `messageTimestamp`, nunca `hit_at`

A regra cravada em `c5dfc7f` (2026-05-09):

- **`sent_at` canônico = `messageTimestamp` do payload Evolution** (epoch em segundos do momento real do envio no WhatsApp).
- **`hit_at` é só o instante em que o webhook bateu no servidor** · nunca confundir com `sent_at`.

Nenhum patch posterior pode regredir isso · está cravado em memória global como regra de auditoria.

---

## 4. Commits principais

Ordem cronológica · cada um abre/fecha um item específico do hardening:

| Hash | Data | Step | Função |
|---|---|---|---|
| `8af901b` | 2026-05-09 | Patch A | persiste outbound externo Evolution (Mirian no celular físico) |
| `c5dfc7f` | 2026-05-09 | Patch Timestamp A | `messageTimestamp` como `sent_at` canônico (NUNCA `hit_at`) |
| `6ab0184` | 2026-05-09 | Patch @lid | persiste inbound `@lid` sem `senderPn` |
| `2d4816b` | 2026-05-09 | Step 11A | terminal traces no webhook (`signature_reason` estruturado) |
| `b47ef0f` | 2026-05-10 | Step 11C | escreve identidades `jid_lid` em `wa_contact_identities` |
| `bd7da6b` | 2026-05-10 | Step 11C.2 | unblock interno na Secretaria Evolution |
| `468f3cc` | 2026-05-10 | Step 11B.2 | writer da pending queue (`evo:pending_lid_event_*`) |
| `55e3b47` | 2026-05-10 | Step 11D.1 | reprocessador idempotente (POST `/lid-pending-reprocess`) |
| `36b7158` | 2026-05-10 | Step 11E | monitor read-only diário (GET `/lid-pending-monitor`) |
| `13752dc` | 2026-05-10 | Step 11E.1 | RPC silent-loss real + monitor populando número |
| `99b4e29` | 2026-05-10 | Step 11F | schedule do monitor 07:30 BRT (GitHub Actions) |
| `ce94406` | 2026-05-10 | Step 11G | schedule do reprocessador 08:00 BRT com gate read-only |
| `25d5911` | 2026-05-10 | Step 11H | fail semantics + artifacts + issue automática |

**Migration única dessa frente:** `20260700000871_p2_8a_wa_lid_silent_loss_count_rpc.sql` (clinic-dashboard repo, commit `99851ee`) — função `public.wa_lid_silent_loss_count(integer)`.

---

## 5. Pending queue · `public.wa_pending_lid_events`

### 5.1 Schema essencial

Tabela canônica para eventos `messages.upsert` que **não puderam ser roteados na ingestão**. Colunas-chave:

- `provider_msg_id` (FK natural) · `id`/`UUID` PK.
- `clinic_id`, `wa_number_id`, `remote_jid`, `from_me`, `sender_pn` (pode ser NULL — pending @lid sem PN).
- `message_type`, `content_preview`, `message_timestamp`, `message_timestamp_epoch`.
- `raw_body` (jsonb · payload Evolution completo).
- `reason` (motivo da entrada · ex: `lid_no_sender_pn`, `no_conversation_match_at_ingest`).
- `status` · enum textual: `pending` | `drained` | `duplicate` | `failed`.
- `attempts` · contador de tentativas do reprocessador.
- `created_at`, `resolved_at`, `resolved_classification`.

### 5.2 Status / reasons

| Status | Significado | Ação subsequente |
|---|---|---|
| `pending` | aguardando reprocesso | reprocessador tenta drenar |
| `drained` | salvo em `wa_messages` com sucesso | terminal · não tocar |
| `duplicate` | `provider_msg_id` já existia em `wa_messages` quando reprocessou | terminal · ingestão dupla |
| `failed` | reprocessador tentou e classificou erro definitivo (payload inválido) | requer investigação manual |

`reason` documenta **o porquê** entrou pending (genealogia), `status` é **o estado atual**. Eles são complementares, não redundantes.

### 5.3 Quando entra pending

Caminhos canônicos no webhook Evolution (ordem de avaliação):

1. **`@lid` sem `senderPn`** → `reason='lid_no_sender_pn'` · principal caminho desde 2026-05-10.
2. **Conversa não resolvível por (`clinic_id`, `wa_number_id`, `remote_jid`)** → `reason='no_conversation_match_at_ingest'` (raro · indica conv que não existe ainda).
3. **`provider_msg_id` colidindo com pending já existente** → idempotência via partial UNIQUE `uq_wa_pending_lid_active_provider`. Não duplica.

Eventos com `senderPn` resolvíveis pulam pending e vão direto para `wa_messages` (caminho feliz · maioria dos casos).

### 5.4 Por que não reaproveitar `wa_webhook_queue` / `webhook_processing_queue`

Decisão arquitetural cravada · três motivos:

1. **Schema diferente.** `wa_webhook_queue` é fila genérica de payloads para serem processados (multi-tenant, multi-tipo). `wa_pending_lid_events` carrega campos parseados (`remote_jid`, `provider_msg_id`, `message_timestamp`) que permitem reprocesso idempotente sem re-parsear o `raw_body`.
2. **Estado terminal explícito.** `webhook_processing_queue` não tem `drained`/`duplicate` separados · só success/error. Pending @lid precisa distinguir "drenado para wa_messages" vs "já existia, virou duplicate" para auditoria de idempotência.
3. **Ownership.** A queue genérica é compartilhada com Mira/B2B/Cloud · contaminar com lógica @lid-specific (LID → senderPn lookup, terminal_pending_identity, etc) cria acoplamento ruim. Pending @lid é frente isolada com ciclo de vida próprio.

**Não reaproveitar.** `wa_pending_lid_events` é canônica para esta frente.

---

## 6. Reprocessador · `POST /api/cron/lid-pending-reprocess`

**Arquivo:** `apps/lara/src/app/api/cron/lid-pending-reprocess/route.ts` (commit `55e3b47`).

### 6.1 Body

```json
{ "dry_run": true | false, "limit": 1..50 }
```

- `dry_run` default **`true`** (SEGURO · sempre dry-run a menos que explícito).
- `limit` clampado em [1, 50] · default 20 · 10 no schedule diário 11G.

### 6.2 Auth

`x-cron-secret` header timing-safe via `validateCronSecret` de `@clinicai/utils`. Aceita:

- **`WA_LID_REPROCESS_SECRET`** (preferido · dedicado ao reprocessador).
- **`CRON_SECRET`** (fallback · compartilhado com monitor read-only).

Endpoint **fail-CLOSED**: ausência ou divergência de header → 401.

### 6.3 Pipeline por linha

Para cada row `pending` selecionada (ordem `created_at ASC`):

1. **Idempotência por `provider_msg_id`:**
   - Match em `wa_messages` (por `provider_msg_id` ou `wa_message_id`) → marca pending `status='duplicate'` + `resolved_at` + `resolved_classification='duplicate'`.
   - Sem match → segue.
2. **Lookup conversa** (`clinic_id`, `wa_number_id`, `remote_jid`, `deleted_at IS NULL`) `LIMIT 2`:
   - **0 convs:** `classification='no_conversation_match'` · incrementa `attempts` · mantém pending (B1).
   - **≥2 convs:** `classification='ambiguous_conversation_match'` · incrementa `attempts` · mantém pending (raro).
   - **1 conv:** prossegue para drain (B2/B3).
3. **Drain:** `MessageRepository.saveInbound`/`saveOutbound`:
   - `sent_at` canônico = `pending.message_timestamp` (NUNCA `hit_at`).
   - Trata `23505` (UNIQUE violation) e retorna o ID existente · idempotente.
   - Sem `message_timestamp` → `classification='invalid_payload'` · mantém pending.
4. **Sucesso do drain:** UPDATE pending `status='drained'` + `resolved_at` + `resolved_classification='drained'`.

### 6.4 Validações B1/B2/B3 (smoke 11D.2)

- **B1 `no_conversation_match`:** linha sintética com `remote_jid` que não existe em `wa_conversations` · `classification='no_conversation_match'` · sem efeito em `wa_messages`. **PASS.**
- **B2 `would_drain` → `drained`:** linha sintética com 1 conv match · dry_run mostra `would_drain` · drain real cria `wa_messages` row e marca pending `drained`. **PASS.**
- **B3 idempotência `would_duplicate` → `duplicate`:** segunda passada na MESMA `provider_msg_id` (já em `wa_messages`) · classifica `would_duplicate`/`duplicate` sem criar nova row em `wa_messages`. **PASS.**

### 6.5 Não cria phone fake / lead fake

**Regra dura:**

- Reprocessador **não inventa `phone_e164`**. Se a row pending tem `sender_pn=NULL`, o drain só tenta se a conversa for resolvível por outras chaves (`clinic_id`, `wa_number_id`, `remote_jid`). Caso não resolva, mantém pending.
- Reprocessador **não cria `leads.*`**. Lead resolution acontece em camada upstream (`resolveLead`) · ele só persiste mensagem na conversa que já existe.

Drenar uma `pending` nunca gera dados sintéticos a jusante.

### 6.6 `sent_at` canônico

Repete a regra de [§3.4](#34-sent_at-por-messagetimestamp-nunca-hit_at): `sent_at = pending.message_timestamp`. Nunca `hit_at`.

---

## 7. Monitor & silent-loss · `GET /api/cron/lid-pending-monitor`

**Arquivo:** `apps/lara/src/app/api/cron/lid-pending-monitor/route.ts` (commits `36b7158` → `13752dc`).

### 7.1 Endpoint

GET com query opcional `?window_hours=N` (clamp [1, 168] · default 24). Read-only · zero side effect · auth `x-cron-secret`.

### 7.2 RPC `wa_lid_silent_loss_count(p_window_hours integer)`

Migration: `20260700000871_p2_8a_wa_lid_silent_loss_count_rpc.sql` (clinic-dashboard).

**Retorna:** integer · count de DISTINCT `provider_msg_id` de eventos `messages.upsert` com `remoteJid` `@lid` SEM `senderPn` que **NÃO** existem em `wa_messages` E **NÃO** existem em `wa_pending_lid_events`. Se > 0, há perda silenciosa real.

**SECURITY DEFINER · GRANT EXECUTE só para `service_role`** (lockdown · monitor usa server client).

### 7.3 Por que regex textual em vez de `raw_body::jsonb`

Tentativa anterior usava cast `raw_body::jsonb` na coluna `wa_webhook_log.raw_body`. Dava `ERROR 22P02 invalid input syntax for type json` em runtime quando o `raw_body` era texto base64 ou payload não-JSON ocasional. Patch: extração via `substring(raw_body FROM 'regex')` · três campos extraídos:

- `remote_jid` ← `'"remoteJid"\s*:\s*"([^"]+)"'`
- `provider_msg_id` ← `'"id"\s*:\s*"([^"]+)"'`
- `sender_pn` ← `'"senderPn"\s*:\s*"([^"]+)"'`

Robusto a payloads malformados · zero risco de erro de cast em produção.

### 7.4 Estado saudável validado

Smoke 11E.1 e dispatches 11F/11G/11H em 2026-05-10 confirmaram:

- `silent_loss_candidates_24h = 0`
- `silent_loss_rpc_available = true`
- `verdict = ok`
- `pending_total = 0`
- `failed_total = 0`
- `pending_insert_failed_24h = 0`

Pipeline @lid livre de perdas detectáveis em janela de 24h.

---

## 8. Schedules e fail semantics

**Workflow:** `.github/workflows/lara-crons.yml` (commits `99b4e29` → `ce94406` → `25d5911`).

### 8.1 Schedule diário

| Cron (UTC) | BRT (UTC-3) | Endpoint | Step | Side effect |
|---|---|---|---|---|
| `30 10 * * *` | 07:30 | `GET /lid-pending-monitor?window_hours=24` | 11F | zero |
| `0 11 * * *` | 08:00 | `POST /lid-pending-reprocess` (com gate) | 11G | só se health OK e `pending_total>0` |

Brasil sem DST · 07:30 BRT é fixo.

### 8.2 Gate do reprocessador

Antes de chamar drain, executa GET no monitor e avalia:

| Gate | Condição | Ação |
|---|---|---|
| **A** | `silent_loss_candidates_24h > 0` | ABORT · exit 1 (não drenar enquanto há perda real) |
| **B** | `verdict` começa com `fail_*` | ABORT · exit 1 (estado degradado · não amplificar) |
| **C** | `pending_total = 0` | SUCCESS · exit 0 sem chamar drain |
| **D** (caminho normal) | resto | POST drain `{dry_run:false, limit:10}` |

Pós-drain, valida `ok=true` e `failed=0` na resposta · qualquer divergência → exit 1.

### 8.3 Fail semantics no monitor (11H)

Workflow exit 1 quando:

- `ok != true`
- `verdict` começa com `fail_*`
- `silent_loss_candidates_24h > 0`
- `pending_insert_failed_24h > 0`
- `failed_total > 0`
- `pending_over_24h > 0` (warn promovido a fail)
- `silent_loss_rpc_available != true` (RPC 11E.1 deveria estar viva)

`warn_pending_growing` → exit 0 + `::warning::` log line.

### 8.4 Artifacts

`actions/upload-artifact@v4` com `if: always()` · 14 dias retention · `if-no-files-found: ignore`:

- `monitor-response-<run_id>-<attempt>` (kind=monitor ou reprocess)
- `reprocess-response-<run_id>-<attempt>` (kind=reprocess only)

Permite forensics post-mortem mesmo em runs failed.

### 8.5 Issue automática com dedup

`gh issue create` invocado em `if: failure()` · permissions `issues: write` job-scope · usa `GITHUB_TOKEN` default. Dedup por título: `"@lid monitor failure: <verdict>"` · se já há aberta com mesmo título, pula criação.

### 8.6 Issue #35 · falso positivo fechado

Em 2026-05-10 13:43 UTC, dispatch manual do monitor falhou com `status=000000` (curl timeout 60s · network blip transitório entre runner GitHub Actions e Easypanel). O 11H se comportou como projetado: detectou, exit 1, criou issue #35.

Os 2 runs subsequentes (8s e 30s depois) passaram com `verdict=ok pending_total=0`. Não foi degradação real de pipeline · foi rede instável momentânea entre runner e endpoint.

Issue #35 foi comentada com diagnóstico e fechada em 2026-05-10 13:51 UTC. Dedup liberado.

---

## 9. Como auditar no futuro

SQLs prontos para colar (substituir `<window_hours>` quando aplicável):

### 9.1 Pending queue por status

```sql
SELECT
  status,
  count(*) AS rows,
  count(DISTINCT clinic_id) AS clinics,
  min(created_at) AS oldest_at,
  max(created_at) AS newest_at
FROM public.wa_pending_lid_events
GROUP BY status
ORDER BY status;
```

### 9.2 Silent loss · janela arbitrária

```sql
SELECT public.wa_lid_silent_loss_count(24) AS silent_loss_24h,
       public.wa_lid_silent_loss_count(168) AS silent_loss_7d;
```

Esperado em sistema saudável: ambos `0`.

### 9.3 Traces `pending_lid_event_failed`

```sql
SELECT hit_at, signature_reason, substring(raw_body FROM 1 FOR 120) AS preview
FROM public.wa_webhook_log
WHERE endpoint = '/api/webhook/whatsapp-evolution'
  AND signature_reason = 'evo:pending_lid_event_failed'
  AND hit_at >= now() - interval '24 hours'
ORDER BY hit_at DESC
LIMIT 50;
```

Esperado: zero linhas em janela 24h saudável.

### 9.4 Terminal pending traces

```sql
SELECT signature_reason, count(*) AS hits
FROM public.wa_webhook_log
WHERE endpoint = '/api/webhook/whatsapp-evolution'
  AND signature_reason IN (
    'evo:terminal_pending_identity',
    'evo:terminal_pending_conversation'
  )
  AND hit_at >= now() - interval '24 hours'
GROUP BY signature_reason;
```

Pequenas contagens são esperadas (eventos de identidade não-resolvível são parte do fluxo); o que importa é não crescerem descontroladamente.

### 9.5 `wa_messages` por `provider_msg_id`

```sql
-- Forense: encontrar todas as variantes de uma mensagem específica
SELECT id, conversation_id, sender, content, sent_at, payload->>'kind' AS payload_kind
FROM public.wa_messages
WHERE provider_msg_id = '<PROVIDER_MSG_ID>'
   OR wa_message_id = '<PROVIDER_MSG_ID>'
ORDER BY sent_at;
```

### 9.6 Últimos runs GitHub Actions

```bash
# Listar runs recentes do workflow
gh run list -R AldenQuesada/clinicai-v2 -w lara-crons.yml -L 10

# Ver log de um run específico
gh run view <RUN_ID> -R AldenQuesada/clinicai-v2 --log

# Listar artifacts disponíveis
gh api repos/AldenQuesada/clinicai-v2/actions/runs/<RUN_ID>/artifacts \
  --jq '.artifacts[] | {name, size: .size_in_bytes, expires_at}'

# Listar issues abertas geradas pelo 11H
gh issue list -R AldenQuesada/clinicai-v2 --state open --search "monitor failure"
```

---

## 10. Regras permanentes

Cada regra abaixo é **inviolável** · violação = regressão. Se um patch futuro precisa quebrar uma delas, exige revisão explícita e atualização deste doc.

1. **Não usar `hit_at` como `sent_at`.** Use `messageTimestamp` do payload Evolution. `hit_at` é só "quando o webhook chegou" · não é canônico para ordenação cronológica.
2. **Não bloquear interno no Evolution Secretaria.** Heurística "block internal" causa perda de conversa Mirian↔secretaria. Comentado/removido em `bd7da6b`.
3. **Não criar `phone_e164` fake.** Se `senderPn` é NULL e não há resolução por outras chaves, mantém pending · não inventa.
4. **Não criar `leads.*` fake.** Lead resolution é responsabilidade upstream. Reprocessador apenas persiste mensagem em conv existente.
5. **Reprocessador só drena `wa_pending_lid_events` em `status='pending'`.** Não toca outras tabelas, não chama outros endpoints.
6. **Silent-loss FORA da queue é alerta/auditoria, NUNCA drain automático.** Se `wa_lid_silent_loss_count(24) > 0`, há evento que escapou de TODA ingestão (não está nem em `wa_messages` nem em `wa_pending_lid_events`). Tratar como incidente · investigar manualmente · não tentar reprocessar automaticamente (pode indicar bug de ingestão pior).
7. **Mídia / áudio / documento / sticker / reaction são frente separada.** Esta frente cobre mensagens de **texto** primariamente. Voice notes, imagens, documentos, stickers e reactions têm pipeline próprio (transcrição, mime, storage) que não é tocada aqui.
8. **`payload.kind=recovery_backfill` é reservado.** Só backfill manual com aprovação humana usa esse kind. Reprocessador automático NUNCA marca recovery_backfill.
9. **`@lid` em `remoteJid` não é descarte.** É um caminho de roteamento alternativo que precisa de pending queue + reprocesso. Qualquer patch que volte a descartar `@lid` silenciosamente é regressão.
10. **Idempotência por `provider_msg_id`.** Cross-channel dedup via 5s window é fallback · canonical é `provider_msg_id`. Mensagem nunca pode aparecer 2x na inbox para o mesmo provider_msg_id.

---

## 11. Pendências futuras

Lista do que ficou em aberto · NÃO implementar como parte desta frente.

### 11.1 Step 11C.1 em observação

Patch `b47ef0f` escreve `jid_lid` em `wa_contact_identities`. Foi colocado em produção e está sob observação · validar que cardinality não cresce descontroladamente em janela 30 dias antes de declarar GA.

### 11.2 Mídia / áudio / documentos / sticker / reaction

Frente separada · não tocar nesta. Linhas:

- Voice notes: pipeline `webm/opus → lamejs mp3 client-side` (ver memória `reference_voice_note_pipeline`).
- Imagens / documentos: storage `media/wa-uploads/{clinic_id}/{conv_id}/` (ver memória LGPD).
- Stickers / reactions: ingestão existe (commits `c5263d8`, `c2ceef0`) mas UI dedicada não.

### 11.3 Contatos internos com classificação

Hoje `unblock internal numbers` é binário (passa ou não passa). Próxima evolução: classificar internamente (`internal_secretaria`, `internal_doctor`, `external_patient`) e aplicar política diferente por classe.

### 11.4 Copilot Secretaria

Sugestões de resposta (Smart Replies) e Quick Actions contextuais. Usa cache de prompts/respostas. Frente totalmente separada.

### 11.5 Cards comerciais

UI de cards de procedimento com preço/mídia/CTA dentro da inbox · usa repositórios `procedimentos_comercial` (ver migrations recentes do clinic-dashboard).

### 11.6 Smart Replies / cache

LLM-backed reply suggestions · requer cache em camada (ver memória `project_b2b_state` para padrões de cache adjacentes).

### 11.7 Quick Actions fallback

Quando o Copilot não tem sugestão suficientemente confiante, oferecer Quick Actions (botões de ação fixos: "Marcar consulta", "Enviar voucher", "Pedir foto").

---

## Verdict desta frente

**`PASS_WHATSAPP_LID_HARDENING_DOCUMENTED`**

Pipeline @lid: monitor + reprocessador gated + auto-issue + artifacts + RPC silent-loss · estado saudável validado em 2026-05-10 · próximo run automático 2026-05-11 07:30 BRT.
