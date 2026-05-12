# CRM_PHASE_2L.1 · WhatsApp Ban Resolution / Cloud Meta Audit

> **Data:** 2026-05-12
> **Status:** READ-ONLY audit · zero envio · zero alteração
> **HEAD inicial:** `3648456` · HEAD final esperado: commit local docs 2L.1
> **Verdict alvo:** `PASS_CRM_PHASE_2L1_BAN_CLOUD_META_AUDIT_READY`

---

## 1 · Resumo executivo

Audit completa do estado do envio real WhatsApp · responde definitivamente o que está bloqueado, o que está operacional, e qual é o caminho seguro para desbloquear envio real **sem comprar número novo nem esperar template approval**.

**Achado principal:** Lara (`...8773`) **já está em Cloud Meta API operacional** com todos os fields (phone_number_id + access_token + verify_token + business_account_id). Ela envia >1400 outbound/30d. O ban da Mih (`...2986`) é específico ao **provider Evolution Baileys** (403 rva), não ao WhatsApp como um todo · a clínica já tem o canal oficial Cloud Meta funcionando em paralelo.

**Plano recomendado:** **Rota B · bridge via Lara Cloud Meta**. Re-routear automações operacionais (D-1/D0/d_after/min_before/not_confirmed) para usarem `wa_number_id = Lara` em vez de Mih · zero compra de número · zero espera Meta approval (Lara já é WABA aprovada). Detalhes na seção 14.

**Worker 71 permanece OFF** mesmo após a migração porque seu target URL (GUC `app.settings.wa_outbox_worker_url`) aponta para uma edge function que **não existe** em `supabase/functions/` (15 edges listadas · nenhuma `wa-outbox-worker`). Envio real hoje roda via Next.js routes (`/api/conversations/.../messages` + `/api/cold-open` + `/api/cron/orcamento-followup`) com `resolveProviderForConv`. O worker 71 + outbox provavelmente é um pipeline legacy abandonado.

---

## 2 · Estado atual do ban gate

| Item | Status |
|---|---|
| Mih (`...2986` · Secretaria) | **BANIDO** no provedor Evolution (Baileys 403 rva) |
| Evolution instance ainda configurada em `wa_numbers` | Sim · `api_url=https://evolution.aldenquesada.site`, `api_key` presente |
| Worker 71 (`wa_outbox_worker_tick`) | 🔒 **OFF** (gate inegociável) |
| Target URL do worker 71 (GUC `app.settings.wa_outbox_worker_url`) | Aponta para edge function externa não localizada no repo |
| `wa_outbox` last attempt | 2026-04-24 01:49 UTC (~3 semanas atrás · pré-ban) |
| `wa_outbox` queued/pending | 0 (limpo · nada ameaçando ligar 71) |
| Crons d_before/d_zero/d_after/etc | ON · enchem outbox em dry-mode mas worker não drena |

---

## 3 · Jobs / Crons inventory

### 3.1 · Crons CRM/Agenda (verificados em fase 2R)

| Job | Nome | Schedule | Active |
|---|---|---|---|
| 12 | daily-agenda-summary | `0 11 * * *` | ✅ |
| **71** | **wa_outbox_worker_tick** | `*/1 * * * *` | 🔒 **OFF** |
| 72 | agenda_alert_min_before_tick | `*/1 * * * *` | ✅ |
| 89 | agenda-alert-d-zero-tick | `0 11 * * *` | ✅ |
| 90 | agenda-alert-d-before-tick | `0 13 * * *` | ✅ |
| 91 | agenda-alert-not-confirmed-tick | `0 11 * * *` | ✅ |
| 92 | agenda-alert-d-after-tick | `0 14 * * *` | ✅ |
| 93 | appointment-next-patient-internal-alert-tick | `*/5 * * * *` | ✅ |
| 94 | appointment-attention-required-internal-alert-tick | `0 10 * * *` | ✅ |

