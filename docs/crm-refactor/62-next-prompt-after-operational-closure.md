# CRM · Next Prompt After Operational Closure (2R)

> Use este doc como ponto de partida para a próxima rodada vertical.
> Round CRM/Agenda/WhatsApp fechada em `25c9cab` (2026-05-12).

---

## Estado consolidado pós-2R

- HEAD/origin: `25c9cab` (com docs 2R por cima quando commitados)
- 5 migrations aplicadas (160, 161, 162, 163, 166) · tracker OK
- 17 RPCs SECURITY DEFINER · todas com GRANT auth+service_role
- 8 jobs cron ON · worker 71 OFF preservado
- UI completa do fluxo agenda → atendimento → finalização → clínico
- Ban gate 2L preservado · zero envio real em todo o ciclo
- Matriz dos 20 itens: 8 fechados · 9 parciais · 2 pendentes · 1 bloqueado

## Regras invioláveis (continuam valendo)

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar wa_outbox
- NÃO tentar reparear Mih Baileys
- NÃO migration sem prep + smoke
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2I.1 · Hard gate clinical finalization (RECOMENDADA)

**Por quê primeiro:** fecha o bloco clínico com proteção real · evita finalizar consulta sem anamnese/consent registrados. Risco LGPD/clínico mitigado.

**Escopo:**
- Mig 167 com alteração da RPC `appointment_finalize`:
  - Verifica `appointment_clinical_gate_status` antes de finalizar
  - Se `gate_status='warning'` E `p_force_override IS NULL`: retorna `clinical_gate_not_ready`
  - Aceita `p_force_override text` (motivo) que registra override em `phase_history.note`
- Action TS mostra erro amigável e oferece modal de override (só admin/owner)
- UI: desabilita botão "Finalizar consulta" se gate=warning (ou mostra "Finalizar com override")
- Smoke: gate ok finaliza · gate warning sem override falha · gate warning com override+motivo finaliza com note

**Verdict alvo:** `PASS_CRM_PHASE_2I1_HARD_GATE_READY`

---

### Opção B · CRM_PHASE_2L.1 · Ban resolution / Cloud Meta audit (PARALELIZÁVEL)

**Por quê paralelizar:** READ-ONLY · não toca código nem banco. Pode rodar junto com qualquer outra opção. Destrava roadmap de envio real (item 19/20 da matriz).

**Escopo:**
- Inventário `wa_numbers` providers/templates/WABA
- Cloud Meta API templates aprovados (catálogo)
- Plano migração Mih (5544991622986) → Cloud Meta API
- Plano alternativo: novo número Cloud Meta + bridge via Lara
- Checklist de readiness pra ligar worker 71 (env vars · webhook signature · rate limits · template approval timing)
- Doc operacional para próximo apply

**Verdict alvo:** `PASS_CRM_PHASE_2L1_BAN_RESOLUTION_AUDIT_READY`

---

### Opção C · CRM_PHASE_2J.1 · Lead lost dedicado

**Escopo:**
- UI: botão "Marcar como perdido" no card do lead em `/crm/leads/[id]`
- Schema TS `MarkLeadLostInput` (lead_id + reason)
- Action `markLeadLostAction` wrapper de `lead_lost` RPC
- Repository method `LeadRepository.markLost`
- Validation: lifecycle pós-lost consistente
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2J1_LEAD_LOST_DEDICATED_READY`

---

### Opção D · CRM_PHASE_2H.1 · Cleanup zumbis status

**Escopo:**
- READ-ONLY scan: `rg "em_consulta|pre_consulta|compareceu|reagendado"` em apps/ packages/ db/
- Remover do TS state machine + enum + APPOINTMENT_STATUS_LABELS + APPOINTMENT_STATUS_COLORS
- Atualizar `getAppointmentActionFlags` se necessário
- Mantém migs antigas (histórico) com comentário explicativo
- Atualiza `crm-refactor/CRM_CORE_FLOW.md` com state machine canônica
- Doc de mapping legacy → canônico

**Verdict alvo:** `PASS_CRM_PHASE_2H1_STATUS_ZOMBIE_CLEANUP_READY`

---

### Opção E · CRM_PHASE_2AUX · Modal agendamento completo

**Escopo:**
- Wizard rich em `/crm/agenda/novo` (3 telas: subject → tempo → procedimento)
- Search/select de lead OU patient (sem misturar · ADR-001)
- Validação de conflito client-side via `getAppointmentActionFlags` + `checkConflicts`
- Pré-preenchimento por procedimento default
- Submit usa `scheduleAppointmentAction` (atomic phase transition)

**Verdict alvo:** `PASS_CRM_PHASE_2AUX_SCHEDULE_WIZARD_READY`

---

### Opção F · CRM_PHASE_2M · Envio real (BLOQUEADO)

**Pré-requisitos:**
- 2L.1 concluído
- Cloud Meta API approval + número ativo
- Webhook signature configurado
- Templates aprovados

**Escopo:**
- Ativação worker 71
- Smoke real-send em 1 número whitelist
- Monitoramento (item 20 da matriz)
- Rollback procedure

**Status:** **BLOQUEADO** até 2L.1.

---

## Recomendação ordenada

1. **2I.1** · Hard gate · fecha bloco clínico (1 commit · risco baixo)
2. **2L.1** · audit ban / cloud meta · destrava envio futuro (paralelizável)
3. **2J.1** · lead_lost dedicado · fecha "perdido" fora do finalize
4. **2H.1** · cleanup zumbi · refactor cosmético cross-cutting
5. **2AUX** · wizard agendamento · enterprise UX
6. **2M** · envio real · BLOQUEADO até 2L.1

Em paralelo: 2L.1 pode rodar com qualquer outra (não toca código).

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar 2R closure
# Rodar docs/crm-refactor/sql/phase-2r-operational-closure-validation.sql

# Validar gate 2L
# Rodar docs/crm-refactor/sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql

# Validar 2I health
# Rodar docs/crm-refactor/sql/phase-2i-anamnesis-consent-validation.sql

# Validar 2J health (finalization)
# Rodar docs/crm-refactor/sql/phase-2j-finalization-enterprise-validation.sql

# Validar 2H health (arrival + start attendance)
# Rodar docs/crm-refactor/sql/phase-2h-arrival-clinic-flow-validation.sql
```

## Comandos PROIBIDOS

- `SELECT cron.alter_job(71, active := true)`
- `SELECT public._wa_outbox_tick()` manual
- Apply migration sem prep + smoke
- `git push --force`
- Chamada Meta/Evolution/WhatsApp Cloud API
- Reativar wa_outbox worker antes de 2L.1 resolver

---

## Sinais de risco (parar e reportar)

- `worker71_off` retornar false
- Cron novo com command `_wa_outbox_tick` aparecendo
- `wa_outbox.status='queued'` antiga > 1h crescendo descontroladamente (>1k rows)
- `appointment_internal_alerts` ganhando rows com `target_role` desconhecido
- `appointment_anamneses` ou `appointment_informed_consents` com `orphan` count > 0
- `consent_accepted_without_ts > 0` (CHECK violado)
- Status fora do canon aparecendo em `appointments.status`
- Migration nova em `supabase_migrations.schema_migrations` sem prep prévio
- Cron novo chamando Evolution/Meta/sendMessage

---

## Sequência sugerida pra próxima rodada

1. Decisão: 2I.1 · 2L.1 · 2J.1 · 2H.1 · 2AUX · 2M (BLOQUEADO)
2. Executar prompt da fase escolhida
3. Smoke + commit local
4. Push após autorização explícita
