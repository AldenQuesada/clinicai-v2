# CRM · Next Prompt After 2J entregue

> Use este doc como ponto de partida para a próxima rodada.

---

## Estado consolidado pós-2J

- HEAD esperado: commit local `feat(crm): add enterprise appointment finalization`
- Migs 156–163 aplicadas (zero mig nova em 2J)
- Crons 12, 72, 89, 90, 91, 92, 93, 94 ATIVOS · 71 OFF ✅
- Ban gate 2L preservado
- Fluxo completo da agenda fechado:
  - agendado → confirmado → aguardando → na_clinica → em_atendimento → finalizado (paciente | orcamento | paciente_orcamento)
- UI bell cobre 5 kinds de alertas internos
- `getAppointmentActionFlags()` canônico em `@clinicai/repositories`
- `appointment_finalize` aceita 4 outcomes no DB · UI expõe 3

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar wa_outbox
- NÃO tentar reparear Mih Baileys
- NÃO migration sem prep + smoke
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2I · anamnese + consentimento (recomendada)

**Escopo:**
- Levantamento de schemas atuais (`anamnese_responses` se existir · `consent_documents` etc · campo `consentimento_img` em appointments)
- Mig consolidando contratos faltantes
- Hooks de validação em `attend`/`finalize` (warnings não-bloqueantes para paciente_orcamento sem anamnese)
- UI: card "Documentos pendentes" no detail page
- Ação "Solicitar anamnese" (envio interno · sem WhatsApp)

**Verdict alvo:** `PASS_CRM_PHASE_2I_ANAMNESE_CONSENT_READY`

### Opção B · CRM_PHASE_2L.1 · ban resolution audit

**Escopo:**
- READ-ONLY · zero alterações em schema
- Audit completo `wa_numbers` providers/templates/WABA
- Inventário Cloud Meta API templates aprovados
- Plano migração Mih (5544991622986) → Cloud Meta API
- Plano alternativo (novo número · bridge Lara)
- Checklist completo de readiness pra ligar worker 71

**Verdict alvo:** `PASS_CRM_PHASE_2L1_BAN_RESOLUTION_AUDIT_READY`

### Opção C · CRM_PHASE_2J.1 · `lead_lost` dedicado (Marcar como perdido)

**Escopo:**
- UI: novo botão "Marcar como perdido" no card do lead em `/crm/leads/[id]`
- Schema TS para `MarkLeadLostInput` (lead_id + reason)
- Action `markLeadLostAction` wrapper de `lead_lost` RPC
- Repository method `LeadRepository.markLost`
- Validation SQL para garantir que lifecycle não fica em estado inconsistente
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2J1_LEAD_LOST_DEDICATED_READY`

### Opção D · CRM_PHASE_2K.1 · monitoramento dos crons d_after

**Escopo:**
- Cron 92 (d_after) está dry-mode · monitorar primeira execução natural
- Validar que appointments finalizados nos últimos 7 dias geraram logs
- Painel admin com estatística rule × log × outbox queued
- Zero side-effect (worker 71 OFF)

**Verdict alvo:** `PASS_CRM_PHASE_2K1_MONITORING_READY`

### Opção E · CRM_PHASE_2M · envio real (DEPENDE de 2L.1)

**Escopo:**
- Só após ban resolvido OU Cloud Meta operacional
- Checklist completo de readiness
- Ativação worker 71 (cron.alter_job)
- Smoke real-send pra 1 número whitelist
- Rollback procedure documentado

**Verdict alvo:** `PASS_CRM_PHASE_2M_REAL_SEND_READY` (BLOQUEADO até 2L.1)

---

## Recomendação ordenada

1. **2I** · anamnese + consentimento · foundation para gates futuros
2. **2L.1** · audit cloud meta · prep migração (paralelizável)
3. **2J.1** · lead_lost dedicado · fecha bloco "perdido" sem ligar ao finalize
4. **2K.1** · monitorar d_after · pode aguardar 7 dias de dados naturais
5. **2M** · envio real · BLOQUEADO até 2L.1 + decisão Mih

Em paralelo pode rodar 2L.1 com qualquer outra (não toca em código).

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar gate 2L
# Rodar docs/crm-refactor/sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql

# Validar 2J health (finalization)
# Rodar docs/crm-refactor/sql/phase-2j-finalization-enterprise-validation.sql

# Validar 2H health (arrival + start attendance)
# Rodar docs/crm-refactor/sql/phase-2h-arrival-clinic-flow-validation.sql

# Validar 2G.3 health (alertas internos completion)
# Rodar docs/crm-refactor/sql/phase-2g3-internal-alerts-completion-validation.sql

# Validar 2K health (post-consultation d_after)
# Rodar docs/crm-refactor/sql/phase-2k-post-consultation-d-after-validation.sql
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
- `appointments.status='finalizado'` voltando para outro estado
- `phase_history_suspect_dupes_24h > 0`
- Migration nova em `supabase_migrations.schema_migrations` sem prep prévio

---

## Sequência sugerida pra próxima rodada

1. `git push origin main` para subir commit local 2J (após autorização)
2. Decisão: 2I · 2L.1 · 2J.1 · 2K.1 · ou 2M (BLOQUEADO)
3. Executar prompt da fase escolhida
