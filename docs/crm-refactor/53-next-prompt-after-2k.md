# CRM · Next Prompt After 2K (Post-Consultation) entregue

> Use este doc como ponto de partida para a próxima rodada.

---

## Estado consolidado pós-2K

- HEAD esperado: commit local `feat(crm): add post-consultation d_after tick`
- Mig 162 aplicada · tracker registrado
- Cron 92 (`agenda-alert-d-after-tick`) ATIVO · primeira execução hoje/amanhã 11:00 BRT
- 4 rules d_after operacionais (D+1, D+2, D+3, NPS D+7)
- 5 ticks rodando dry-mode: 72 (min_before) · 89 (d_zero) · 90 (d_before) · 91 (not_confirmed) · 92 (d_after)
- Worker 71 segue OFF (gate inegociável)
- Ban gate 2L preservado

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar wa_outbox
- NÃO tentar reparear Mih Baileys
- NÃO migration sem prep + smoke
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2G.3 · alertas internos completion (recomendada)

**Escopo:**
- Tick fn `_appointment_next_patient_internal_alert_tick()` (10-15min antes da consulta · reusa min_before lógica mas grava em `appointment_internal_alerts`)
- Tick fn `_appointment_attention_required_alert_tick()` (scan diário de appts com dados faltando: sem phone, sem lead_id, sem prof)
- Crons 93 + 94
- Supabase Realtime channel pra bell (substituir polling 30s)
- Smoke + validation + doc

**Verdict alvo:** `PASS_CRM_PHASE_2G3_NEXT_PATIENT_AND_ATTENTION_ALERTS_READY`

### Opção B · CRM_PHASE_2H · frontend state alignment

**Escopo:**
- Remover hardcodes `canAttend`/`canFinalize` em `apps/lara/src/app/crm/agenda/[id]/page.tsx:90-101`
- Backend retorna `allowedActions` via RPC ou extensão
- Consumir `crm_operational_view` (mig 150)
- Decidir destino de `em_consulta` / `em_atendimento` stubs

**Verdict alvo:** `PASS_CRM_PHASE_2H_STATE_ALIGNMENT_LOCAL_COMMIT`

### Opção C · CRM_PHASE_2J · finalização enterprise

**Escopo:**
- Modal de finalização rica (outcome flow · gate consent/anamnese se já implementado)
- RPC `appointment_soft_delete` para substituir UPDATE raw em `_actions-bar.tsx:245`
- Gates condicionais quando anamnese/consent virarem

**Verdict alvo:** `PASS_CRM_PHASE_2J_FINALIZATION_READY`

### Opção D · CRM_PHASE_2L.1 · ban resolution audit

**Escopo:**
- READ-ONLY
- Audit completo `wa_numbers` providers/templates/WABA
- Plano migração Mih → Cloud Meta API
- Plano alternativo (novo número · bridge Lara)
- Checklist completo de readiness (item 7 do doc 45)

**Verdict alvo:** `PASS_CRM_PHASE_2L1_BAN_RESOLUTION_AUDIT_READY`

---

## Recomendação ordenada

1. **2G.3** · fecha bloco alertas internos · valor operacional alto · independente do ban
2. **2H** · UI cleanup · elimina anti-pattern arquitetural
3. **2J** · finalização rica · depende de 2I (anamnese/consent) idealmente
4. **2L.1** · audit cloud meta · prep migração futura

Em paralelo pode rodar 2L.1 com qualquer outra.

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar gate 2L
# Rodar docs/crm-refactor/sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql

# Validar 2K health
# Rodar docs/crm-refactor/sql/phase-2k-post-consultation-d-after-validation.sql

# Validar 2G health
# Rodar docs/crm-refactor/sql/phase-2g-internal-alerts-validation.sql
# + docs/crm-refactor/sql/phase-2g2-cron-and-ui-smoke.sql
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
- `agenda_alerts_log` ganhando rows sem cron conhecido
- Migration nova em `supabase_migrations.schema_migrations` sem prep prévio

---

## Sequência sugerida pra próxima rodada

1. `git push origin main` para subir commit local `feat(crm): add post-consultation d_after tick`
2. Decisão: 2G.3 · 2H · 2J · ou 2L.1
3. Executar prompt da fase escolhida
