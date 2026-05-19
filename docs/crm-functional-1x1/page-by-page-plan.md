# CRM Functional 1×1 · Page-by-Page Plan

**Status:** PLAN_RATIFIED ✅
**Data:** 2026-05-18
**Branch:** `crm/functional-1x1-leads-first-audit`
**Regra inegociável:** legacy clinic-dashboard é a **referência canônica de UIX/funcionalidade**. v2 só é considerado funcional quando estiver 1×1 com legacy em layout, cards, botões, filtros, colunas, modais, labels, textos, tooltips, validações, regras, permissões e side-effects internos.

## Regra do legacy como referência perfeita

O problema do legacy era:
- código instável
- bugs
- arquitetura difícil de manter
- lógica acoplada

O problema **NÃO** era:
- UIX
- fluxo operacional
- funcionalidades
- cards/modais/regras/mensagens/botões
- experiência da secretaria

Portanto, **CRM v2 só pode ser considerado funcional quando cada
página estiver 1×1 com legacy** em todos os aspectos UIX listados na
spec.

## Programa anterior (R1-R7) cobriu o quê

Os 7 rounds R1-R7 entregaram **backend canônico + schema + RLS +
hardening + canary**. Eles **NÃO** provaram paridade UIX 1×1. O
inventário R7 (Agent 2 v2) catalogou existência de componentes, mas
não comparou rótulo-a-rótulo / fluxo-a-fluxo com legacy.

**Conclusão:** R1-R7 endereçaram o DB/backend foundation. Esta nova
fase audita UIX/operacional contra legacy.

## Ordem oficial das páginas (não negociável)

1. **Leads** ← em audit nesta rodada
2. **Agenda**
3. **Novo Agendamento / Modal de Agendamento**
4. **Detalhe do Agendamento**
5. **Finalização / FinalizeWizard**
6. **Paciente / Perfil / Modal do paciente**
7. **Orçamentos**
8. **Procedimentos**
9. **Pagamentos / Financeiro do atendimento**
10. **Pós-ações**
11. **Mesa Operacional**
12. **Kanban**
13. **Recuperação**
14. **Dashboard**
15. **Notificações / Sininho / Topbar**
16. **Profissionais / Salas / Férias**
17. **Retoques**
18. **Queixas**
19. **Anamnese**
20. **TCLE**

Não avançar para Agenda antes de fechar audit + patch plan de Leads.

## Mapa geral das páginas legacy (clinic-dashboard)

