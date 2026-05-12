# CRM · Next Prompt After 2AUX.3

> Round: 2AUX.3 entregou rota dedicada `/crm/agenda/[id]/editar` que reusa o wizard rich 2AUX em modo `editing`. Defesa em profundidade tripla (SSR + UI + server action). Zero migration · zero envio.

---

## Estado consolidado pós-2AUX.3

- HEAD esperado: commit local `feat(crm): add appointment edit route`
- Rota `/crm/agenda/[id]/editar` criada · reusa wizard 4 passos
- Botão "Editar agendamento" no detalhe page (só se editável)
- Terminal status (`finalizado`/`cancelado`/`no_show`/`remarcado`) bloqueia render do wizard
- updateAppointmentAction revalida terminal + conflict (defesa em profundidade)
- Migs 156–168 aplicadas · worker 71 OFF · ban gate 2L intacto

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO usar status zumbi
- NÃO reintroduzir `phase='perdido'`
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2R.2 · No-show/cancelamento/remarcação refinement (RECOMENDADA)

**Por quê:** itens #15/16/17 da matriz original ainda parciais. Modal no-show atual é simples (motivo livre) · cancel pede motivo mas sem categorização · remarcação só via dragDrop.

**Escopo:**
- Modal no-show com select de motivos predefinidos (sem_aviso, ausencia_justificada, esqueceu, outro) · igual padrão 2J.1 lead_lost
- Modal cancelamento com motivos categorizados (cliente_pediu, conflito_agenda, profissional_indisponivel, outro) + opcional propor remarcação inline (link para /editar)
- Documentar dragDrop como path canônico de remarcação rápida
- Smoke ROLLBACK + validation + doc

**Verdict alvo:** `PASS_CRM_PHASE_2R2_NO_SHOW_CANCEL_REMARK_READY`

---

### Opção B · CRM_PHASE_2RC · Recuperação comercial

**Por quê:** com 2J.1 ativa, `perdidos` table começa a popular. Falta UI/automação de "trazer de volta". Item #18 da matriz.

**Escopo:**
- Página `/crm/recuperacao` listando perdidos recuperáveis (`is_recoverable=true`) ordenados por `lost_at desc`
- Filtros por `lost_reason` + `lost_from_phase`
- Botão "Reativar lead" → UPDATE leads.lifecycle_status='recuperacao' + audit em phase_history
- Sem WhatsApp ainda (depende de 2L.3+)
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2RC_RECOVERY_READY`

---

### Opção C · CRM_PHASE_2AUX.2 · Professional FK + Lead support no wizard

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

### Opção D · CRM_PHASE_2L.2.1 · Template approval mirror

**Pré-requisito:** acesso manual ao Meta Business Manager.

**Escopo:** popular `meta_approval_status` em `wa_message_templates` (sem migration · só UPDATE manual + doc + validation).

**Verdict alvo:** `PASS_CRM_PHASE_2L21_TEMPLATE_APPROVAL_POPULATED`

---

## Recomendação ordenada

1. **2R.2** · UX polish em no-show/cancel/remark · ~2h
2. **2RC** · recuperação comercial · destrava item #18 · ~3h
3. **2AUX.2** · Professional FK + Lead support · maior · pode ficar pra próxima rodada
4. **2L.2.1** · Template approval · só com acesso Meta Business Manager

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar 2AUX.3
# Rodar docs/crm-refactor/sql/phase-2aux3-edit-appointment-route-validation.sql

# Validar 2AUX
# Rodar docs/crm-refactor/sql/phase-2aux-appointment-modal-validation.sql

# Validar 2H.1 cleanup zumbis
# Rodar docs/crm-refactor/sql/phase-2h1-status-zombie-cleanup-validation.sql
```

## Comandos PROIBIDOS

- Reintroduzir status zumbi
- `cron.alter_job(71, active := true)`
- Apply migration sem prep + smoke
- `git push --force`

---

## Sinais de risco (parar e reportar)

- `phase='perdido'` aparecendo
- Edit bypassando terminal block
- Status zumbi aparecendo em código novo
- Worker 71 ON

---

## Sequência sugerida pra próxima rodada

1. Push commit local 2AUX.3 (após autorização)
2. Decisão: 2R.2 · 2RC · 2AUX.2 · 2L.2.1
3. Executar prompt da fase escolhida