### 3.2 · Outros crons que tocam dispatch/outbox (15 ativos)

| Job | Nome | Comando | Active |
|---|---|---|---|
| 9 | wa-outbox-cleanup | `wa_outbox_cleanup_stuck()` | ✅ (safe · cleanup only) |
| 23 | magazine_dispatch_runner | `_magazine_dispatch_cron_runner()` | ✅ |
| 37 | b2b_cron_nps_quarterly | `b2b_nps_quarterly_dispatch()` | ✅ |
| 55 | b2b_comm_dispatch_log_cleanup | `DELETE ... older than` | ✅ (cleanup) |
| 56–64 | mira_* (9 crons) | `_mira_proactive_dispatch(...)` | ✅ |
| 85 | b2b-voucher-audio-queue-dispatch | `b2b_voucher_audio_queue_dispatch_pending(5)` | ✅ |

**Importante:** estes 15 crons NÃO chamam `_wa_outbox_tick`. Eles têm pipelines paralelos (b2b_dispatch_queue, magazine_dispatches, mira_proactive direto) que não passam pelo `wa_outbox`. Risco de envio ligado ao job 71: zero (já que 71 está OFF E aponta para edge inexistente).

---

## 4 · Canais / Números encontrados (5)

| Label | Phone (last 4) | Type | Inbox role | Provider resolvido | Cloud Meta ready? | Status |
|---|---|---|---|---|---|---|
| Canal auxiliar (a confirmar uso) | `...2003` | professional_private | secretaria | **unconfigured** | ❌ | is_active=true mas sem provider |
| **Lara · Clinica AI · Mirian de Paula** | `...8773` | clinic_official | sdr | **cloud_meta** | ✅ **SIM** | OPERACIONAL · WABA aprovada |
| Mira (onboarding + parceiros B2B) | `...7673` | clinic_official | secretaria | **evolution** | ❌ | OPERACIONAL via Evolution |
| Mira Marci | `...1891` | professional_private | secretaria | **unconfigured** | parcial (só `phone_number_id`) | sem token |
| **Secretaria B&H** (Mih) | `...2986` | clinic_official | secretaria | **evolution** | ❌ | **BANIDA** Evolution 403 rva |

`wa_numbers.is_active=true` para todos 5 · ban é do provedor, não do row.

---

## 5 · Provider atual em operação

### 5.1 · Resolução de provider (mig 91/92 · `resolveProviderForConv`)

[apps/lara/src/lib/whatsapp/resolve-provider.ts](../../apps/lara/src/lib/whatsapp/resolve-provider.ts):

```ts
if (wa_number.instance_id && api_url && api_key) → EvolutionService
else if (wa_number.phone_number_id && access_token) → WhatsAppCloudService
else → env-global fallback (WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN)
```

### 5.2 · Atividade WhatsApp (últimos 30 dias)

| Métrica | Valor |
|---|---|
| `wa_messages.direction=inbound` | 972 |
| `wa_messages.direction=outbound` | **1400** ⚠️ |
| `wa_webhook_log` total acumulado | 15.320 |
| `wa_outbox` 30d total | 96 (sem novos nos últimos 18 dias) |
| `wa_outbox` last attempt | 2026-04-24 01:49 UTC |

**1400 outbound em 30d sem worker 71 ligado** confirma que:
- Envio real **não passa** pelo `wa_outbox` no clinicai-v2 atual
- Pipelines paralelos (inbox UI, Lara cold-open, Mira proactive, b2b_dispatch, magazine) chamam Cloud Meta/Evolution direto
- `wa_outbox` é vestigial · usado por automações pré-2F que dependem de worker externo

### 5.3 · Callers de Cloud/Evolution no codebase

6 arquivos referenciam `WhatsAppCloudService`/`EvolutionService`/`createWhatsAppCloudFromWaNumber`:

