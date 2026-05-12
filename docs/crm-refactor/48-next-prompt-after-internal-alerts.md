# CRM · Next Prompt After Internal Alerts (2G concluída)

> **Use este doc como ponto de partida para a próxima rodada Claude Code.**

---

## Estado consolidado pós-2G

- HEAD esperado: commit local `feat(crm): add internal appointment alerts` (push pendente)
- Mig 161 aplicada · tracker registrado
- Tabela `appointment_internal_alerts` em prod com 0 rows
- RPCs disponíveis:
  - `appointment_internal_alert_create(uuid, text, text, uuid, jsonb) → uuid`
  - `appointment_internal_alert_mark_read(uuid) → jsonb`
  - `_appointment_not_confirmed_alert_tick() → int`
  - `appointment_arrival_internal_alert(uuid) → jsonb`
- TS server action `attendAppointmentAction` agora dispara `arrival` alert best-effort
- Smoke 2G PASS · idempotência confirmada
- Worker 71 segue OFF · ban gate 2L preservado

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp
- NÃO chamar Meta / Evolution / provider
- NÃO criar cron novo de envio
- NÃO processar `wa_outbox`
- NÃO tentar reparear Mih em Baileys
- NÃO commitar TS sem typecheck

---

## Próxima rodada · opção principal: CRM_PHASE_2G.2

### Escopo · UI bell + cron diário

**Backend (DB):**
- Criar cron job 91 (jobid livre · 89/90 ocupados): `agenda-alert-not-confirmed-tick` schedule `0 11 * * *` UTC (08:00 BRT, junto com d_zero) chamando `_appointment_not_confirmed_alert_tick()`
- Idempotência já garantida pela UNIQUE da tabela
- Worker 71 segue OFF · zero envio

**Frontend (Lara · `apps/lara/src/`):**
- Hook `useAppointmentInternalAlerts({ unread?, target?, limit? })`
- Componente `<AlertBell />` na topbar (badge unread count)
- Drawer/modal `<AlertList />` listando alertas pendentes
- Ação "marcar como lido" via RPC `appointment_internal_alert_mark_read`
- Realtime opcional · Supabase channel em `appointment_internal_alerts` filtrando `clinic_id`

**Smoke + valid:**
- Smoke transacional UI (Playwright/manual)
- Validation SQL re-roda com counts > 0

**Verdict alvo:** `PASS_CRM_PHASE_2G2_INTERNAL_ALERTS_UI_AND_CRON_READY`

---

## Alternativas paralelas

### CRM_PHASE_2G.3 · Atender `next_patient` + `attention_required`
- 2 alert kinds adicionais já no CHECK enum
- `next_patient`: tick fn que reaproveita lógica `min_before` mas grava em tabela interna
- `attention_required`: scan de appointments com dados faltantes (sem phone/sem lead_id/sem prof)

### CRM_PHASE_2H · Frontend agenda/CRM state alignment
- Remover hardcodes `canAttend`/`canFinalize` em `apps/lara/src/app/crm/agenda/[id]/page.tsx:90-101`
- Consumir `crm_operational_view`
- Sem dependência do ban Mih

### CRM_PHASE_2K · Tick fn `d_after` pós-consulta
- Rules `Apos Consulta D+1`, `Pos-procedimento D+2/D+3`, `NPS D+7` estão ativas mas órfãs (sem tick)
- Mesma estratégia do d_before/d_zero (mig 160) · só que para após
- Continua dry-mode (worker 71 OFF)

### CRM_PHASE_2L.1 · WhatsApp Cloud Meta / Ban Resolution Audit
- Read-only · audit completo de providers/templates/WABA
- Preparar plano de migração Mih → Cloud Meta API
- Não chama Meta · não envia
- Bom para iniciar enquanto recurso ao WhatsApp roda em background

---

## Recomendação ordenada

1. **2G.2** · UI bell + cron · fecha o pacote vertical de alertas internos (recomendada)
2. **2K** · pós-consulta dry · independente do ban
3. **2L.1** · audit cloud meta · preparar migração futura
4. **2H** · frontend state alignment · cosmético, mas elimina anti-pattern

Após 2G.2, alertas internos estão 100% operacionais para a clínica.

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar gate 2L
# Cole conteúdo de docs/crm-refactor/sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql
# em modo read-only

# Validar 2G health
# Cole conteúdo de docs/crm-refactor/sql/phase-2g-internal-alerts-validation.sql
# em modo read-only
```

## Comandos PROIBIDOS

- `SELECT cron.alter_job(71, active := true)`
- Qualquer call para Meta / Evolution / WhatsApp Cloud API
- `SELECT public._wa_outbox_tick()`
- Apply migration sem prep + smoke
- `git push --force`

---

## Sinais de risco (parar e reportar)

- `worker71_off` = false em qualquer validation
- Cron novo com command `_wa_outbox_tick` aparecendo
- `wa_outbox.status='queued'` antiga > 1h crescendo
- `appointment_internal_alerts` ganhando rows sem trigger conhecido
- Migration nova em `supabase_migrations.schema_migrations` sem prep prévio

---

## Sequência sugerida desta sessão pra próxima rodada

1. `git push origin main` para subir commit local `feat(crm): add internal appointment alerts`
2. Decisão: 2G.2 (recomendado) ou alternativa paralela
3. Executar prompt da fase escolhida
