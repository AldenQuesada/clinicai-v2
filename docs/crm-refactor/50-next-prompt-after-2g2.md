# CRM · Next Prompt After 2G.2 · UI + Cron entregues

> Use este doc como ponto de partida para a próxima rodada Claude Code.

---

## Estado consolidado pós-2G.2

- HEAD esperado: commit local `feat(crm): add internal alerts UI and cron`
- Mig 161 aplicada · 4 RPCs ativas · table `appointment_internal_alerts` (0 rows)
- Cron 91 (`agenda-alert-not-confirmed-tick`) ATIVO · primeira execução amanhã 08:00 BRT
- UI bell + dropdown + mark_read entregues em Lara (`AppHeaderThin`)
- TS hook `useAppointmentInternalAlerts` · polling 30s
- Worker 71 segue OFF · ban gate 2L preservado

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO `wa_outbox` processing
- NÃO tentar reparear Mih Baileys
- NÃO migration sem prep + smoke
- NÃO `db push`
- NÃO env/secrets

---

## Próximas opções (vertical · uma de cada vez)

### Opção A · CRM_PHASE_2G.3 · alertas adicionais + realtime (recomendada se quiser fechar 100% do bloco alertas)

**Escopo:**
- Tick fn `_appointment_next_patient_internal_alert_tick()` (~10-15 min antes da consulta · reaproveita lógica min_before mas grava em `appointment_internal_alerts` em vez de `wa_outbox`)
- Tick fn `_appointment_attention_required_alert_tick()` (scan diário de appts com dados faltantes: sem phone, sem lead_id, sem prof, etc)
- Crons 92 + 93 schedules apropriados
- (Opcional) Supabase Realtime channel pra bell substituir polling 30s
- Smoke transacional ROLLBACK
- Validation SQL
- Doc 51 · próxima 52

**Verdict alvo:** `PASS_CRM_PHASE_2G3_NEXT_PATIENT_AND_ATTENTION_ALERTS_READY`

### Opção B · CRM_PHASE_2K · pós-consulta `d_after` (P0 gap remanescente da audit 2E)

**Escopo:**
- Tick fn `_agenda_alert_d_after_tick()` processando rules `d_after` em `wa_agenda_automations`:
  - Apos Consulta D+1 (active)
  - Pos-procedimento D+2 (active)
  - Pos-procedimento D+3 (active)
  - NPS D+7 (active)
- Cron 94 ou similar · 11:00 BRT
- Geração de fila em `wa_outbox` (worker 71 OFF · nada sai)
- Smoke ROLLBACK · validation · doc

Mesma estrutura de mig 160 (d_before/d_zero) mas para `d_after`. Padrão conhecido.

**Verdict alvo:** `PASS_CRM_PHASE_2K_D_AFTER_TICK_READY`

### Opção C · CRM_PHASE_2H · frontend state alignment

**Escopo:**
- Remover hardcodes `canAttend`/`canFinalize` em `apps/lara/src/app/crm/agenda/[id]/page.tsx:90-101`
- Backend retorna `allowedActions` via RPC ou extensão de `appointment_change_status`
- Consumir `crm_operational_view` (criada em mig 150)
- Decidir destino de `em_consulta` / `em_atendimento` (ativar via RPC ou remover stubs)
- Zero migration mutativa de dados · só RPC

**Verdict alvo:** `PASS_CRM_PHASE_2H_STATE_ALIGNMENT_LOCAL_COMMIT`

### Opção D · CRM_PHASE_2L.1 · audit ban resolution + Cloud Meta API prep

**Escopo:**
- Read-only · audit completo `wa_numbers` providers/templates/WABA
- Doc de plano de migração Mih → Cloud Meta API
- Doc de plano alternativo (novo número · bridge Lara)
- Checklist completo de readiness (item 7 do doc 45)
- Zero call Meta · zero send

**Verdict alvo:** `PASS_CRM_PHASE_2L1_BAN_RESOLUTION_AUDIT_READY`

---

## Recomendação ordenada

1. **2G.3** · fecha 100% bloco alertas internos · valor operacional alto
2. **2K** · pós-consulta dry · independente do ban · gap P0 fechado
3. **2H** · UI cleanup · cosmético mas elimina anti-pattern
4. **2L.1** · audit cloud meta · prep migração futura quando ban resolver

Não recomendado: ativar worker 71 sem resolver migração Mih.

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar gate 2L
# Rodar docs/crm-refactor/sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql

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
- Aparecer cron novo com `_wa_outbox_tick` no command
- `wa_outbox.status='queued'` antiga > 1h crescendo
- `appointment_internal_alerts` ganhando rows sem cron conhecido
- Migration nova em `supabase_migrations.schema_migrations` sem prep prévio

---

## Sequência sugerida desta sessão pra próxima rodada

1. `git push origin main` para subir commit local `feat(crm): add internal alerts UI and cron`
2. Decisão: 2G.3 · 2K · 2H · ou 2L.1
3. Executar prompt da fase escolhida