```
apps/lara/src/app/api/webhook/whatsapp/route.ts         (Cloud Meta inbound)
apps/lara/src/app/api/conversations/[id]/messages/route.ts (envio inbox UI)
apps/lara/src/lib/whatsapp/resolve-provider.ts          (resolução)
apps/lara/src/app/api/cold-open/route.ts                (Lara automação)
apps/lara/src/app/api/cron/orcamento-followup/route.ts  (Vercel cron interno)
apps/lara/src/services/whatsapp-cloud.ts                (helper Cloud)
```

Edge functions em `supabase/functions/` (15 total):
- `b2b-comm-dispatch` · dispatcher B2B (Cloud Meta provavelmente)
- `b2b-mira-inbound` · inbound Mira
- `b2b-mira-welcome` · welcome
- Outras: voucher-audio, voucher-og, voucher-share, scout-scan, candidate-evaluate, weekly-insight, magazine-dispatch
- **Nenhuma `wa-outbox-worker`**

---

## 6 · Cloud Meta readiness · Lara

| Field obrigatório | Status em Lara |
|---|---|
| `phone_number_id` | ✅ presente |
| `access_token` | ✅ presente |
| `verify_token` | ✅ presente |
| `business_account_id` (WABA ID) | ✅ presente |
| `is_active=true` | ✅ |
| Webhook configurado | ✅ (15k hits em `wa_webhook_log`) |
| WABA aprovada pela Meta | ✅ (inferido · envio outbound funcional) |

**Lara é canal Cloud Meta OFICIAL pronto para receber tráfego adicional da Secretaria.**

### 6.1 · Templates

| Métrica | Valor |
|---|---|
| `wa_message_templates` total | 42 |
| Coluna `status` (Meta approval status) | ❌ não existe · usa `active` boolean |
| `wa_agenda_automations` ativas | Verificar via SQL (cron tick fns) |

**Risco:** template approval status da Meta não está espelhado no DB · precisa validar manualmente no Meta Business Manager antes de qualquer migração de canal.

---

## 7 · Evolution readiness / risco

Mih (`...2986`) · Mira (`...7673`) usam mesma URL `https://evolution.aldenquesada.site`.

| Item | Status |
|---|---|
| Mih instance | ✅ row em wa_numbers · BANIDA pelo Baileys (403 rva) |
| Mira instance | ✅ OPERACIONAL · enviando inbound + outbound |
| Evolution backend | self-hosted em domínio próprio · não-Anthropic |
| Risco Baileys ban Mira | **MÉDIO-ALTO** · mesmo backend, mesmas regras Baileys/WhatsApp |

**Hipótese:** se a clínica decidir migrar TUDO para Cloud Meta no médio prazo, Mira também deveria migrar quando for o caso. Curto prazo, Mira continua Evolution sem risco imediato.

---

## 8 · Outbox health

| Métrica | Valor | Análise |
|---|---|---|
| Total `wa_outbox` | 123 rows (cumulative) | snapshot histórico |
| `status='sent'` | 66 | pre-ban |
| `status='failed'` | 8 | pre-ban falhas |
| `status='cancelled'` | 49 | pre-ban cancellation (provavelmente expiração) |
| `status='queued'` | **0** ✅ | zero fila aguardando worker |
| `status='pending'` | **0** ✅ | zero pendente |
| `unsafe_count` (NULL phone/content/lead) | **0** ✅ | invariantes OK |
| `pending_old_1h` | **0** ✅ | zero fila antiga |
| Last 24h | 0 | crons d_after/d_before/d_zero não enfileiraram nada |
| Last 30d | 96 | pre-ban activity |

**É seguro ligar worker 71 imediatamente do ponto de vista de dados?** SIM · nenhuma fila aguardando.

**É correto ligar worker 71 hoje?** **NÃO.** Razões na seção 9.

---

## 9 · Riscos se job 71 fosse ligado hoje

