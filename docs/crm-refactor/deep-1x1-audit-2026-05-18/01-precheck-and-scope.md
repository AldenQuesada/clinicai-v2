# 01 · Precheck and Scope

> CRM_AUDIT_1X1_FULL_RESET_MULTI_AGENT · READ-ONLY · doc-only · 2026-05-18

## 0.1 Repo state (precheck)

| Repo | Branch | HEAD | Working tree |
|------|--------|------|--------------|
| `clinicai-v2` | `main` | `2b157f9` | clean save por `apps/lara/test-results/`, `docs/crm-refactor/CRM_DEEP_RULES_VALIDATIONS_GRAPH_AUDIT_2026-05-18.md` e seu HTML (todos sem track) |
| `clinic-dashboard` | `master` | `d991418` | clean save por arquivos de telemetria/graphify-out · `supabase/.temp/cli-latest` `M` (cli versionado pelo Supabase, não nosso) |

Dirty tree = não-funcional · zero código tocado por este audit.

## 0.2 Graph corpus consultado (ANTES de qualquer Read)

| Repo | Path do grafo | Nodes | Wiki pages | Communities relevantes |
|------|---------------|-------|------------|------------------------|
| clinicai-v2 | `graphify-out/` (build_graph.py, wiki/, cache/) | ~1 917 | 378+ | 11 (CRM actions), 67 (appointment-state helpers), 75 (pacientes actions), 134 (agenda calendars), 152 (legacy repos copiados em apps/lara/public/legacy) |
| clinic-dashboard | `graphify-out/` (graph.html, graph.json, wiki/) | ~10 191 | 200+ | 0 (agenda-modal), 4/16 (api.js core), 27/30 (agenda-smart), 57/79 (finalize), 96 (procedimentos mig), 126/146/149 (rooms), 211 (validation), 279 (day-panel), 366 (professionals) |

Comando-base usado: `graphify query "<consulta>"` a partir da raiz de cada repo. Aplicado nas 8 consultas dirigidas registradas na sessão (NewAppointmentForm/wizard · finalize/outcomes · STATE_MACHINE/drag-drop · procedures · rooms · professionals · UI states/toasts · notificações).

## 0.3 Wiki entrypoints

### clinicai-v2 (`graphify-out/wiki/`)
- `AppointmentRepository.md`, `AppointmentRepository_2.md` (entrypoint canônico do repo `packages/repositories/src/appointment.repository.ts`)
- `AskDoctorModal.tsx.md`, `AudioPlayer.tsx.md`, `AgentPauseSection.tsx.md`
- centenas de `B2B*.md` (irrelevantes para CRM core neste audit)

### clinic-dashboard (`graphify-out/wiki/`)
- `20260413000000_appointments.md` (mig canônica appointments)
- `20260408000000_agenda_multi_pro.md` (multi-profissional)
- `20260410000000_clinic_settings.md` (clinic settings)
- `20260412000000_medical_records.md`
- `20260328000000_anamnesis_module.md` (+ `_2`)
- `20260403000000_anamnesis_hardening_p2.md`
- `20260507000000_sdr_budgets.md` (orçamentos)
- `20260510000000_sdr_phase_triggers.md` (phase/lifecycle)
- `20260518000000_sdr_rules_engine.md`
- `20260534000000_rls_specialist_compartment.md` (RLS multi-tenant)

## 0.4 Scope desta auditoria

### Inclui (READ-ONLY · sem patch · sem migration · sem commit · sem deploy)
1. **Modal de agendamento** (novo/editar consulta) · legacy `agenda-modal.js` + recurrence + validation · v2 `apps/lara/src/app/crm/agenda/novo/_form.tsx` + components
2. **Modal de finalização** · legacy `agenda-smart.finalize.js` + `agenda-finalize.js` · v2 `apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx` + `_clinical-panel.tsx` + `appointment.actions.ts`
3. **Origem dos dados** · profissionais / procedimentos / salas (tabelas + RPCs + repositories + UI)
4. **Validações, regras, checks** · ambos lados (client + server + DB CHECK)
5. **Tooltips, alertas, estados** · matriz por tela
6. **Drag/drop** + state machine de status
7. **RPCs e migrations** · todas que tocam agenda/finalize/lead/orcamento/paciente
8. **Plano de correção** em 4 prompts

### Não inclui
- Mira / B2B / LP Builder / Magazine / Marca / Flipbook / Anatomy Quiz / VPI (audit dedicado fora deste escopo)
- Performance / observability / pipeline de deploy
- Configurações/usuários/permissões (módulo paralelo)

## 0.5 Hipóteses revistas vs. audit anterior

