# Round 4 · Prompt 1 · Operational UI Surfaces · Local Patch

**Status:** LOCAL ONLY · ZERO commit · ZERO apply · ZERO deploy.
**Escopo:** transformar a fila R3 e os agregados R2 em UI operacional
visível para a secretaria · staff dispatcha manualmente · zero envio
externo automático.

Round 1 fechou agenda foundation. Round 2 fechou multi-procedure +
multi-payment. Round 3 fechou `appointment_post_actions` queue + finalize
wizard com checkboxes opt-in. **Round 4 expõe tudo isso operacionalmente:**
staff dashboard de pós-ações, aba post-actions no perfil do paciente,
strip de alertas no topo da agenda, e cards ricos de procedimentos +
pagamentos + pós-ações no detalhe do agendamento.

## Audit consolidado (3 agentes paralelos)

### Agent 1 · Legacy operational UI (clinic-dashboard)

15 surfaces operacionais identificadas no legacy:

**P0** (operational backbone):
- Day Alerts Strip
- Finalize Day Modal (close-of-business guard)
- Appointment Modal (form com procs/payments arrays)
- Finalize Wizard (2-column)
- Day Pending Modal
- Agenda Automations checkboxes

**P1** (operational mas não-blocking):
- Notifications Panel (sininho)
- Complaints Panel (em patient profile)
- Retoques Dashboard
- Patients Table
- Agenda Overview

**P2** (deferred):
- Procedures Catalog
- Draft Autosave

**Decisão arquitetural canônica do user:** "Replicate field labels,
button text, validation order, empty state copy **exactly** as legacy."

### Agent 2 · v2 current state

| Surface | v2 status | Gap |
|---|---|---|
| `/crm` index | ✅ existe | none |
| `/crm/agenda` | ✅ existe (week/day/month + KPIs) | **day alerts strip** missing |
| `/crm/agenda/[id]` | ✅ existe (FinalizeWizard com R3 wiring) | **rich detail card** missing (só dentro do modal) |
| `/crm/mesa-operacional` | ✅ adequate · 7 buckets | none |
| `/crm/dashboard` | ✅ adequate · KPIs + funnel | none |
| `/crm/kanban` + `/seven-days` | ✅ adequate | none |
| `/crm/leads` | ✅ adequate | none |
| `/crm/pacientes/[id]` | ✅ existe · 10 tabs | **post-actions tab** missing |
| `/crm/recuperacao` | ✅ adequate · 3 buckets | none |
| `/crm/post-acoes` | ❌ **MISSING** | **NEW ROUTE** |
| AlertBell (sininho) | ✅ adequate · mig 161 + polling | none |
| Tasks button (topbar) | ⚠ disabled placeholder | **wire to /crm/post-acoes** |

### Agent 3 · Data sources (ZERO new migration needed)

Existing repos cover 100% das necessidades R4 P0:
- `AppointmentPostActionsRepository` · `listPendingByClinic`, `getById`, `updateStatus`, `listByAppointment`, `createBatch`
- `AppointmentRepository` · `getById`, `listByDateRange`, `listBySubject`
- `AppointmentProcedureItemsRepository` · `listByAppointment`
- `AppointmentPaymentsRepository` · `listByAppointment`, `getFinancialSummary`

**Recomendação Agent 3 confirmada:** ZERO new migration. Apenas:
- Métodos auxiliares nos repos existentes (batch lookups)
- Server actions para mark done/dismiss/cancel
- UI components consumindo dados via RSC + repos

## Patch local (R4 Prompt 1)

### Repositórios estendidos (sem nova mig)

`packages/repositories/src/appointment.repository.ts`
- `findByIds(ids: string[])` · batch lookup por IDs · usado para
  enrichment em queues sem N+1 round-trips. Filtra deleted_at + RLS.

`packages/repositories/src/appointment-post-actions.repository.ts`
- `listByClinic(clinicId, { status?, actionType?, limit? })` · listagem
  flexível por status arbitrário (ou todos) · usada pelo staff dashboard
  para mostrar histórico (done/dismissed/cancelled). Ordenação
  por created_at desc.
- `listByAppointmentIds(appointmentIds[])` · lista pós-ações para
  múltiplos appointments · usada pela aba post-actions do perfil do
  paciente.

### Server Actions

`apps/lara/src/app/crm/_actions/post-action.actions.ts` (NOVO):
- `markPostActionDoneAction({ id, notes? })` · staff registrou que
  executou manualmente. Valida status=pending. Atualiza
  status=done + executed_at.
