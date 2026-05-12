# CRM · Next Prompt After 2G.3 entregue

> Use este doc como ponto de partida para a próxima rodada.

---

## Estado consolidado pós-2G.3

- HEAD esperado: commit local `feat(crm): complete internal appointment alerts`
- Migs 156–163 aplicadas · trackers registrados
- Crons 12, 72, 89, 90, 91, 92, **93**, **94** ATIVOS
- Crons 93/94 são os últimos do bloco alertas internos · 100% do enum chk_app_alerts_kind tem tick fn dedicada
- 7 ticks rodando dry-mode: 72 (min_before) · 89 (d_zero) · 90 (d_before) · 91 (not_confirmed) · 92 (d_after) · **93 (next_patient_internal)** · **94 (attention_required)**
- Worker 71 segue OFF (gate inegociável)
- Ban gate 2L preservado
- UI Bell já cobre todos 5 kinds (sem mudança em TypeScript)

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar wa_outbox
- NÃO tentar reparear Mih Baileys
- NÃO migration sem prep + smoke
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2H · frontend state alignment (recomendada)

**Escopo:**
- Remover hardcodes `canAttend`/`canFinalize` em `apps/lara/src/app/crm/agenda/[id]/page.tsx:90-101`
- Backend retorna `allowedActions` via RPC ou extensão
- Consumir `crm_operational_view` (mig 150)
- Decidir destino de `em_consulta` / `em_atendimento` stubs
- UI cleanup elimina anti-pattern arquitetural

**Verdict alvo:** `PASS_CRM_PHASE_2H_STATE_ALIGNMENT_LOCAL_COMMIT`

### Opção B · CRM_PHASE_2J · finalização enterprise

**Escopo:**
- Modal de finalização rica (outcome flow · gate consent/anamnese se já implementado)
- RPC `appointment_soft_delete` para substituir UPDATE raw em `_actions-bar.tsx:245`
- Gates condicionais quando anamnese/consent virarem

**Verdict alvo:** `PASS_CRM_PHASE_2J_FINALIZATION_READY`

### Opção C · CRM_PHASE_2L.1 · ban resolution audit

**Escopo:**
- READ-ONLY
- Audit completo `wa_numbers` providers/templates/WABA
- Plano migração Mih → Cloud Meta API
- Plano alternativo (novo número · bridge Lara)
- Checklist completo de readiness (item 7 do doc 45)

**Verdict alvo:** `PASS_CRM_PHASE_2L1_BAN_RESOLUTION_AUDIT_READY`

### Opção D · CRM_PHASE_2I · anamnese/consentimento (dependência de 2J)

**Escopo:**
- Levantamento de gaps em anamnese/consent
- Mig consolidando schema atual
- Hooks para validação `consentimento_img=assinado` no fluxo de attend/finalize

**Verdict alvo:** `PASS_CRM_PHASE_2I_ANAMNESE_CONSENT_READY`

---

## Recomendação ordenada

1. **2H** · UI cleanup · alta visibilidade · independente do ban · arquitetural
2. **2L.1** · audit cloud meta · prep migração futura (pode paralelizar com 2H)
3. **2I** · anamnese/consent foundation
4. **2J** · finalização rica (depende de 2I)

Em paralelo pode rodar 2L.1 com qualquer outra.

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar gate 2L
# Rodar docs/crm-refactor/sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql

# Validar 2G.3 health (alertas internos completion)
# Rodar docs/crm-refactor/sql/phase-2g3-internal-alerts-completion-validation.sql

# Validar 2K health
# Rodar docs/crm-refactor/sql/phase-2k-post-consultation-d-after-validation.sql

# Validar 2G health (estado base)
# Rodar docs/crm-refactor/sql/phase-2g-internal-alerts-validation.sql
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
- `appointment_internal_alerts` ganhando rows com `target_role` desconhecido
- Migration nova em `supabase_migrations.schema_migrations` sem prep prévio

---

## Sequência sugerida pra próxima rodada

1. `git push origin main` para subir commit local `feat(crm): complete internal appointment alerts`
2. Decisão: 2H · 2L.1 · 2I · ou 2J
3. Executar prompt da fase escolhida