| # | Audit anterior afirmou | Realidade (após grafo) | Correção |
|---|------------------------|------------------------|----------|
| H01 | Legacy não tem drag/drop | Legacy TEM drag/drop: `agendaDrop()` `js/api.js:1144`, `_applyDrag()` `js/api.js:1208`, `showDragConfirm()` `js/api.js:1173` | Atualizar Fase 7 |
| H02 | Legacy finalize linha 942 | Linha real `confirmFinalize() js/agenda-smart.finalize.js:911` (community 57) | Reajustar referências |
| H03 | Legacy não tem recurrence | `js/agenda-modal.recurrence.js` (community 170): `apptSaveWithSeries()` L247, `apptCreateNextSessionOnly()` L395 | Adicionar à Fase 2 |
| H04 | v2 não tem auto-link prof→sala | A confirmar via Read focado em `_form.tsx` (não pude confirmar via grafo apenas) | Anotar TODO no item correspondente |
| H05 | Migrations de procedimentos = 3 | Grafo mostra 6 migrations (541, 659, 700/053, 700/107, 700/390, 700/723) | Atualizar lineage |
| H06 | Alexa = "nice-to-have" só rooms | Existe mig dedicada `20260631000000_alexa_integration.sql` + `js/alexa-settings.js` + `js/services/alexa-notification.service.js notifyArrival()` L99 | Re-classificar |

## 0.6 Inventário · rotas CRM v2 (`apps/lara/src/app/crm/`)

- `agenda/page.tsx` · listagem geral
- `agenda/novo/_form.tsx` + `_components/*` · wizard de criação
- `agenda/[id]/page.tsx` + `_actions-bar.tsx` + `_clinical-panel.tsx` · detalhe + finalize
- `agenda/_components/day-view.tsx` · day view com @dnd-kit
- `agenda/_components/week-calendar.tsx` · week view com @dnd-kit
- `agenda/_components/_drag-utils.ts` · helpers de drag (`normalizeHms` L45, `detectDropConflict`)
- `_actions/appointment.actions.ts` (community 11) · finalizeAppointmentAction, dragDropAppointmentAction L437, cancelAppointmentAction, checkAppointmentConflictAction
- `_actions/orcamento.actions.ts` (community 11) · softDeleteOrcamentoAction L236, etc.
- `_actions/lead.actions.ts`, `_actions/patient.actions.ts`, `_actions/clinical.actions.ts`
- `_schemas/appointment.schemas.ts` · Zod schemas (FinalizeAppointmentSchema, etc.)
- `pacientes/page.tsx`, `pacientes/[id]/page.tsx`, `pacientes/_actions.ts`
- `leads/`, `orcamentos/`, `perdidos/`

## 0.7 Inventário · arquivos legacy equivalentes (clinic-dashboard `js/`)

- `agenda-modal.js` (community 0 · 2 200 LOC · master modal)
- `agenda-modal.detail.js` (community 80 · detail view)
- `agenda-modal.recurrence.js` (community 170 · recurrence helper)
- `agenda-validation.js` (community 211 · `showValidationErrors` L570)
- `agenda-smart.js` (community 27 · transitions + automations · `apptTransition` L190, `smartTransition` L865, `scheduleAutomations` L77)
- `agenda-smart.constants.js` (STATE_MACHINE, STATUS_LABELS, STATUS_COLORS)
- `agenda-smart.finalize.js` (community 57 · 1 394 LOC · finalize modal)
- `agenda-finalize.js` (bridges: `quickFinish`, `openFinishModal`, `closeFinishModal`, `confirmFinishAppt`)
- `agenda-day-panel.js` (community 279 · `renderDayAlerts` L47, `openFinalizarDiaModal` L255)
- `agenda-overview.js` (community 8 · `loadAgendaOverview` L705)
- `agenda-notifications.js` (community 257 · `_renderNotificationBell` L71)
- `agenda-hours-quickedit.js` (community 494)
- `agenda-automations.engine.js` (community 10 · `_executeRule` L405)
- `api.js` (community 4/16 · master API; `_showToast` L1934, `agendaDrop` L1144, `_applyDrag` L1208, `showDragConfirm` L1173, `_renderNotificationBell` L1967, `_confirmFinalizar` L1876, `openFinalizarModal` L1783)
- `procedimentos.js` (community 11 · `procDelete` L1867, seeds)
- `rooms.js` (community 126 · `getRooms` L12, `confirmDelete` L227)
- `professionals.js` (community 60/259/366 · `getProfessionals` L11, `openProfModal` L216, `saveProfessional` L489)
- `clinic-settings.js` (community 14)
- `alexa-settings.js` (community 170)
- `repositories/procedimentos.repository.js`
- `repositories/rooms.repository.js`
- `services/legal-documents.service.js` (`sendManualConsent` L541)
- `services/alexa-notification.service.js` (community 225 · `notifyArrival` L99)
- `utils/modal.js` (community 82/164/188 · `confirm` L165, `alert` L157)

