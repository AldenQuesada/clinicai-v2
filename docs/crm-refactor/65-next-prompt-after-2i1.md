# CRM · Next Prompt After 2I.1 entregue

> Use este doc como ponto de partida para a próxima rodada vertical.

---

## Estado consolidado pós-2I.1

- HEAD esperado: commit local `feat(crm): enforce clinical gate on finalization`
- Migs 156–166 + **167** aplicadas
- Hard gate clínico ativo: `appointment_finalize` bloqueia se `gate=warning` sem override admin
- Audit trail `appointment_clinical_gate_overrides` ativo
- UI FinalizeWizard: bloqueio visual + seção override admin (só owner/admin)
- Worker 71 OFF preservado · ban gate 2L intacto

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar wa_outbox
- NÃO migration sem prep + smoke
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2L.1 · Ban resolution / Cloud Meta audit (RECOMENDADA · paralelizável)

**Por quê primeiro:** ÚLTIMO bloqueio crítico do roadmap CRM. READ-ONLY · zero risco de quebrar nada. Destrava itens 1, 2, 13, 14, 18, 19, 20 da matriz original (envio real e recuperação comercial).

**Escopo:**
- Inventário `wa_numbers` providers/templates/WABA atualmente cadastrados
- Cloud Meta API: templates aprovados (lista do Meta Business Manager)
- Plano migração Mih (5544991622986) → Cloud Meta API:
  - Opções: ativar número novo na Cloud Meta · OU bridge via Lara (5544995887773)
  - Custos · timing · approval timing dos templates
- Checklist completo de readiness pra ligar worker 71:
  - env vars (CLOUD_META_*, EVOLUTION_*)
  - webhook signature configurado
  - rate limits documentados
  - rollback procedure
- Doc operacional + SQL read-only validation

**Verdict alvo:** `PASS_CRM_PHASE_2L1_BAN_RESOLUTION_AUDIT_READY`

---

### Opção B · CRM_PHASE_2J.1 · Lead lost dedicado

**Por quê:** fecha o bloco "perdido" sem ligar à finalização da consulta. UX direta no card do lead.

**Escopo:**
- UI: novo botão "Marcar como perdido" em `/crm/leads/[id]`
- Schema TS `MarkLeadLostInput` (lead_id + reason min 5 chars)
- Action `markLeadLostAction` wrapper de `lead_lost` RPC
- Repository method `LeadRepository.markLost`
- Validation: lifecycle pós-lost consistente
- Smoke ROLLBACK + doc

**Verdict alvo:** `PASS_CRM_PHASE_2J1_LEAD_LOST_DEDICATED_READY`

---

### Opção C · CRM_PHASE_2H.1 · Cleanup zumbis status

**Por quê:** debt técnico cross-cutting. Não bloqueia operação mas confunde manutenção.

**Escopo:**
- READ-ONLY scan: `rg "em_consulta|pre_consulta|compareceu|reagendado"` em apps/ packages/
- Remover do TS state machine + enum + APPOINTMENT_STATUS_LABELS + APPOINTMENT_STATUS_COLORS
- Atualizar `getAppointmentActionFlags` se necessário
- Manter migs antigas (histórico) com comentário explicativo
- Atualiza `crm-refactor/CRM_CORE_FLOW.md` com state machine canônica
- Doc de mapping legacy → canônico

**Verdict alvo:** `PASS_CRM_PHASE_2H1_STATUS_ZOMBIE_CLEANUP_READY`

---

### Opção D · CRM_PHASE_2AUX · Modal agendamento completo

**Escopo:**
- Wizard rich em `/crm/agenda/novo` (3 telas: subject → tempo → procedimento)
- Search/select de lead OU patient (sem misturar · ADR-001)
- Validação de conflito client-side via helper + `checkConflicts`
- Pré-preenchimento por procedimento default
- Submit usa `scheduleAppointmentAction` (atomic phase transition)

**Verdict alvo:** `PASS_CRM_PHASE_2AUX_SCHEDULE_WIZARD_READY`

---

### Opção E · CRM_PHASE_2M · Envio real (BLOQUEADO até 2L.1)

**Pré-requisitos:**
- 2L.1 concluído com plano operacional
- Cloud Meta API approval + número ativo
- Webhook signature configurado
- Templates aprovados

**Escopo:**
- Ativação worker 71 (`cron.alter_job(71, active := true)`)
- Smoke real-send em 1 número whitelist (CEO/dev pessoal)
- Monitoramento (item 20 da matriz)
- Rollback procedure documentado

**Status:** **BLOQUEADO** até 2L.1.

---

## Recomendação ordenada

1. **2L.1** · audit ban / cloud meta · DESTRAVA roadmap de envio (1 commit · sem risco)
2. **2J.1** · lead_lost dedicado · fecha bloco "perdido" sem ligar ao finalize
3. **2H.1** · cleanup zumbi · debt técnico cross-cutting
4. **2AUX** · wizard agendamento · enterprise UX
5. **2M** · envio real · só após 2L.1

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar 2I.1 hard gate
# Rodar docs/crm-refactor/sql/phase-2i1-hard-gate-clinical-finalization-validation.sql

# Validar 2I health (clinical anamnese + consent)
# Rodar docs/crm-refactor/sql/phase-2i-anamnesis-consent-validation.sql

# Validar 2R closure
# Rodar docs/crm-refactor/sql/phase-2r-operational-closure-validation.sql
```

## Comandos PROIBIDOS

- `SELECT cron.alter_job(71, active := true)`
- `SELECT public._wa_outbox_tick()` manual
- Apply migration sem prep + smoke
- `git push --force`
- Chamada Meta/Evolution/WhatsApp Cloud API
- Bypass do hard gate via service_role em produção

---

## Sinais de risco (parar e reportar)

- `worker71_off` retornar false
- `appointment_clinical_gate_overrides` ganhando rows sem reason ou com reason < 5 chars (CHECK violado)
- Override rows com `actor_id` NULL em ambiente de produção (deveria sempre ter `auth.uid()`)
- `appointment_finalize` perdendo args `p_clinical_override*` (mig 167 revertida sem aviso)
- Migration nova em `supabase_migrations.schema_migrations` sem prep prévio

---

## Sequência sugerida pra próxima rodada

1. `git push origin main` para subir commit local 2I.1 (após autorização)
2. Decisão: 2L.1 · 2J.1 · 2H.1 · 2AUX · 2M (BLOQUEADO)
3. Executar prompt da fase escolhida
