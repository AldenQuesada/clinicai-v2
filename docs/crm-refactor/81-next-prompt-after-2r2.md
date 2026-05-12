# CRM · Next Prompt After 2R.2

> Round: 2R.2 refinou UX de cancel/no-show com motivos predefinidos categorizados e adicionou botão "Remarcar" dedicado linkando para /editar. Backend já era canônico desde rounds anteriores. Zero migration. Zero envio.

---

## Estado consolidado pós-2R.2

- HEAD esperado: commit local `feat(crm): refine appointment outcome actions`
- CancelModal · 7 motivos predefinidos + observação condicional
- NoShowModal · 4 motivos predefinidos + observação condicional
- Botão "Remarcar" dedicado linkando para `/crm/agenda/[id]/editar`
- DB `appointment_change_status` RPC + colunas dedicadas (`motivo_*`, `*_em`) intactas
- Migs 156–168 aplicadas · worker 71 OFF · ban gate 2L intacto

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar wa_outbox
- NÃO usar status zumbi
- NÃO reintroduzir `phase='perdido'`
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2RC · Recuperação comercial (RECOMENDADA)

**Por quê:** item #18 da matriz · com 2J.1 ativa, `perdidos` table popula naturalmente. Falta UI de "trazer de volta". Zero WhatsApp · pode operar sem desbloqueio Meta.

**Escopo:**
- Página `/crm/recuperacao` listando perdidos recuperáveis (`is_recoverable=true`) ordenados por `lost_at desc`
- Filtros por `lost_reason` + `lost_from_phase`
- Botão "Reativar lead" → UPDATE leads.lifecycle_status='recuperacao' + audit em phase_history
- Counters dashboard (total perdidos / recuperáveis / reativados últimos 30d)
- Sem WhatsApp ainda (depende de 2L.3+)
- Smoke ROLLBACK + validation + doc

**Verdict alvo:** `PASS_CRM_PHASE_2RC_RECOVERY_READY`

---

### Opção B · CRM_PHASE_2AUX.2 · Professional FK + Lead support no wizard

**Por quê:** wizard 2AUX usa `professionalName` texto livre · conflict por profissional retorna null se UI não passar id. Lead-based scheduling fica em fluxo separado.

**Escopo:**
- Server action `listProfessionalsAction` (read-only)
- Wizard step 2 trocar input texto → select de professional FK
- Adicionar mutex "Lead OR Patient" no step 1
- Lead search via `LeadRepository.list({ filters })`
- Conflict check passa `professionalId` real
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2AUX2_PROFESSIONAL_FK_AND_LEAD_READY`

---

### Opção C · CRM_PHASE_2L.2.1 · Template approval mirror

**Pré-requisito:** acesso manual ao Meta Business Manager.

**Escopo:** popular `meta_approval_status` em `wa_message_templates` (sem migration · só UPDATE manual + doc + validation).

**Verdict alvo:** `PASS_CRM_PHASE_2L21_TEMPLATE_APPROVAL_POPULATED`

---

### Opção D · CRM_PHASE_2ALEXA.AUDIT · Alexa/boas-vindas audit (item #6 matriz · PENDENTE)

**Por quê:** item #6 da matriz original ainda PENDENTE. Auditoria READ-ONLY para entender escopo.

**Escopo:**
- Audit completo de mensagens de boas-vindas (Lara cold-open atualmente)
- Inventário de templates Alexa/welcome existentes
- Diferenciar Alexa (canal voz) vs welcome flow Lara
- Plano operacional · sem implementação
- Doc + validation read-only

**Verdict alvo:** `PASS_CRM_PHASE_2ALEXA_AUDIT_READY`

---

### Opção E · CRM_PHASE_2R.3 · Reschedule lineage (cross-appointment FK)

**Por quê:** path atual de remarcação edita MESMO appointment. Lineage formal (old=remarcado + new=novo + FK) seria enterprise-grade.

**Escopo:**
- Mig nova com colunas `rescheduled_from_appointment_id` + `rescheduled_to_appointment_id`
- Action `rescheduleAppointmentAction` que cria novo + atualiza antigo em transação atômica
- UI: botão "Remarcar com lineage" (avançado) vs "Editar horário" (simples)
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2R3_LINEAGE_READY`

---

## Recomendação ordenada

1. **2RC** · recuperação comercial · destrava item #18 matriz · ~3h
2. **2AUX.2** · Professional FK + Lead support · UX completion · ~3h
3. **2L.2.1** · Template approval · só com acesso Meta Business Manager
4. **2ALEXA.AUDIT** · audit pendente · ~2h
5. **2R.3** · lineage opcional · só se demanda real surgir

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar 2R.2 outcomes
# Rodar docs/crm-refactor/sql/phase-2r2-appointment-outcomes-validation.sql

# Validar 2AUX.3 edit route
# Rodar docs/crm-refactor/sql/phase-2aux3-edit-appointment-route-validation.sql
```

## Comandos PROIBIDOS

- Reintroduzir status zumbi
- `cron.alter_job(71, active := true)`
- Apply migration sem prep + smoke
- `git push --force`

---

## Sinais de risco (parar e reportar)

- `motivo_cancelamento` IS NULL com `cancelado_em` populado (CHECK violado)
- `phase='perdido'` aparecendo
- Status zumbi reintroduzido
- Worker 71 ON

---

## Sequência sugerida pra próxima rodada

1. Push commit local 2R.2 (após autorização)
2. Decisão: 2RC · 2AUX.2 · 2L.2.1 · 2ALEXA.AUDIT · 2R.3
3. Executar prompt da fase escolhida