## 0.8 RPCs e migrations no escopo

### Migrations legacy
| File | Função |
|------|--------|
| `20260413000000_appointments.sql` | tabela base appointments |
| `20260408000000_agenda_multi_pro.sql` | multi-profissional |
| `20260410000000_clinic_settings.sql` | settings da clínica (antecedencia_min, horarios) |
| `20260412000000_medical_records.sql` | prontuário |
| `20260537000000_clinic_rooms.sql` | salas |
| `20260541000000_clinic_procedimentos.sql` | procedimentos + RPCs `get_procedimentos`, `upsert_procedimento`, `soft_delete_procedimento`, `procedimento_insumos`, 4 RLS policies |
| `20260631000000_alexa_integration.sql` | alexa device_name por sala |
| `20260659000000_procedimentos_full_fields.sql` | preço_promo, custo, margem, combo_* |
| `20260700000053_vpi_partner_pricing.sql` | partner pricing por lead · RPC `procedures_with_partner_pricing` · função `vpi_is_active_partner` |
| `20260700000107_proc_intervalo_sessoes.sql` | intervalo entre sessões |
| `20260700000390_procedimentos_fases.sql` | fases jsonb |
| `20260700000723_b2b_voucher_combos.sql` | combos B2B (`b2b_voucher_combo_upsert`, `b2b_voucher_combos_list`) |
| `20260507000000_sdr_budgets.sql` | orçamentos (SDR Phase 1C canônico) |
| `20260510000000_sdr_phase_triggers.sql` | phase/lifecycle triggers |
| `20260518000000_sdr_rules_engine.sql` | regras automações |

### Migrations v2 (`clinicai-v2/db/migrations/`)
| File | Função |
|------|--------|
| `20260800000062_*appointments*.sql` | tabela appointments v2 com CHECK constraints (`chk_appt_subject_xor`, `chk_appt_end_after_start`, `chk_appt_duration`, `chk_appt_recurrence_consistency`, `chk_appt_cancelled_consistency`, `chk_appt_noshow_consistency`) |
| `20260800000072_*appointment_change_status*.sql` | RPC + `_appointment_status_transition_allowed()` |
| `20260800000151_*appointment_finalize_lost_outcome*.sql` | RPC `appointment_finalize` |
| `20260800000152_*appt_payment_status*.sql` | enum payment_status |
| `20260800000167_*hard_gate_clinical_finalization*.sql` | hard gate clínico + tabela `appointment_clinical_gate_overrides` |
| `20260800000182_*appointment_procedure_fk*.sql` | FK opcional `procedure_id` |
| `20260800000186_*lead_pipeline_positions*.sql` (referência) | pipeline positions |

### RPCs auditadas
| RPC | Tipo | Arquivo |
|-----|------|---------|
| `appointment_finalize` | mutation outcome | mig 151+167 |
| `appointment_attend` | transition agendado→na_clinica | mig série |
| `appointment_change_status` | transição genérica | mig 72 |
| `lead_to_paciente` | sub-call (SDR canon) | mig série |
| `lead_to_orcamento` | sub-call | mig série |
| `lead_lost` | dedicated RPC para "perdido" | mig série |
| `appointment_clinical_gate_status` | gate query | mig 167 |
| `get_procedimentos` | listar procedimentos legacy | mig 541 |
| `procedures_with_partner_pricing` | partner price | mig 700/053 |
| `_appointment_status_transition_allowed` (immutable inline) | guard transições | mig 72 |
| `get_rooms` / `upsert_room` / `soft_delete_room` | rooms admin | mig 537 |

## 0.9 Helpers de status / drag-drop
- `packages/repositories/src/helpers/appointment-state.ts` (community 67): `APPOINTMENT_STATE_MACHINE`, `getAppointmentActionFlags`, `appointmentsOverlap` L216
- `apps/lara/src/app/crm/agenda/_components/_drag-utils.ts` (community 134): `normalizeHms` L45, `detectDropConflict`, `parseSlotId`, `DRAGGABLE_STATUSES`
- Legacy: `agenda-smart.constants.js` STATE_MACHINE + `agenda-validation.js` checkProfConflict/checkRoomConflict/checkPatientConflict (linhas 268-336)

## 0.10 Confirmações negativas (até este checkpoint)
- Zero código alterado
- Zero migration aplicada
- Zero deploy
- Zero cron tocado
- Zero edge function
- Zero WhatsApp / provider
- Zero env / secrets exposto
- Zero commit
- Zero branch nova

Próximos arquivos do audit (escritos em sequência): `02-schedule-modal-1x1.md` → `10-four-prompt-correction-plan.md`.