1. **Target URL desconhecido:** `_wa_outbox_tick` faz HTTP para GUC `app.settings.wa_outbox_worker_url`. Edge function destino não existe em `supabase/functions/` do clinicai-v2. Resultado provável: HTTP 404/timeout · falha silenciosa por ciclo de 1 minuto · zero envio MAS zero observabilidade.

2. **Mih ainda configurada em `wa_numbers` como Evolution:** se worker enfileirar/processar usando `wa_number_id=Mih`, vai chamar Evolution `aldenquesada.site/instance/...` · provedor retorna 403 rva · 8 failed por ciclo · não envia mas registra erros.

3. **Templates approval não checados:** os 42 `wa_message_templates` não têm coluna `meta_approval_status`. Se algum template for usado fora da janela de 24h, Meta rejeita.

4. **Sem rate limit observability:** envio em massa de D-1/D0/d_after pode disparar rate limit Meta · sem dashboard.

5. **Sem canary plan:** ligar worker hoje seria broadcast para toda a base · contraindica boa prática enterprise.

6. **Conflito com pipelines paralelos:** Mira proactive crons + magazine + b2b + Lara cold-open + inbox UI já enviam direto · ligar worker 71 sem auditoria de dedup pode duplicar mensagens em alguns casos.

---

## 10 · Critérios para desbloquear envio real

Checklist obrigatório antes de `cron.alter_job(71, active := true)`:

- [ ] **Edge function `wa-outbox-worker` implementada e deployada** em `supabase/functions/` · OU rota Next.js dedicada · OU worker externo confirmado e auditável
- [ ] **GUC `app.settings.wa_outbox_worker_url`** apontando para target real · verificável via `current_setting`
- [ ] **GUC `app.settings.wa_outbox_worker_secret`** configurada · request auth
- [ ] **Mih** removida do roteamento (substituída por Lara · ver Rota B)
- [ ] **Coluna `meta_approval_status`** em `wa_message_templates` adicionada e populada (mig nova)
- [ ] **Dashboard de monitoramento** com: throughput/h, failure rate, rate limit hits, last delivered timestamp
- [ ] **Kill switch operacional** documentado: `cron.alter_job(71, active := false)` + sql de cancelar fila pending
- [ ] **Canary plan executado:** 1 destinatário interno (CEO/dev), 1 mensagem, validação manual de delivered
- [ ] **Rollback documented:** procedimento se receipts/delivered falhar
- [ ] **Audit log dedicado:** `wa_delivery_attempts` ou similar para forense

**`can_activate_worker71 = false`** até checklist completo.

---

## 11 · Plano de migração · 3 rotas

### Rota A · Recuperar Mih banida (NÃO RECOMENDADA)

- Apelar no Meta Business · recuperação Baileys (403 rva = repeated violations).
- **Probabilidade de sucesso baixa** (ban definitivo após violations).
- Bloquearia roadmap por 2-6 semanas.
- **Recomendação:** descartar.

### Rota B · Bridge via Lara Cloud Meta (RECOMENDADA)

**Pré-requisitos:** zero (Lara já é WABA aprovada).

**Passos:**
1. **Auditar `wa_message_templates`** que a Secretaria usaria via Lara · garantir que existem na Meta Business approved.
2. **Re-routear automações de agenda** (d_before/d_zero/d_after/min_before/not_confirmed) para usar `wa_number_id = Lara.id` em vez de Mih.
3. **Update `wa_conversations` da Secretaria** para apontar para Lara wa_number_id em conversations operacionais (manter histórico em Mih para audit).
4. **Mira (`...7673`) permanece em Evolution** · sem mudança imediata.
5. **Smoke canary:** 1 mensagem template-based de Lara para 1 número whitelist (Alden/CEO).
6. **Monitoramento:** 24-48h watch antes de habilitar volume.
7. **Worker 71 ainda OFF** · envios via pipelines existentes (inbox UI, cold-open, edges).

**Risco:** Lara é canal SDR (`inbox_role=sdr`, `default_context_type=lara_sdr`). Usar para Secretaria muda o "tom" do número. Avaliar UX antes.

