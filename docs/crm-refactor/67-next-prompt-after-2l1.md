# CRM · Next Prompt After 2L.1 (ban audit)

> Round: 2L.1 entregou audit READ-ONLY. Lara Cloud Meta operacional · Mih banida · worker 71 OFF.

---

## Estado consolidado pós-2L.1

- HEAD esperado: commit local `docs(crm): audit whatsapp real send ban gate`
- Migs 156–166 + 167 aplicadas
- 9 jobs cron ativos · worker 71 OFF (gate inegociável)
- 5 wa_numbers: Lara cloud-ready (`...8773`) · Mih banida (`...2986`) · Mira (`...7673`) Evolution operacional · 2 outros parcialmente configurados
- 42 templates no catálogo (sem `meta_approval_status` mirror no DB)
- 1400 outbound msg/30d via pipelines paralelos (não via worker 71)
- `wa_outbox` last attempt 2026-04-24 · queued/pending=0

## Regras invioláveis

- NÃO ativar job 71 sem checklist seção 10 do doc 66 completo
- NÃO enviar WhatsApp real via Mih (`...2986`)
- NÃO processar `wa_outbox` manualmente
- NÃO mexer secrets/env
- NÃO migration sem prep + smoke

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2L.2 · Cloud Meta migration plan (canary preflight) — RECOMENDADA

**Por quê primeiro:** com Lara cloud-ready confirmada, próximo passo lógico é executar a Rota B (bridge via Lara) **sem ainda ligar worker 71**. Smoke canary controlado em ambiente real, 1 destinatário interno (Alden/dev). Destrava roadmap final.

**Escopo:**
- Audit templates Meta-aprovados via DB ou Meta Business Manager export
- Mig nova: adicionar `meta_approval_status` em `wa_message_templates` (text · valores: APPROVED, REJECTED, PENDING, PAUSED) + index parcial
- Edge function `wa-canary-send` (1 destinatário · 1 template · 1 mensagem · valida `delivered_at` em 30s)
- Doc operacional + SQL validation read-only
- Worker 71 permanece OFF

**Verdict alvo:** `PASS_CRM_PHASE_2L2_CLOUD_META_CANARY_READY`

### Opção B · CRM_PHASE_2L.3 · Bridge automações da Secretaria via Lara

**Por quê:** depois de canary OK, re-routear automações operacionais (d_before/d_zero/d_after/min_before/not_confirmed) para usar `wa_number_id = Lara` em vez de Mih.

**Escopo:**
- Mig nova ajustando `wa_agenda_automations.wa_number_id` ou contrato de roteamento das tick fns
- Validação que automações apontam para Lara
- Smoke ROLLBACK
- Worker 71 permanece OFF (envio real ainda manual ou via pipelines existentes)

**Verdict alvo:** `PASS_CRM_PHASE_2L3_BRIDGE_LARA_READY`

### Opção C · CRM_PHASE_2J.1 · Lead lost dedicado (paralelizável · zero WhatsApp)

**Escopo:**
- UI: botão "Marcar como perdido" no card do lead em `/crm/leads/[id]`
- Schema TS `MarkLeadLostInput` (lead_id + reason min 5 chars)
- Action `markLeadLostAction` wrapper de `lead_lost` RPC
- Repository method `LeadRepository.markLost`
- Smoke ROLLBACK + doc

**Verdict alvo:** `PASS_CRM_PHASE_2J1_LEAD_LOST_DEDICATED_READY`

### Opção D · CRM_PHASE_2H.1 · Status zombie cleanup (paralelizável · zero WhatsApp)

**Escopo:**
- READ-ONLY scan: `rg "em_consulta|pre_consulta|compareceu|reagendado"` em apps/ packages/
- Remover do TS state machine + enum + APPOINTMENT_STATUS_LABELS + APPOINTMENT_STATUS_COLORS
- Manter migs antigas (histórico) com comentário
- Doc mapping legacy → canônico

**Verdict alvo:** `PASS_CRM_PHASE_2H1_STATUS_ZOMBIE_CLEANUP_READY`

### Opção E · CRM_PHASE_2AUX · Modal agendamento completo (paralelizável · zero WhatsApp)

**Escopo:**
- Wizard rich em `/crm/agenda/novo` (3 telas: subject → tempo → procedimento)
- Search/select de lead OU patient
- Validação de conflito client-side
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2AUX_SCHEDULE_WIZARD_READY`

### Opção F · CRM_PHASE_2M · Real send ON (BLOQUEADA · checklist seção 10)

**Pré-requisitos:**
- 2L.2 (canary) e 2L.3 (bridge) concluídos
- Edge function ou worker target verificado
- `meta_approval_status` populado e validado
- Dashboard de monitoramento online
- Kill switch documentado

**Status:** **BLOQUEADO até 2L.2 + 2L.3.**

---

## Recomendação ordenada

1. **2L.2** · cloud meta canary preflight (1 commit · zero envio real ainda)
2. **2L.3** · bridge automações via Lara (após canary OK)
3. **2J.1** · lead_lost dedicado (paralelizável)
4. **2H.1** · cleanup zumbi (paralelizável)
5. **2AUX** · wizard agendamento (paralelizável)
6. **2M** · real send ON (após 2L.2 + 2L.3 + checklist)

Paralelizáveis (C, D, E) podem rodar em paralelo com A/B porque não tocam pipeline WhatsApp.

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Re-validar audit 2L.1
# Rodar docs/crm-refactor/sql/phase-2l1-whatsapp-ban-resolution-cloud-meta-audit.sql

# Re-validar 2R closure
# Rodar docs/crm-refactor/sql/phase-2r-operational-closure-validation.sql

# Re-validar 2I.1 hard gate
# Rodar docs/crm-refactor/sql/phase-2i1-hard-gate-clinical-finalization-validation.sql
```

## Comandos PROIBIDOS

- `SELECT cron.alter_job(71, active := true)` (sem checklist seção 10 do doc 66)
- `SELECT public._wa_outbox_tick()` manual
- Mensagem real para paciente final fora de canary aprovado
- Bypass do hard gate via service_role em produção
- `git push --force`

---

## Sinais de risco (parar e reportar)

- Worker 71 ON sem checklist
- Edge function `wa-outbox-worker` aparecendo no repo sem audit
- `wa_outbox` queued > 100 (indica algo enfileirando sem worker drenar)
- Mih (`...2986`) ressurgindo em `wa_numbers.is_active=true` com api_key novo
- Template approval status mudando manualmente sem mig

---

## Sequência sugerida pra próxima rodada

1. Push docs 2L.1 (após autorização)
2. Decisão: 2L.2 · 2L.3 · 2J.1 · 2H.1 · 2AUX · ou 2M (BLOQUEADO)
3. Executar prompt da fase escolhida