- `dismissPostActionAction({ id, reason })` · staff optou por pular.
  Motivo obrigatório (≥ 3 chars). Status=dismissed + dismissed_at +
  dismissed_reason.
- `cancelPostActionAction({ id, reason? })` · paciente recusou ou
  regra deixou de fazer sentido. Status=cancelled.
- Cada action invalida `CRM_TAGS.postActions` (novo).
- ZERO disparo externo · ZERO provider · ZERO worker.

### UI Surfaces (P0)

**1. Staff dashboard `/crm/post-acoes`**

Route nova:
- `apps/lara/src/app/crm/post-acoes/page.tsx` (RSC · force-dynamic)
- `apps/lara/src/app/crm/post-acoes/_components/post-actions-queue.tsx` (client)

Features:
- KPI strip · pendentes total + atrasadas + breakdown por tipo (5
  action_types: google_review, vpi_indication, retouch_reminder,
  complaint_logged, payment_followup).
- Filtros por status (pending/done/dismissed/cancelled/all) e por tipo
  via querystring.
- Tabela com: tipo (badge colorido), status (badge), paciente/lead
  (link para appointment), data agendamento, schedule_at (red highlight
  se atrasada), criado em, notas, ações.
- Ações por row: Concluir · Dispensar (modal motivo) · Cancelar.
- Empty state explícito.
- Footer informativo: "Zero envio automático".

`apps/lara/src/app/crm/_components/crm-topbar.tsx` · wire do botão
"Tasks" (antes `disabled`) para link `/crm/post-acoes`.

**2. Post-actions tab no perfil do paciente**

`apps/lara/src/app/crm/pacientes/[id]/_record-tabs.tsx`:
- Adicionado 11º tab `post-acoes` (após `notas`) · ícone `ListTodo`.
- Componente interno `PostActionsTab` · tabela read-only de pós-ações
  cross-appointments daquele paciente.
- Mostra: tipo, status, link para agendamento, schedule_at, criado em,
  notas/motivo dispensa.
- Empty state quando paciente nunca teve pós-ação registrada.
- Hint: "Staff dispatcha em /crm/post-acoes ou no botão do topbar".

`apps/lara/src/app/crm/pacientes/[id]/page.tsx`:
- Fetch `repos.appointmentPostActions.listByAppointmentIds(...)` para
  todos os appointments do paciente.
- Passa como prop `postActions` para `PatientRecordTabs`.

### UI Surfaces (P1)

**3. Day alerts strip on `/crm/agenda`**

`apps/lara/src/app/crm/agenda/_components/day-alerts-strip.tsx` (NOVO):
- Server component pure · zero estado.
- Recebe `postActions` (pending) + `dayIso` (data alvo).
- Filtra pós-ações pending com schedule_at::DATE <= dayIso.
- Renderiza pills com counts agrupados (atrasadas, hoje, por tipo).
- Cada pill linka para `/crm/post-acoes?status=pending&type=...`.
- Não renderiza nada se zero pending.

`apps/lara/src/app/crm/agenda/page.tsx`:
- Adicionada fetch de `repos.appointmentPostActions.listPendingByClinic(...)`
  em paralelo com appointments/aggregates/staff.
- Insert do `<AgendaDayAlertsStrip>` entre header e toolbar.

**4. Rich appointment detail card on `/crm/agenda/[id]`**

`apps/lara/src/app/crm/agenda/[id]/page.tsx`:
- Adicionado fetch em paralelo: procedureItems + payments +
  financialSummary + postActions.
- 3 novos cards (`md:col-span-3`) entre Service e Obs:
  - **Procedimentos** · tabela com nome, qtd, unit, bruto, desconto,
    líquido, flags (Cortesia · Retorno Nd).
  - **Pagamentos** · tabela com forma/valor/parcelas/venc./status/notas
    + grid resumo financeiro (Bruto/Desconto/Líquido/Pago/Pendente/
    Saldo) com cores semânticas.
  - **Pós-ações** · tabela tipo/status/programada/notas · hint para
    `/crm/post-acoes`.
- Cards só renderizam se houver dados · zero ruído quando appointment
  é single-procedure legado sem R2/R3 wiring.

### E2E