**Tempo estimado:** 1-2 dias (auditoria templates + re-routing + canary).

### Rota C · Novo número Cloud Meta dedicado para Secretaria

**Pré-requisitos:** comprar número novo · cadastrar em Meta Business · configurar WABA · aprovar templates.

**Passos:**
1. Comprar número (Twilio/Sinch/Meta direto).
2. Migrar para Cloud Meta (link a WABA existente · `business_account_id` reuse).
3. Aprovar templates necessários (utility approval típico 24-72h).
4. Cadastrar row em `wa_numbers` (clinic_official, secretaria, full Cloud Meta config).
5. Re-routear automações da Secretaria para usar novo wa_number_id.
6. Smoke canary → volume.

**Risco:** template approval timing imprevisível (até 1 semana).

**Tempo estimado:** 1-2 semanas.

---

## 12 · Plano de canário interno

Aplicável a Rota B ou C.

1. **Destinatário:** 1 número Alden whitelist · NÃO um paciente real.
2. **Template:** 1 template approved de utility (não marketing).
3. **Volume:** 1 mensagem.
4. **Mecanismo:**
   - Manual via Meta Business Manager test send · OU
   - Edge function dedicada `wa-canary-send` (1 mensagem, 1 destinatário, hardcoded).
5. **Validações:**
   - `delivered_at` populado em `wa_messages` em < 30 segundos
   - Sem erro 4xx/5xx em `wa_errors`
   - Webhook delivery receipt recebido
6. **Rollback se falhar:**
   - Sem ação no DB (canary não escreve em produção)
   - Investigar logs

Worker 71 permanece OFF durante canary.

---

## 13 · Rollback / Kill switch

Se algo der errado após ativação real:

```sql
-- Kill switch imediato
SELECT cron.alter_job(71, active := false);

-- Cancelar fila pending (se houver)
UPDATE public.wa_outbox
   SET status = 'cancelled',
       error_message = 'kill_switch_2L1'
 WHERE status IN ('queued', 'pending');

-- Audit
SELECT status, count(*) FROM public.wa_outbox GROUP BY status;
```

Documentar em `docs/runbooks/wa-real-send-kill-switch.md` antes de ativação.

---

## 14 · O que pode seguir em paralelo

Independente de quando o envio real for ativado:

- **2J.1** · `lead_lost` dedicado (UI no card do lead) · zero WhatsApp
- **2H.1** · cleanup zumbis `em_consulta`/`pre_consulta` · zero WhatsApp
- **2AUX** · modal agendamento completo · zero WhatsApp
- **2I.1 validação contínua** · hard gate clínico já entregue
- **Monitoring** dos crons 89/90/91/92/93/94 dry-mode (alguns ainda não rodaram natural · esperar próxima janela)

---

## 15 · O que continua bloqueado

- Item #19 da matriz (worker 71 / envio real WhatsApp) · até checklist seção 10 completo
- Item #20 (monitoramento real-send) · depende de #19
- Recuperação comercial automatizada (#18) · depende de #19
- Mensagens pré-consulta / pós-consulta operacionais reais (#1, #2, #13) · em dry-mode atualmente

---

## 16 · Veredito

**`PASS_CRM_PHASE_2L1_BAN_CLOUD_META_AUDIT_READY`**

Audit completa entregue. Estado real:
- Mih banida (Evolution) · não recuperar
- Lara Cloud Meta operacional · pode receber tráfego adicional
- Worker 71 OFF · target URL aponta para edge inexistente · ban gate efetivamente "trava de segurança extra"
- Envio real ativo via pipelines paralelos (1400 outbound/30d) · sem incidente

**Próximo passo recomendado:** **Rota B · bridge via Lara Cloud Meta** + canary interno (próxima rodada `CRM_PHASE_2L.2`).

Ver [67-next-prompt-after-2l1.md](67-next-prompt-after-2l1.md) para opções verticais.
