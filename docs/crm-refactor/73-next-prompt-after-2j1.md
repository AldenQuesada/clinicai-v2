# CRM · Next Prompt After 2J.1

> Round: 2J.1 entregou UI dedicada de "Marcar como perdido" no appointment detail. Backend (RPC `lead_lost` + repository `markLost` + action `markLeadLostAction`) já existia. Zero migration. Zero envio.

---

## Estado consolidado pós-2J.1

- HEAD esperado: commit local `feat(crm): add dedicated lead lost flow`
- Migs 156–166 + 167 + 168 aplicadas (sem mig 169 · não foi necessária)
- Worker 71 OFF preservado · ban gate 2L intacto · canary Cloud Meta preflight commitada
- `perdido` é lifecycle comercial dedicado · removido do FinalizeWizard (2J) · agora tem botão próprio (2J.1)
- `phase_perdido` regressão = 0 (CHECK + smoke confirma)

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar wa_outbox
- NÃO reintroduzir `perdido` no FinalizeWizard
- NÃO usar `phase='perdido'` (lifecycle é o canônico)
- NÃO migration sem prep + smoke

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2H.1 · Cleanup zumbis status (RECOMENDADA · paralelizável)

**Por quê:** debt técnico cross-cutting. `em_consulta`/`pre_consulta`/`compareceu`/`reagendado` aparecem em ~106 ocorrências em 25 arquivos TS + migs antigas, mas a CHECK constraint do banco já não aceita esses status. Confunde manutenção sem bloquear operação. Refactor cosmético seguro.

**Escopo:**
- READ-ONLY scan: `rg "em_consulta|pre_consulta|compareceu|reagendado"` em apps/ packages/
- Remover do TS state machine + enum + APPOINTMENT_STATUS_LABELS + APPOINTMENT_STATUS_COLORS
- Manter migs antigas (histórico) com comentário explicativo
- Atualiza `crm-refactor/CRM_CORE_FLOW.md` com state machine canônica
- Doc mapping legacy → canônico

**Verdict alvo:** `PASS_CRM_PHASE_2H1_STATUS_ZOMBIE_CLEANUP_READY`

---

### Opção B · CRM_PHASE_2AUX · Modal agendamento completo

**Por quê:** item #7 da matriz original. UI atual de agendar (`/crm/agenda/novo`) tem form simples · falta wizard rich para enterprise UX.

**Escopo:**
- Wizard 3 telas: subject (lead/patient search) → tempo (data/hora/conflitos) → procedimento (templates default)
- Search/select de lead OU patient (sem misturar · ADR-001)
- Validação de conflito client-side via `checkConflicts` + helper
- Pré-preenchimento por procedimento default
- Submit usa `scheduleAppointmentAction` (atomic phase transition)

**Verdict alvo:** `PASS_CRM_PHASE_2AUX_SCHEDULE_WIZARD_READY`

---

### Opção C · CRM_PHASE_2R.2 · No-show/cancelamento/remarcação refinement

**Por quê:** itens #15/16/17 da matriz original são PARCIAIS. RPCs existem (markNoShow, cancel, dragDrop) mas UX dedicada pode melhorar.

**Escopo:**
- Modal no-show com select de motivo predefinido (igual a 2J.1 lead_lost)
- Modal cancelamento com motivo categorizado + se for "cliente pediu" → opcional propor remarcação
- Remarcação via dragDrop documentada como path canônico (não modal · UX rica)
- Smoke ROLLBACK + doc

**Verdict alvo:** `PASS_CRM_PHASE_2R2_NO_SHOW_CANCEL_REMARK_READY`

---

### Opção D · CRM_PHASE_2RC · Recuperação comercial (consome `perdidos`)

**Por quê:** com 2J.1, `perdidos` table começa a popular. Falta UI/automação de "trazer de volta".

**Escopo:**
- Tabela `perdidos` já existe (`is_recoverable` boolean + denormalized snapshot)
- Página `/crm/recuperacao` listando perdidos recoveráveis ordenados por `lost_at desc`
- Botão "Reativar lead" → UPDATE leads.lifecycle_status='recuperacao' + audit
- Sem WhatsApp ainda (depende de 2L.3+)
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2RC_RECOVERY_READY`

---

### Opção E · CRM_PHASE_2L.2.1 · Template approval mirror

**Por quê:** sem nenhum template approved no DB, 2L.3 está bloqueada. Esta sub-fase é pequena (sem migration · só UPDATE manual + doc + script helper).

**Pré-requisito:** acesso manual ao Meta Business Manager para conferência.

**Escopo:**
- Doc com checklist para conferência Meta Business Manager
- SQL helper para preencher `meta_approval_status` + `meta_template_name` + `meta_language`
- Validation SQL para confirmar pelo menos 1 approved
- Sem código novo · sem mig

**Verdict alvo:** `PASS_CRM_PHASE_2L21_TEMPLATE_APPROVAL_POPULATED`

---

## Recomendação ordenada

1. **2H.1** · cleanup zumbis · debt técnico baixo risco (1 commit · refactor cosmético)
2. **2AUX** · wizard agendamento · UX enterprise · destrava item #7 matriz
3. **2RC** · recuperação comercial · destrava item #18 matriz · consome perdidos table
4. **2R.2** · no-show/cancel/remark refinement · UX polish
5. **2L.2.1** · template approval mirror · só com acesso Meta Business Manager

Paralelizáveis: A, B, D, E não tocam pipeline WhatsApp · podem rodar em sequência rápida ou em paralelo conforme prioridade.

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar 2J.1 lead lost
# Rodar docs/crm-refactor/sql/phase-2j1-lead-lost-dedicated-flow-validation.sql

# Validar 2I.1 hard gate
# Rodar docs/crm-refactor/sql/phase-2i1-hard-gate-clinical-finalization-validation.sql

# Validar 2L.2 canary preflight
# Rodar docs/crm-refactor/sql/phase-2l2-cloud-meta-canary-preflight-validation.sql
```

## Comandos PROIBIDOS

- `UPDATE leads SET phase = 'perdido'` (regressão · use lifecycle_status)
- Reintroduzir `perdido` no `FinalizeWizard`
- `cron.alter_job(71, active := true)`
- `git push --force`
- Apply migration sem prep + smoke

---

## Sinais de risco (parar e reportar)

- `leads.phase='perdido'` aparecendo (regressão · phase deveria ser preservada)
- `leads.lifecycle_status='perdido' AND lost_at IS NULL` (RPC bypassada)
- `lifecycle_perdido_without_reason > 0`
- FinalizeWizard exposing `perdido` outcome (regressão 2J)
- Worker 71 ON

---

## Sequência sugerida pra próxima rodada

1. Push commit local 2J.1 (após autorização)
2. Decisão: 2H.1 · 2AUX · 2RC · 2R.2 · 2L.2.1
3. Executar prompt da fase escolhida
