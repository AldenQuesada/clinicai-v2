# CRM · Next Prompt After LEGACY.UI.AUDIT

> Round LEGACY.UI.AUDIT mapeou 25 módulos legacy × v2. Resultado: v2
> cobre toda a coluna vertebral CRM-Agenda. Ports remanescentes são
> auxiliares (analytics, prontuário, anamnese-builder, tags/kanban).

---

## Estado consolidado pós-LEGACY.UI.AUDIT

- HEAD esperado pós-push: novo commit `docs(crm): audit legacy ui port plan`
- 9 módulos COBERTOS · 5 PORTAR · 4 RECRIAR · 2 DESCARTAR · 3 BLOQUEADOS · 2 AUDITAR
- Worker 71 OFF · `core_contracts_ready=true` · zero `wa_outbox`
- 18 funções pg_proc com termos zumbi · 9 RPCs Alexa dormentes (cleanup
  diferido para CONTROL.1)
- `can_open_control_audit_after_port_plan=true`

---

## Regras invioláveis (continuam)

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO chamar provider externo / Alexa API
- NÃO criar `wa_outbox` row
- NÃO copiar legacy literal · só recriar limpo no v2
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2AUX.2 · Professional FK + Lead support no wizard (RECOMENDADA)

**Por quê:** pré-requisito para qualquer relatório por profissional e
para dashboards SDR/financeiro mais profundos. Wizard atual passa nome
string em alguns paths · FK first-class garante integridade e permite
filtros de agenda por profissional.

**Escopo:**
- Migrar wizard `crm/agenda/novo/_form.tsx` para usar `professional_id`
  (FK) ao invés de string
- Lead support no wizard (criar appt direto pra lead sem virar paciente
  antes · usa `appointments.lead_id` first-class)
- Smoke transacional + validation SQL
- Sem provider · sem WhatsApp · sem cron novo

### Opção B · CRM_PHASE_2ALEXA.1 · Internal welcome panel polish

**Por quê:** ganho UX imediato · zero risco. Polish do `AlertBell`
para destacar `arrival` + tempo decorrido + botão "Iniciar atendimento"
inline + toggle de som local Web Audio API.

**Escopo:**
- `AlertBell.tsx` + `useAppointmentInternalAlerts.ts` patches
- localStorage para toggle de som
- Smoke manual
- Sem migration

### Opção C · CRM_PHASE_LEGACY.PORT.DASHBOARDS · SDR funil + financeiro

**Por quê:** dashboard v2 base não tem analytics profundo. Legacy
`sdr.js` + `financeiro-reports.js` tem funil de conversão, source
comparison, no-show por motivo. SQL canônico já existe (`crm_operational_view`),
falta render React.

**Escopo:**
- `/dashboard` evoluído com cards de funil
- Server Component + Suspense para query intensiva
- Sem provider externo · sem migration
- Recriar do zero (não portar `sdr.js` literal · usar views v2)

### Opção D · CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN · CRUD procedimentos

**Por quê:** procedimentos só são read no v2 (via `ProcedureRepository`).
Admin precisa CRUD UI para cadastrar/editar/desativar. Mig pequena ·
ROI alto para operação diária da clínica.

**Escopo:**
- Rota `/configuracoes/procedimentos`
- CRUD: list + create + edit + soft-delete
- Mig pode ser só RPCs (tabela já existe)
- Sem provider externo

### Opção E · CRM_PHASE_CONTROL.1 · Auditoria final DB

**Por quê:** drop seguro de 18 funções zumbi (em_consulta/pre_consulta/
compareceu/reagendado) + 9 RPCs Alexa dormentes + audit RLS final.
**Apenas após** 2AUX.2 + 1 port crítico (per recomendação do audit).
Rodar agora é prematuro.

**Status:** **NÃO escolher agora** · esperar finalizar 2AUX.2 e 1 port.

---

## Recomendação

**Opção A** (CRM_PHASE_2AUX.2) · prioridade 1 da matriz LEGACY.UI.AUDIT.
Pré-requisito para dashboards SDR/financeiro mais profundos e para
CONTROL.1. ROI alto, risco baixo, sem provider externo, sem migration
custosa.

Alternativa: **Opção B** (2ALEXA.1) se Alden quer ganho UX imediato
visível em produção sem esperar wizard refactor.

---

## Mega-prompt template (Opção A · 2AUX.2)

```
CRM_PHASE_2AUX.2 · PROFESSIONAL FK + LEAD SUPPORT IN WIZARD

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO chamar provider.
NÃO criar wa_outbox.
NÃO alterar cron.
NÃO usar status zumbi.

ESCOPO:
1. Migrar wizard /crm/agenda/novo (e /editar) pra usar professional_id (FK)
2. Lead support · permitir criar appt diretamente para um lead existente
3. Mig se necessário (CHECK constraint + FK reinforce)
4. Smoke transacional + validation SQL
5. Typecheck repositories + lara
6. Commit local · push mediante autorização padrão

PASS_CRM_PHASE_2AUX2_PROFESSIONAL_FK_READY quando:
- wizard usa professional_id (FK)
- appointment_create_via_rpc valida FK · idempotente
- smoke transacional PASS · wa_outbox_delta=0
- typecheck OK
- commit local pronto
```

---

## Ordem de execução sugerida (próximas 4 fases)

| # | Fase | Risco | Pré-req | Bloqueia? |
|---|---|---|---|---|
| 1 | **2AUX.2** (Professional FK) | baixo | nenhum | CONTROL.1 |
| 2 | **LEGACY.PORT.DASHBOARDS** ou **2ALEXA.1** | baixo | 2AUX.2 | CONTROL.1 |
| 3 | **LEGACY.PORT.PROCEDURES_ADMIN** ou **LEGACY.PORT.PRONTUARIO** | médio | 2AUX.2 | — |
| 4 | **CONTROL.1** (audit final + cleanup) | médio | 2AUX.2 + 1 port | rollout produção pleno |

**Bloqueadas até unban Meta:**
- CRM_PHASE_2ALEXA.3 · Alexa real preflight
- CRM_PHASE_LEGACY.PORT.BIRTHDAYS · birthday automations envio
- CRM_PHASE_2L.2.1 · template approval mirror
- CRM_PHASE_2T · conversas envio outbound real
