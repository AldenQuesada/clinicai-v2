# CRM · Next Prompt After 2AUX

> Round: 2AUX entregou wizard rich de agendamento (4 passos + live conflict check + suporte a edit mode) e reforçou backend com checkConflicts + terminal block. Zero migration · zero envio.

---

## Estado consolidado pós-2AUX

- HEAD esperado: commit local `feat(crm): improve appointment scheduling modal`
- Wizard rich em `/crm/agenda/novo` (4 passos · Paciente → Tempo → Detalhes → Revisão)
- Live conflict check via `checkAppointmentConflictAction` (server action nova)
- `createAppointmentAction` + `updateAppointmentAction` reforçados (defesa em profundidade)
- Terminal status bloqueia edit (`finalizado`/`cancelado`/`no_show` → `appointment_terminal`)
- Migs 156–168 aplicadas · worker 71 OFF · ban gate 2L intacto

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO usar status zumbi
- NÃO reintroduzir `phase='perdido'`
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2R.2 · No-show/cancel/remark refinement (RECOMENDADA)

**Por quê:** itens #15/16/17 da matriz original ainda parciais. RPCs existem (markNoShow, cancel, dragDrop) mas UX dedicada melhora consistência (igual a 2J.1 lead_lost).

**Escopo:**
- Modal no-show com select de motivos predefinidos (sem_aviso, ausencia_justificada, esqueceu, outro)
- Modal cancelamento com motivos categorizados + opcional propor remarcação inline
- Remarcação via wizard 2AUX (já tem edit mode) ou dragDrop · documentar paths
- Smoke ROLLBACK + validation + doc

**Verdict alvo:** `PASS_CRM_PHASE_2R2_NO_SHOW_CANCEL_REMARK_READY`

---

### Opção B · CRM_PHASE_2RC · Recuperação comercial

**Por quê:** com 2J.1, `perdidos` table começa a popular. Falta UI/automação de "trazer de volta". Item #18 da matriz.

**Escopo:**
- Página `/crm/recuperacao` listando perdidos recuperáveis (`is_recoverable=true`) ordenados por `lost_at desc`
- Filtros por `lost_reason` + `lost_from_phase`
- Botão "Reativar lead" → UPDATE leads.lifecycle_status='recuperacao' + audit
- Sem WhatsApp ainda (depende de 2L.3+)
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2RC_RECOVERY_READY`

---

### Opção C · CRM_PHASE_2AUX.2 · Professional FK + Lead support no wizard

**Por quê:** wizard 2AUX usa `professionalName` texto livre · conflito por profissional não é detectado. Lead-based scheduling fica em fluxo separado.

**Escopo:**
- Server action `listProfessionalsAction` (read-only) lista active professionals
- Wizard step 2 trocar input texto → select de professional FK
- Adicionar opção "subject" no step 1: Lead OR Patient (mutex)
- Lead search/select via `LeadRepository.list({ filters })`
- Conflict check passa `professionalId` real
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2AUX2_PROFESSIONAL_FK_AND_LEAD_READY`

---

### Opção D · CRM_PHASE_2AUX.3 · Edit appointment dedicated route

**Por quê:** wizard 2AUX já suporta `editing` prop mas a rota `/crm/agenda/[id]/editar` não foi criada.

**Escopo:**
- Nova rota Next.js `/crm/agenda/[id]/editar/page.tsx`
- Carrega appointment via SSR + repos.appointments.getById
- Renderiza `NewAppointmentForm` com `editing` prop preenchida
- Botão "Editar" no detail page que linka para a rota
- Smoke + doc (apenas UI · zero backend novo)

**Verdict alvo:** `PASS_CRM_PHASE_2AUX3_EDIT_ROUTE_READY`

---

### Opção E · CRM_PHASE_2L.2.1 · Template approval mirror

**Pré-requisito:** acesso manual ao Meta Business Manager.

**Escopo:** popular `meta_approval_status` em `wa_message_templates` (sem migration · só UPDATE manual + doc + validation).

**Verdict alvo:** `PASS_CRM_PHASE_2L21_TEMPLATE_APPROVAL_POPULATED`

---

## Recomendação ordenada

1. **2AUX.3** · Edit route · 30min · destrava UX completa de edição (curto)
2. **2R.2** · No-show/cancel/remark refinement · UX polish · ~2h
3. **2RC** · Recuperação comercial · destrava item #18 matriz · ~3h
4. **2AUX.2** · Professional FK + Lead support · maior · pode ficar pra próxima rodada
5. **2L.2.1** · Template approval · só com acesso Meta Business Manager

Recomendação primeira: **2AUX.3** porque é o complemento natural de 2AUX (rota dedicada para o wizard rich em edit mode).

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar 2AUX
# Rodar docs/crm-refactor/sql/phase-2aux-appointment-modal-validation.sql

# Validar 2H.1 cleanup zumbis
# Rodar docs/crm-refactor/sql/phase-2h1-status-zombie-cleanup-validation.sql
```

## Comandos PROIBIDOS

- Reintroduzir `pre_consulta`/`em_consulta` no TS
- `cron.alter_job(71, active := true)`
- Apply migration sem prep + smoke
- `git push --force`

---

## Sinais de risco (parar e reportar)

- Wizard permitindo submit com `schedule_conflict` server-side
- Edit bypassando terminal block
- Status zumbi aparecendo em código novo
- `phase='perdido'` aparecendo
- Worker 71 ON

---

## Sequência sugerida pra próxima rodada

1. Push commit local 2AUX (após autorização)
2. Decisão: 2AUX.3 · 2R.2 · 2RC · 2AUX.2 · 2L.2.1
3. Executar prompt da fase escolhida