`apps/lara/e2e/authed/crm-operational-ui.spec.ts` (NOVO · 6 cenários):
- R4.1 `/crm/post-acoes` responde 200
- R4.2 empty state OU tabela visível
- R4.3 `/crm/agenda` responde sem crash
- R4.4 `/crm/agenda/novo` regressão · still responds
- R4.5 `/crm/agenda/[id]` cards ricos · zero crash
- R4.6 `/crm/pacientes/[id]?tab=post-acoes` carrega

Read-only · skip via `probeTable` quando mig 197 ausente · skip via
auth redirect detection se cookie incompleto.

## Gates verde

- `pnpm --filter @clinicai/repositories typecheck` · **PASS**
- `pnpm --filter @clinicai/lara typecheck` · **PASS**
- `pnpm --filter @clinicai/lara test` · **70/70 PASS · 4 test files**
- `npx vitest run packages/utils/src/money.test.ts` · **29/29 PASS**
- `pnpm --filter @clinicai/lara build` · **PASS** (warnings pré-existentes)
- Canon grep nos artefatos novos · **clean**
- Provider/cron/WhatsApp/wa_outbox scan em artefatos novos · **clean**
- `git diff --check` · clean (apenas warning CRLF informativo)

## Riscos / O que ficou fora

### Conhecidos · documentados

1. **Sem migration** · todo R4 P0 sai com schemas existentes (mig 161,
   193, 194, 195, 197 já aplicadas em R1/R2/R3). Prompt 2 só precisa
   commit + push + PR + CI.
2. **Sem mutações novas em RPC** · server actions usam `updateStatus()`
   do repo · zero alteração em appointment_finalize, hard gate,
   appointment_attend, lead_to_paciente, lead_to_orcamento.
3. **Cache invalidation via `CRM_TAGS.postActions`** · refresh do client
   é via `router.refresh()` pós-mutation. Sem race condition com
   server-side cache.

### Fora de escopo (Round 5+)

- **Worker/cron automático** dispatchando a fila sem intervenção manual.
- **Real provider** dispatch (Google Review API, VPI autoEnroll RPC,
  Evolution WhatsApp).
- **Cashflow ledger** (`cashflow_entries`) wire em finalize.
- **TCLE / payment consent** auto-send via LegalDocumentsService.
- **Retouch wire** em `retoque_campaigns` legacy (mig 150) · staff
  dashboard separado com KPIs/tabela de retoques.
- **Complaint wire** em `patient_complaints` legacy (mig 643) · saída
  do payload jsonb para tabela própria.
- **Notifications bell** integrado com post-actions · bell hoje só
  alerta de appointments (mig 161), poderia ler também post-actions
  recém-criadas.
- **Bulk actions** no staff dashboard · multi-select para mark
  done/dismissed em massa.
- **Backfill** items/payments/post_actions para appointments legados.
- **Operational UI broader** · Mesa operacional poderia ter um widget
  contando post-actions atrasadas.

## Probes para Prompt 2

R4 P0 **NÃO requer nova migration**. Prompt 2 não precisa apply step ·
só commit + push + PR + CI.

Probes pós-merge (read-only · validar que nada quebrou):

```sql
-- 1. R3 objects ainda existem (R4 não dropou nada)
SELECT
  'r4_objects' AS section,
  to_regclass('public.appointment_post_actions')::text AS appointment_post_actions,
  to_regclass('public.appointment_financial_summary')::text AS financial_summary,
  to_regclass('public.appointment_procedure_items')::text AS procedure_items,
  to_regclass('public.appointment_payments')::text AS payments;

-- 2. Worker 71 OFF (R4 não toca)
SELECT 'worker_71' AS section, jobid, active, jobname
FROM cron.job WHERE jobid = 71;

-- 3. wa_outbox baseline preservado
SELECT 'wa_outbox' AS section, status, count(*)
FROM public.wa_outbox GROUP BY status ORDER BY status;

-- 4. invalid_phases = 0
SELECT 'invalid_phases' AS section, count(*) AS invalid_phase_count
FROM public.leads
WHERE phase IN ('compareceu','perdido','reagendado');

-- 5. mig 167 hard gate intact (appointment_finalize RPC unchanged)
SELECT 'finalize_rpc' AS section, proname,
  (pg_get_functiondef(p.oid) LIKE '%clinical_gate_status%')::text AS has_gate
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND proname='appointment_finalize';
```

## Próximas fases

- **Prompt 2** · commits granulares + push + PR + CI. Zero apply step
  (não há mig nova).
- **Prompt 3** · merge + deploy + smoke final + closeout.
- **Round 5** · NÃO iniciar (instrução explícita).
