# CRM · Next Prompt After 2I entregue

> Use este doc como ponto de partida para a próxima rodada.

---

## Estado consolidado pós-2I

- HEAD esperado: commit local `feat(crm): add appointment anamnesis and consent`
- Migs 156–163 + **166** aplicadas (mig 166 = anamnesis + consent intra-consulta)
- Crons 12, 72, 89, 90, 91, 92, 93, 94 ATIVOS · 71 OFF ✅
- Ban gate 2L preservado
- Fluxo completo da agenda fechado com camada clínica:
  - agendado → confirmado → na_clinica → em_atendimento → finalizado
  - Em qualquer momento: preencher anamnese + registrar consentimento informado
  - Warning visual no FinalizeWizard se gate=warning (não bloqueia)
- UI bell cobre 5 kinds de alertas internos
- Painel Clínico no detail page com 3 badges (Anamnese · Consent · Gate)

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar wa_outbox
- NÃO tentar reparear Mih Baileys
- NÃO migration sem prep + smoke
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2I.1 · Hard gate clinical finalization (recomendada)

**Escopo:**
- Bloquear `appointment_finalize` quando gate=warning (anamnese != complete OR consent != signed)
- Mig 167 com `chk_finalize_requires_clinical_gate` (CHECK constraint ou alteração da RPC)
- Action TS retorna erro amigável `clinical_gate_not_ready` se RPC bloquear
- UI: desabilitar botão "Finalizar consulta" se gate=warning + mostrar tooltip "Complete anamnese + consentimento"
- Override admin via `forceFinalize=true` (require role admin/owner)

**Verdict alvo:** `PASS_CRM_PHASE_2I1_HARD_GATE_READY`

### Opção B · CRM_PHASE_2J.1 · `lead_lost` dedicado

**Escopo:**
- UI: novo botão "Marcar como perdido" no card do lead em `/crm/leads/[id]`
- Schema TS para `MarkLeadLostInput` (lead_id + reason)
- Action `markLeadLostAction` wrapper de `lead_lost` RPC
- Repository method `LeadRepository.markLost`
- Validation SQL para garantir que lifecycle não fica em estado inconsistente
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2J1_LEAD_LOST_DEDICATED_READY`

### Opção C · CRM_PHASE_2L.1 · ban resolution audit

**Escopo:**
- READ-ONLY · zero alterações em schema
- Audit completo `wa_numbers` providers/templates/WABA
- Inventário Cloud Meta API templates aprovados
- Plano migração Mih (5544991622986) → Cloud Meta API
- Plano alternativo (novo número · bridge Lara)
- Checklist completo de readiness pra ligar worker 71

**Verdict alvo:** `PASS_CRM_PHASE_2L1_BAN_RESOLUTION_AUDIT_READY`

### Opção D · CRM_PHASE_2I.2 · Termos por procedimento

**Escopo:**
- Mapping de `appointment.procedure_name` → `term_key` esperado
- Tabela `consent_term_catalog` ou reusar `legal_doc_templates`
- UI: dropdown de termos disponíveis ao registrar consentimento
- Múltiplos consents por appointment (1 por term_key)
- Validation que finalize requer todos os termos aplicáveis

**Verdict alvo:** `PASS_CRM_PHASE_2I2_TERMS_CATALOG_READY`

### Opção E · CRM_PHASE_2H.1 · Cleanup zumbi `em_consulta`/`pre_consulta`

**Escopo:**
- READ-ONLY scan: `rg "em_consulta|pre_consulta"` em apps/ packages/ db/ supabase/
- Decisão: deletar do TS state machine + enum + legacy JS UI
- Mantém migs antigas (histórico) com comentário explicativo
- Doc dedicado de mapping para fluxo canônico

**Verdict alvo:** `PASS_CRM_PHASE_2H1_STATUS_ZOMBIE_CLEANUP_READY`

### Opção F · CRM_PHASE_2M · envio real (DEPENDE de 2L.1)

**Escopo:**
- Só após ban resolvido OU Cloud Meta operacional
- Checklist completo de readiness
- Ativação worker 71 (cron.alter_job)
- Smoke real-send pra 1 número whitelist
- Rollback procedure documentado

**Verdict alvo:** `PASS_CRM_PHASE_2M_REAL_SEND_READY` (BLOQUEADO até 2L.1)

---

## Recomendação ordenada

1. **2I.1** · Hard gate · fecha bloco clínico com proteção real
2. **2L.1** · audit cloud meta · prep migração (paralelizável)
3. **2J.1** · lead_lost dedicado · fecha "perdido" sem ligar ao finalize
4. **2I.2** · termos por procedimento · enterprise-grade
5. **2H.1** · cleanup zumbi · refactor cosmético
6. **2M** · envio real · BLOQUEADO até 2L.1 + decisão Mih

Em paralelo pode rodar 2L.1 com qualquer outra (não toca em código).

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar gate 2L
# Rodar docs/crm-refactor/sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql

# Validar 2I health (clinical anamnese + consent)
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

---

## Sinais de risco (parar e reportar)

- `worker71_off` retornar false
- Cron novo com command `_wa_outbox_tick` aparecendo
- `wa_outbox.status='queued'` antiga > 1h crescendo descontroladamente
- `appointment_anamneses` ou `appointment_informed_consents` com `orphan` count > 0
- `consent_accepted_without_ts > 0` (CHECK violado)
- Migration nova em `supabase_migrations.schema_migrations` sem prep prévio

---

## Sequência sugerida pra próxima rodada

1. `git push origin main` para subir commit local 2I (após autorização)
2. Decisão: 2I.1 · 2J.1 · 2L.1 · 2I.2 · 2H.1 · ou 2M (BLOQUEADO)
3. Executar prompt da fase escolhida