Fonte: `C:\Users\Dr.Quesada\Documents\clinic-dashboard\`

| # | Página | Surface legacy principal | Arquivos auxiliares | Status |
|---|---|---|---|---|
| 1 | Leads | `index.html` (seção `page-leads-all`) | `js/leads.js` · `js/components/lead-modal.js` · `js/components/lead-card.js` · `js/components/leads-table.js` · `js/components/schedule-modal.js` · `js/services/leads.service.js` · `js/repositories/leads.repository.js` · `js/utils/leads-filter.js` · `js/utils/leads-queixa.js` · `css/sdr.css` | FOUND |
| 2 | Agenda | `agenda.html` · `index.html` (seção agenda) | `js/agenda*.js` (week-calendar/day-view/month-view) · `agenda-modal.detail.js` · `agenda-day-panel.js` · `agenda-validation.js` · `agenda-smart.js` · `agenda-leads.js` | FOUND |
| 3 | Novo Appointment | `appointment-form.html` · modais em `agenda*.js` | `js/components/lead-modal.js` (picker) · `schedule-modal.js` | FOUND |
| 4 | Detalhe Appointment | `appointment-detail.html` · modal em `agenda-modal.detail.js` | `agenda-day-panel.js` · `agenda-modal.detail.js` | FOUND |
| 5 | Finalização | finalize modal em legacy agenda | embed em `agenda-modal.detail.js` | NEEDS_MANUAL_INSPECTION |
| 6 | Paciente / Prontuário | `paciente.html` · `prontuario-wow.ui.js` | `medical-record-editor.ui.js` · `js/services/appointments.service.js` · `legal-documents.service.js` | FOUND |
| 7 | Orçamentos | `orcamentos.html` · `js/orcamentos.js` · embed em lead-modal tab | em `lead-modal.js` | FOUND |
| 8 | Procedimentos | `procedimentos.html` (admin) | (admin config) | FOUND |
| 9 | Pagamentos / Financeiro | embed em `appointment-detail.html` · `_apptPagamentos[]` | em `agenda-modal.detail.js` | FOUND |
| 10 | Pós-ações | `post-actions.html` · `retoque-campaigns.js` · `patient-complaints.js` | manual dispatch | FOUND |
| 11 | Mesa Operacional | `mesa-operacional.html` · 7-bucket Kanban | em legacy js específico | FOUND |
| 12 | Kanban | `kanban.html` · funnel-specific | `leads-context.js` (duplicata por funil) | FOUND |
| 13 | Recuperação | `recuperacao.html` · lost-lead UI | em legacy js | FOUND |
| 14 | Dashboard | `dashboard.html` · KPI cards | em legacy js | FOUND |
| 15 | Notificações | topbar legacy · `broadcast.ui.js` | sininho | FOUND |
| 16 | Profissionais/Salas/Férias | `configuracoes/*.html` admin | em config legacy | FOUND |
| 17 | Retoques | `retoque-campaigns.js` · agendamento manual | em legacy js | FOUND |
| 18 | Queixas | `patient-complaints.js` · log de queixas | em legacy js | FOUND |
| 19 | Anamnese | `anamnese.html` · `prontuario-wow.ui.js` (tab) · `lead-modal.js` (modal embed) | em legacy js | FOUND |
| 20 | TCLE | `tcle.html` · sign + store · `legal-documents.service.js` | em legacy js | FOUND |

## Mapa geral das páginas v2 (clinicai-v2)

Fonte: `C:\Users\Dr.Quesada\Documents\clinicai-v2\apps\lara\src\app\`

| # | Página | Surface v2 principal | Componentes filhos | Server actions | Status |
|---|---|---|---|---|---|
| 1 | Leads | `(authed)/leads/page.tsx` + `crm/leads/page.tsx` | `LeadsClient` · `LeadFiltersPanel` · `KpiCards` · `NewLeadModal` · `LeadDetailClient` · `LeadActions` · `LeadTagsPanel` · `BulkChangePhaseModal` · `BulkLostModal` | `lead.actions.ts` (12+ actions) | EXISTS |
| 2 | Agenda | `crm/agenda/page.tsx` · `_components/*` | `week-calendar` · `day-view` · `month-view` · `day-alerts-strip` | `appointment.actions.ts` | EXISTS |
| 3 | Novo Agendamento | `crm/agenda/novo/page.tsx` · `_form.tsx` | multi-mode wizard · Zod refines · server validators | `scheduleAppointmentAction` | EXISTS |
| 4 | Detalhe Appointment | `crm/agenda/[id]/page.tsx` · `_actions-bar.tsx` · `_clinical-panel.tsx` | rich card · anamnesis embed · TCLE embed | `attendAppointmentAction` · `finalizeAppointmentAction` · `getAppointmentFinancialSummaryAction` · `changeAppointmentStatusAction` | EXISTS |
| 5 | FinalizeWizard | embed em `_actions-bar.tsx` | summary + post-actions opt-in | `finalizeAppointmentAction` (orchestra sub-RPC) | EXISTS |
| 6 | Paciente | `crm/pacientes/[id]/page.tsx` · `_record-tabs.tsx` (11 tabs) | phone masked · signed photo URLs · timeline merge | `patient.actions.ts` · `_profile-actions.ts` | EXISTS |
| 7 | Orçamentos | `crm/orcamentos/page.tsx` · `[id]` · novo/editar | full lifecycle | `orcamento.actions.ts` | EXISTS |
| 8 | Procedimentos | `configuracoes/procedimentos/page.tsx` · `_client.tsx` | CRUD admin | `_actions.ts` | EXISTS |
| 9 | Pagamentos | embed em `_actions-bar.tsx` financial summary | view 195 + Money helper | finalize embed | EXISTS |
| 10 | Pós-ações | `crm/post-acoes/page.tsx` · `_components/post-actions-queue.tsx` | filter status/type | `post-action.actions.ts` | EXISTS |
| 11 | Mesa Operacional | `crm/mesa-operacional/page.tsx` · `_components/mesa-card.tsx` | 7-bucket Kanban · phase_history | `_actions.ts` | EXISTS |
| 12 | Kanban | `crm/kanban/page.tsx` + `seven-days/page.tsx` | drag-drop · 7-day window | `kanban/_actions.ts` | EXISTS |
| 13 | Recuperação | `crm/recuperacao/page.tsx` | lost-lead UI | `recuperacao/_actions.ts` | EXISTS |
| 14 | Dashboard | `crm/dashboard/page.tsx` | placeholder · sem mutations | RSC only | PARTIAL (R7 P2) |
| 15 | Notificações | `CrmTopbar` AlertBell + `day-alerts-strip.tsx` | wire placeholder · post-actions count | trigger automatic awaits | PARTIAL (R7 P2) |
| 16 | Profissionais/Salas/Férias | `configuracoes/*` admin | room_id FK · vacation fields | admin actions | EXISTS |
| 17 | Retoques | `appointment_post_actions.action_type='retouch_reminder'` | staff dashboard | `post-action.actions.ts` | EXISTS (manual) |
| 18 | Queixas | `appointment_post_actions.action_type='complaint_logged'` | staff dashboard | `post-action.actions.ts` | EXISTS (manual) |
| 19 | Anamnese | embed em `_clinical-panel.tsx` + patient profile tab | clinical canonical | sem CRUD inline em /leads | EXISTS (embed) |
| 20 | TCLE | embed em `_clinical-panel.tsx` · hard gate mig 167 | consent flow | sem ação dedicada | EXISTS (embed) |

## Page-by-page 1×1 plan matrix (ordem + prioridade + risco)

| # | Página | Prioridade | Risco operacional | Depende de banco? | Depende de WhatsApp/provider? | UI-only fix? | Prompt sugerido |
|---|---|---|---|---|---|---|---|
| 1 | **Leads** | **P0** | **ALTO** (página de entrada operacional) | parcial · novo lead wizard tem campos a mais que v2 (anamnese inicial · queixa principal · expectativas · score 0-100 · etc.) | NÃO | mostly UI/code · alguns schema fields a ressuscitar | `GO CRM_FUNCTIONAL_1X1_LEADS_PATCH` (1-3 prompts) |
| 2 | Agenda | P0 | ALTO (operação diária) | parcial | NÃO | mostly UI | `GO CRM_FUNCTIONAL_1X1_AGENDA_AUDIT` (após Leads) |
| 3 | Novo Agendamento | P0 | ALTO | parcial | NÃO | UI + wizard | `GO CRM_FUNCTIONAL_1X1_NOVO_AGENDAMENTO_AUDIT` |
| 4 | Detalhe Appointment | P0 | ALTO | parcial | NÃO | UI + rich card | `GO CRM_FUNCTIONAL_1X1_DETALHE_APPT_AUDIT` |
| 5 | FinalizeWizard | P0 | ALTO (hard gate) | sim (RPC) | NÃO | UI | `GO CRM_FUNCTIONAL_1X1_FINALIZE_AUDIT` |
| 6 | Paciente | P0 | MÉDIO | parcial | NÃO | UI mostly | `GO CRM_FUNCTIONAL_1X1_PACIENTE_AUDIT` |
| 7 | Orçamentos | P1 | MÉDIO | parcial | NÃO | UI mostly | `GO CRM_FUNCTIONAL_1X1_ORCAMENTOS_AUDIT` |
| 8 | Procedimentos | P1 | BAIXO (admin) | parcial | NÃO | UI | `GO CRM_FUNCTIONAL_1X1_PROCEDIMENTOS_AUDIT` |
| 9 | Pagamentos | P1 | MÉDIO | sim (view 195) | NÃO | UI mostly | `GO CRM_FUNCTIONAL_1X1_PAGAMENTOS_AUDIT` |
| 10 | Pós-ações | P1 | MÉDIO | parcial | NÃO (worker OFF) | UI | `GO CRM_FUNCTIONAL_1X1_POS_ACOES_AUDIT` |
| 11 | Mesa Operacional | P1 | MÉDIO | parcial | NÃO | UI | `GO CRM_FUNCTIONAL_1X1_MESA_AUDIT` |
| 12 | Kanban | P1 | MÉDIO | parcial | NÃO | UI | `GO CRM_FUNCTIONAL_1X1_KANBAN_AUDIT` |
| 13 | Recuperação | P1 | MÉDIO | parcial | NÃO | UI | `GO CRM_FUNCTIONAL_1X1_RECUPERACAO_AUDIT` |
| 14 | Dashboard | P2 | BAIXO (placeholder) | parcial | NÃO | UI completo | `GO CRM_FUNCTIONAL_1X1_DASHBOARD_AUDIT` |
| 15 | Notificações | P2 | BAIXO (wire) | sim | NÃO | UI + dispatch logic | `GO CRM_FUNCTIONAL_1X1_NOTIFICATIONS_AUDIT` |
| 16 | Profissionais/Salas | P2 | BAIXO (admin) | parcial | NÃO | UI | `GO CRM_FUNCTIONAL_1X1_PROFISSIONAIS_AUDIT` |
| 17 | Retoques | P2 | MÉDIO | parcial | NÃO | UI | `GO CRM_FUNCTIONAL_1X1_RETOQUES_AUDIT` |
| 18 | Queixas | P2 | MÉDIO | parcial | NÃO | UI | `GO CRM_FUNCTIONAL_1X1_QUEIXAS_AUDIT` |
| 19 | Anamnese | P1 | ALTO (clinical) | parcial | NÃO | UI | `GO CRM_FUNCTIONAL_1X1_ANAMNESE_AUDIT` |
| 20 | TCLE | P1 | ALTO (consent) | parcial | NÃO | UI | `GO CRM_FUNCTIONAL_1X1_TCLE_AUDIT` |

## Ordem de execução

1. **Leads** (esta rodada · audit completo · veredito + patch plan)
2. **Agenda** (próximo · só depois de Leads fechar)
3. ... seguindo ordem oficial acima

## Princípios para cada audit

1. **Comparar pelo legacy**, não pelo que v2 "deveria" ter.
2. **Capturar microcopy exato** (placeholders, labels, mensagens) · NÃO paráfrases.
3. **Detalhar fluxo** · "clicou em X → abriu Y → preencheu Z → salvou W → side-effect K".
4. **Classificar status por categoria** (MATCH / PARTIAL / MISSING / WRONG / EXTRA / BLOCKED_BY_DB / DEFERRED_EXTERNAL).
5. **Classificar severidade** (P0 = secretaria não consegue usar / P1 = consegue mas com fricção / P2 = cosmético).
6. **Não mascarar divergência** dizendo que backend existe.
7. **NÃO aplicar patch** sem GO explícito.

## Próximo passo

Aguardar GO explícito após audit de Leads concluído:

**`GO CRM_FUNCTIONAL_1X1_LEADS_PATCH`** → executa patch plan de Leads em 1-3 prompts (UI/layout/cards/filtros · modais/actions/regras · tests/smoke/closeout).

Não avançar para Agenda antes de Leads estar fechado.
