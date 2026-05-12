# CRM · Next Prompt After 2H entregue

> Use este doc como ponto de partida para a próxima rodada.

---

## Estado consolidado pós-2H

- HEAD esperado: commit local `feat(crm): add patient arrival clinic flow`
- Migs 156–163 aplicadas · trackers registrados
- **Zero mig nova em 2H** · reutilização total do contrato DB existente
- Crons 12, 72, 89, 90, 91, 92, 93, 94 ATIVOS
- Worker 71 OFF (gate inegociável)
- Ban gate 2L preservado
- UI Bell cobre 5 kinds de alertas internos
- Página `/crm/agenda/[id]` com 3 quick-actions canônicas: Marcar chegada · Iniciar atendimento · Finalizar consulta
- Hardcodes `em_consulta`/`em_atendimento`/`na_clinica` substituídos por `getAppointmentActionFlags()`

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar wa_outbox
- NÃO tentar reparear Mih Baileys
- NÃO migration sem prep + smoke
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2J · finalização enterprise (recomendada)

**Escopo:**
- Modal rico de finalização (já existe wizard básico em `_actions-bar.tsx:FinalizeWizard`)
- Promover para 3 telas: outcome → valores → confirmação
- Gates condicionais:
  - `consentimento_img != 'assinado'` → warning amarelo (não bloqueia)
  - Anamnese não preenchida → warning amarelo (não bloqueia · só se mig de anamnese existir)
- RPC `appointment_soft_delete` para substituir UPDATE raw em `_actions-bar.tsx:245` (atualmente usa `softDeleteAppointmentAction` que chama `repos.appointments.softDelete` · validar se ainda precisa de RPC dedicada)
- Audit trail explícito no `phase_history`

**Verdict alvo:** `PASS_CRM_PHASE_2J_FINALIZATION_READY`

### Opção B · CRM_PHASE_2I · anamnese + consentimento

**Escopo:**
- Levantamento de schemas atuais (`anamnese_responses` se existir · `consent_documents` etc)
- Mig consolidando contratos faltantes
- Hooks de validação em `attend`/`finalize` (warnings não-bloqueantes)
- UI: card de "Documentos pendentes" no detail page

**Verdict alvo:** `PASS_CRM_PHASE_2I_ANAMNESE_CONSENT_READY`

### Opção C · CRM_PHASE_2L.1 · ban resolution audit

**Escopo:**
- READ-ONLY · zero alterações em schema
- Audit completo `wa_numbers` providers/templates/WABA
- Inventário Cloud Meta API templates aprovados
- Plano migração Mih (5544991622986) → Cloud Meta API
- Plano alternativo (novo número · bridge Lara)
- Checklist completo de readiness pra ligar worker 71

**Verdict alvo:** `PASS_CRM_PHASE_2L1_BAN_RESOLUTION_AUDIT_READY`

### Opção D · CRM_PHASE_2H.1 · cleanup zumbi `em_consulta`/`pre_consulta`

**Escopo:**
- READ-ONLY scan: `rg "em_consulta|pre_consulta"` em apps/ packages/ db/ supabase/
- Decisão: deletar das migs antigas (risco baixo · constraint atual já não aceita) OU manter (legacy migrations são histórico)
- Remover do TS state machine + enum + legacy JS UI
- Migration cosmética se aceitar (DDL change_status fn pra não listar zumbis)

**Verdict alvo:** `PASS_CRM_PHASE_2H1_STATUS_ZOMBIE_CLEANUP_READY`

### Opção E · CRM_PHASE_2K.1 · monitoramento dos crons d_after

**Escopo:**
- Cron 92 (d_after) está dry-mode · monitorar primeira execução de hoje 11:00 BRT
- Validar que appointments finalizados nos últimos 7 dias geraram logs
- Painel admin com estatística d_after rule × log × outbox queued
- Zero side-effect (worker 71 OFF)

**Verdict alvo:** `PASS_CRM_PHASE_2K1_MONITORING_READY`

---

## Recomendação ordenada

1. **2J** · Finalização enterprise · fecha jornada de saída do paciente
2. **2L.1** · audit cloud meta · prep migração futura (paralelizável)
3. **2I** · anamnese/consent · foundation para gates futuros
4. **2K.1** · monitorar d_after rolando · pode aguardar 7 dias de dados
5. **2H.1** · cleanup `em_consulta` · refactor cosmético · pode esperar

Em paralelo pode rodar 2L.1 com qualquer outra (não toca em código).

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar gate 2L
# Rodar docs/crm-refactor/sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql

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
- `appointment_internal_alerts` ganhando rows com `target_role` desconhecido
- Status fora do canon aparecendo em `appointments.status`
- Migration nova em `supabase_migrations.schema_migrations` sem prep prévio

---

## Sequência sugerida pra próxima rodada

1. `git push origin main` para subir commit local 2H (após autorização)
2. Decisão: 2J · 2L.1 · 2I · 2K.1 · ou 2H.1
3. Executar prompt da fase escolhida
