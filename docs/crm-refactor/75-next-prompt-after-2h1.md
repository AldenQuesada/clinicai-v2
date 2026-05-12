# CRM · Next Prompt After 2H.1

> Round: 2H.1 alinhou runtime TS com status canônicos do DB · removeu zumbis `pre_consulta`/`em_consulta` + phase labels legacy. Zero migration. Zero envio.

---

## Estado consolidado pós-2H.1

- HEAD esperado: commit local `fix(crm): clean up legacy appointment status references`
- Migs 156–166 + 167 + 168 aplicadas (zero mig em 2H.1)
- Worker 71 OFF preservado · ban gate 2L intacto
- AppointmentStatus TS agora alinhado 100% com DB CHECK constraint (11 valores · zero zumbi)
- Phase canônica: lead/agendado/paciente/orcamento (zero `perdido` regression)
- `perdido` exclusivamente em `lifecycle_status` · rota dedicada `lead_lost` (2J.1)

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar wa_outbox
- NÃO reintroduzir zumbis (`pre_consulta`, `em_consulta`, `phase='perdido'`)
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2AUX · Modal agendamento completo (RECOMENDADA)

**Por quê:** item #7 da matriz original. UI atual de agendar (`/crm/agenda/novo`) tem form simples · falta wizard rich para enterprise UX.

**Escopo:**
- Wizard 3 telas: subject (lead/patient search) → tempo (data/hora/conflitos) → procedimento (templates default)
- Search/select de lead OU patient (sem misturar · ADR-001)
- Validação de conflito client-side via `checkConflicts` + helper
- Pré-preenchimento por procedimento default
- Submit usa `scheduleAppointmentAction` (atomic phase transition)
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2AUX_SCHEDULE_WIZARD_READY`

---

### Opção B · CRM_PHASE_2R.2 · No-show/cancelamento/remarcação refinement

**Por quê:** itens #15/16/17 da matriz original são PARCIAIS. RPCs existem (markNoShow, cancel, dragDrop) mas UX dedicada pode melhorar (igual a 2J.1 lead_lost).

**Escopo:**
- Modal no-show com select de motivos predefinidos (já existe? · ver UX)
- Modal cancelamento com motivo categorizado + opcional propor remarcação
- Remarcação via dragDrop documentada como path canônico
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2R2_NO_SHOW_CANCEL_REMARK_READY`

---

### Opção C · CRM_PHASE_2RC · Recuperação comercial

**Por quê:** com 2J.1, `perdidos` table começa a popular. Falta UI/automação de "trazer de volta". Item #18 da matriz.

**Escopo:**
- Página `/crm/recuperacao` listando perdidos recuperáveis (`is_recoverable=true`) ordenados por `lost_at desc`
- Filtros por `lost_reason` + `lost_from_phase`
- Botão "Reativar lead" → UPDATE leads.lifecycle_status='recuperacao' + audit
- Sem WhatsApp ainda (depende de 2L.3+)
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2RC_RECOVERY_READY`

---

### Opção D · CRM_PHASE_2L.2.1 · Template approval mirror

**Por quê:** sem nenhum template approved no DB, 2L.3 (canary real) está bloqueada. Esta sub-fase é pequena (sem migration · só UPDATE manual + doc + script helper).

**Pré-requisito:** acesso manual ao Meta Business Manager para conferência.

**Escopo:**
- Doc com checklist para conferência Meta Business Manager
- SQL helper para preencher `meta_approval_status` + `meta_template_name` + `meta_language`
- Validation SQL para confirmar pelo menos 1 approved
- Sem código novo · sem mig

**Verdict alvo:** `PASS_CRM_PHASE_2L21_TEMPLATE_APPROVAL_POPULATED`

---

### Opção E · CRM_PHASE_2H.2 · Cosmetic SQL cleanup (opcional)

**Por quê:** RPCs SQL antigas ainda contêm `em_consulta`/`pre_consulta` em fallbacks ou switch cases unreachable. CHECK do DB já rejeita esses status, então paths são dead code · mas confunde manutenção.

**Escopo:**
- Mig nova `CREATE OR REPLACE` em RPCs específicas removendo zumbis
- Pode ser dispensado se a fase 2H.1 cobre o suficiente
- Recomendação: PULAR esta fase a menos que apareça caso real

**Verdict alvo:** `PASS_CRM_PHASE_2H2_SQL_COSMETIC_CLEANUP_READY`

---

## Recomendação ordenada

1. **2AUX** · wizard agendamento · enterprise UX · destrava item #7 matriz
2. **2RC** · recuperação comercial · destrava item #18 matriz · consome perdidos table (2J.1)
3. **2R.2** · refinement no-show/cancel/remark · UX polish
4. **2L.2.1** · template approval · só com acesso Meta Business Manager
5. **2H.2** · SQL cosmetic cleanup (opcional · pular se não houver demanda)

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar 2H.1 cleanup
# Rodar docs/crm-refactor/sql/phase-2h1-status-zombie-cleanup-validation.sql

# Validar 2J.1 lead lost
# Rodar docs/crm-refactor/sql/phase-2j1-lead-lost-dedicated-flow-validation.sql
```

## Comandos PROIBIDOS

- Reintroduzir `pre_consulta` ou `em_consulta` no TS
- `UPDATE leads SET phase='perdido'` (regressão)
- `cron.alter_job(71, active := true)`
- Apply migration sem prep + smoke

---

## Sinais de risco (parar e reportar)

- `pre_consulta` ou `em_consulta` aparecendo em código TS novo
- `phase='perdido'` aparecendo em leads (regressão · 2J.1 violado)
- Worker 71 ON
- Comentário `phase=compareceu` reintroduzido em código novo

---

## Sequência sugerida pra próxima rodada

1. Push commit local 2H.1 (após autorização)
2. Decisão: 2AUX · 2RC · 2R.2 · 2L.2.1 · ou 2H.2 (opcional)
3. Executar prompt da fase escolhida
