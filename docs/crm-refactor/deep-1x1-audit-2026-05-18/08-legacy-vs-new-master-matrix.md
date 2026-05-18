# 08 · Legacy × New Master 1×1 Matrix

> READ-ONLY · doc-only · 2026-05-18

Combina os achados de 02-07 numa matriz mestre única. ~80 linhas de feature/regra com paridade explícita.

## Legenda
- **Parity:** ✅ paridade completa · ⚠ parcial · ❌ regressão · 🆕 novo em v2 sem equivalente legacy
- **Sev:** P0 / P1 / P2 / P3
- **Risco:** B(aixo) / M(édio) / A(lto)

## A. Modal de Agendamento (do `02-schedule-modal-1x1.md`)

| ID | Área | Feature/Regra | Legacy path | Legacy comportamento | v2 path | v2 comportamento | Parity | Gap | Sev | DB? | UI? | RPC? | E2E? | Risco |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M-01 | Agendamento | Paciente/Lead XOR | `agenda-modal.js:95` | toggle implícito | `_form.tsx` step 1 | radio toggle Zod | ✅ | – | – | – | – | – | – | B |
| M-02 | Agendamento | Tipo Novo/Retorno | `agenda-modal.js:569` | apptSetTipo | – | ausente | ❌ | sem toggle | P1 | – | sim | – | – | M |
| M-03 | Agendamento | Profissional select | `professionals.js:11` | getProfessionals cache | `professional-profiles.repository.ts:82` | listActiveForAgenda | ✅ | – | – | – | – | – | – | B |
| M-04 | Agendamento | **Sala select** | `agenda-modal.js:120-129` | salaIdx index | – | **AUSENTE no form** | ❌ | sem seletor | **P0** | sim | sim | – | sim | A |
| M-05 | Agendamento | Data | n/a | date input | `_form.tsx` | startDate field | ✅ | – | – | – | – | – | – | B |
| M-06 | Agendamento | Hora início/fim | `agenda-modal.js:297` apptUpdateEndTime | derivado | `_form.tsx` | timepicker | ✅ | – | – | – | – | – | – | B |
| M-07 | Agendamento | Duração | derivado/proc default | – | duration derived | sem default proc | ⚠ | proc default | P1 | – | sim | – | – | M |
| M-08 | Agendamento | Tipo Consulta vs Procedimento | `agenda-modal.js:569` | apptSetTipo | – | indistinguível | ❌ | **P0** | sim | sim | sim | sim | A |
| M-09 | Agendamento | **Múltiplos procedimentos** | `agenda-modal.js:815-1032` | `_apptProcs[]` array | – | **single só** | ❌ | regressão crítica | **P0** | sim | sim | sim | sim | A |
| M-10 | Agendamento | Valor por procedimento | per-item | – | só value agregado | – | ❌ | per-item | **P0** | sim | sim | sim | sim | A |
| M-11 | Agendamento | Cortesia por procedimento | per-item motivo | – | só appointment-level | – | ❌ | per-item | **P0** | sim | sim | sim | sim | A |
| M-12 | Agendamento | Desconto | `finDescontoCb` per-item + orçamento | – | só `orcamentoDiscount` global | – | ❌ | per-item | P1 | sim | sim | – | – | M |
| M-13 | Agendamento | Retorno per-procedimento | `_apptProcs[].retornoTipo/Intervalo` | catálogo `fases jsonb` | – | só appt-level recurrence | – | ⚠ | mapeamento | P2 | sim | sim | – | – | M |
| M-14 | Agendamento | Recorrência (série) | `agenda-modal.recurrence.js:25-395` | apptSaveWithSeries | `_form.tsx` RecurrenceSection | createSeries | ✅ | – | – | – | – | – | – | B |
| M-15 | Agendamento | Status inicial agendado | n/a | default | n/a | hardcoded | ✅ | – | – | – | – | – | – | B |
| M-16 | Agendamento | Forma pagamento (10) | `agenda-smart.finalize.js` 10 formas | dynamic UI | – | só 5 enum status | – | ❌ | regressão | **P0** | sim | sim | sim | sim | A |
| M-17 | Agendamento | Multi-pagamento | `agenda-modal.js:1343-1403` | `pagamentos[]` | – | single | – | ❌ | regressão | **P0** | sim | sim | sim | sim | A |
| M-18 | Agendamento | Parcelas | per-payment | – | – | ausente | – | ❌ | regressão | **P0** | sim | sim | sim | sim | A |
| M-19 | Agendamento | Soma pagamentos=total | `agenda-modal.js:809` apptSyncPagamentoTotal | valida | – | – | – | ❌ | regressão | **P0** | – | sim | – | sim | A |
| M-20 | Agendamento | Status pagamento (5) | derivado | – | enum 5 valores | mig 152 CHECK | ✅ | – | – | – | – | – | – | B |
| M-21 | Agendamento | Cortesia ≠ Isento | só cortesia | – | distinção (mig 152) | – | 🆕 | melhor v2 | – | – | – | – | – | B |
| M-22 | Agendamento | Motivo cortesia/isento | per-item legacy | – | appt-level Zod ≥3 chars | – | ⚠ | per-item | P1 | – | sim | – | – | M |
| M-23 | Agendamento | Origem/Indicado | input livre | – | só lead-side | – | ⚠ | regressão UX | P2 | – | sim | – | – | B |
| M-24 | Agendamento | Confirmação WA toggle | switch + auto-send `agenda-smart.js:77` | scheduleAutomations | – | ausente no wizard | – | ❌ | regressão UX | P1 | – | sim | sim | sim | M |
| M-25 | Agendamento | Draft autosave | `_restoreDraft` L446 | localStorage | – | ausente | – | ❌ | regressão UX | P2 | – | sim | – | – | M |
| M-26 | Agendamento | Offline queue | `_saveQueue` L51 | localStorage flush | – | ausente | – | ❌ | regressão | P1 | – | sim | – | sim | A |
| M-27 | Agendamento | Observações | textarea | – | notes max 4000 | – | ✅ | – | – | – | – | – | – | B |

## B. Finalização (do `03-finalization-modal-1x1.md`)

| ID | Área | Feature/Regra | Legacy | v2 | Parity | Sev |
|---|---|---|---|---|---|---|
| F-01 | Finalize | Entry button | `openFinalizeModal:22` | `_actions-bar.tsx:198-208` | ✅ | – |
| F-02 | Finalize | Outcomes 4 (paciente, pac_orc, orcamento, nenhum) | radio Bloco 4 | select 3 (paciente, orcamento, paciente_orcamento) | ⚠ | P2 |
| F-03 | Finalize | Outcome "nenhum/apenas finalizar" | sim | **AUSENTE** | ❌ | P2 |
| F-04 | Finalize | Outcome "perdido" | em legacy via outro módulo | bloqueado em finalize · `markLeadLostAction` | 🆕 | – |
| F-05 | Finalize | Hard gate clínico | inexistente | mig 167 RPC + audit table | 🆕 | – ✅ |
| F-06 | Finalize | Override admin (owner) | inexistente | checkbox + motivo ≥5 chars + audit | 🆕 | – ✅ |
| F-07 | Finalize | Side: cashflow | `CashflowService.createFromAppointment` | **AUSENTE** | ❌ | **P0** |
| F-08 | Finalize | Side: queixas | `ComplaintsPanel.saveComplaint` | **AUSENTE** | ❌ | P1 |
| F-09 | Finalize | Side: WA pós-atendimento | `sendWATemplate(id,'pos_atendimento')` | **AUSENTE** | ❌ | **P0** |
| F-10 | Finalize | Side: avaliação Google D+3 | clinic_op_tasks automation | **AUSENTE** | ❌ | **P0** |
| F-11 | Finalize | Side: VPI auto-enroll + close | `VPIEngine.autoEnroll/closeIndication` | **AUSENTE** | ❌ | **P0** |
| F-12 | Finalize | Side: retoques suggestion | `RetoquesEngine.openSuggestionModal` | **AUSENTE** | ❌ | P1 |
| F-13 | Finalize | Side: payment follow-up task | `clinic_op_tasks` (pagamento) | **AUSENTE** | ❌ | **P0** |
| F-14 | Finalize | Side: tags engine | `TagEngine.applyTag` | substituído por `CRM_TAGS.*` invalidação | ⚠ | P1 (perde regras) |
| F-15 | Finalize | Idempotency | flag legacy | RPC idempotent_skip | ✅ | – |
| F-16 | Finalize | Confirm dialog | sim · resumo | submit direto | ⚠ | P3 |
| F-17 | Finalize | Toast outcome-specific | "Finalizado · {nome}" | "Lead promovido..."/"Orçamento criado!" | ✅ | – |
| F-18 | Finalize | Sub-RPC failure handling | tags | `patient_conversion_failed`/`patient_conversion_failed_after_budget`/`budget_creation_failed` | 🆕 | – ✅ |

## C. Profissionais · Procedimentos · Salas (do `04-*.md`)

| ID | Área | Feature | Legacy | v2 | Parity | Sev |
|---|---|---|---|---|---|---|
| D-01 | Prof | CRUD admin | `professionals.js` | repo+actions parciais | ⚠ | P2 |
| D-02 | Prof | listActiveForAgenda | implícito | `repository.ts:82-102` | ✅ | – |
| D-03 | Prof | Auto-link prof→sala | `agenda-modal.js:1425-1440` | **AUSENTE** | ❌ | P1 |
| D-04 | Prof | Férias/blackout | jsonb (a confirmar) | **AUSENTE** | ❌ | P1 |
| D-05 | Proc | Tabela base | mig 541 | mesma | ✅ | – |
| D-06 | Proc | 6 migrations (541, 659, 700/053, 700/107, 700/390, 700/723) | sim | sim (mesmas tabelas) | ✅ | – |
| D-07 | Proc | CRUD admin v2 | repos legacy | só list/get (sem CUD) | ⚠ | P2 |
| D-08 | Proc | Multi-procedure | `_apptProcs[]` | single só | ❌ | **P0** |
| D-09 | Proc | Partner pricing | `procedures_with_partner_pricing(p_lead_id)` | RPC existe, form não usa | ⚠ | P1 |
| D-10 | Proc | Combos | `b2b_voucher_combos` (mig 700/723) | – | ❌ | P3 |
| D-11 | Proc | Fases (jsonb) | mig 700/390 | – | ❌ | P2 |
| D-12 | Proc | Insumos | `procedimento_insumos` | – | ❌ | P3 |
| D-13 | Room | Tabela base | mig 537 | mesma | ✅ | – |
| D-14 | Room | Alexa integration | mig 631 + `alexa-settings.js` | – | ❌ | P3 |
| D-15 | Room | Seletor no form | `agenda-modal.js:120-129` | **AUSENTE** | ❌ | **P0** |
| D-16 | Room | FK room_id uuid | n/a (room_idx int) | mesma (carry-over) | ⚠ | P2 |
| D-17 | Room | Conflict message detalhada | "Conflito de sala: {nome}..." | "{N} appointment(s) na mesma sala" sem nome | ⚠ | P1 |
| D-18 | Room | CRUD admin v2 | `rooms.js` | – | ⚠ | P2 |

## D. Validações (do `05-validations-rules-checks.md`)

| ID | Área | Regra | Legacy | v2 (client/server/DB) | Parity | Sev |
|---|---|---|---|---|---|---|
| V-01 | Validação | Data passada | `agenda-validation.js:176-204` | client+RPC | ✅ | – |
| V-02 | Validação | Hora passada | `validateTime:209-247` | client | ⚠ | P2 |
| V-03 | Validação | Antecedência mínima | clinic_settings | **ausente em v2** | ❌ | P1 |
| V-04 | Validação | Horário expediente | clinic_settings | **ausente em v2** | ❌ | P1 |
| V-05 | Validação | Almoço/blackout | clinic_settings | – | ❌ | P2 |
| V-06 | Validação | Conflito profissional | checkProfConflict | counts + RPC | ✅ | – |
| V-07 | Validação | Conflito sala | checkRoomConflict | parcial (sem seletor) | ⚠ | P0 |
| V-08 | Validação | Conflito paciente | checkPatientConflict | counts + RPC | ✅ | – |
| V-09 | Validação | Back-to-back <60min | sim warning | – | ❌ | P2 |
| V-10 | Validação | Profissional férias | jsonb | – | ❌ | P1 |
| V-11 | Validação | Tipo XOR | implícito | CHECK chk_appt_subject_xor (mig 62) | ✅ | – |
| V-12 | Validação | end > start | implícito | CHECK chk_appt_end_after_start | ✅ | – |
| V-13 | Validação | Duração ≥15min | default | CHECK chk_appt_duration | ✅ | – |
| V-14 | Validação | Recurrence consistency | recurrence.js | CHECK chk_appt_recurrence_consistency | ✅ | – |
| V-15 | Validação | Cancelado motivo obrigatório | implícito | CHECK chk_appt_cancelled_consistency | ✅ | – |
| V-16 | Validação | No-show motivo | implícito | CHECK chk_appt_noshow_consistency | ✅ | – |
| V-17 | Validação | Cortesia motivo ≥3 chars | sim | Zod refine | ✅ (melhor) | – |
| V-18 | Validação | value=0 if cortesia | implícito | Zod refine | ✅ | – |
| V-19 | Validação | Orçamento subtotal/items | – | Zod refine + RPC | 🆕 | – |
| V-20 | Validação | Hard gate clínico | – | mig 167 RPC | 🆕 | – |
| V-21 | Validação | Soft delete | `deleteAppt:1935` | softDelete repo | ✅ | – |
| V-22 | Validação | Phase canon 1C | SdrService | enum + phase_history table | ✅ (melhor) | – |
| V-23 | Validação | Paciente duplicado | search before create | autocomplete | ⚠ | P2 |
| V-24 | Validação | RLS multi-tenant | sempre | sempre | ✅ | – |

## E. UI States (do `06-tooltips-alerts-states.md`)

| ID | Área | Feature | Legacy | v2 | Parity | Sev |
|---|---|---|---|---|---|---|
| U-01 | UI | Empty state | ad-hoc | `<EmptyState/>` luxury | ✅ (melhor) | – |
| U-02 | UI | Loading/Skeleton | sync | `<Skeleton/>` shimmer | ✅ (melhor) | – |
| U-03 | UI | Toast | `_showToast` | `useToast()` + fromResult | ✅ (melhor) | – |
| U-04 | UI | Modal controlado | DOM-presente | React conditional | ✅ (melhor) | – |
| U-05 | UI | Mesa Operacional | sim | **AUSENTE** | ❌ | P1 |
| U-06 | UI | Notification bell | `_renderNotificationBell:1967` | **AUSENTE** | ❌ | P1 |
| U-07 | UI | Day alerts panel | `agenda-day-panel:47` | **AUSENTE** | ❌ | P1 |
| U-08 | UI | Multi-proc warning | dialog L928 | – | ❌ | **P0** |
| U-09 | UI | Draft autosave | `_restoreDraft:446` | – | ❌ | P2 |
| U-10 | UI | Patient tabs (anamnese/histórico/fotos/financeiro) | múltiplas tabs | parcial | ⚠ | P1 |
| U-11 | UI | Conflict message com nome | sim | sem nome | ❌ | P1 |
| U-12 | UI | Hard gate banner | – | `_actions-bar.tsx:966-982` | 🆕 | – |
| U-13 | UI | Override admin UI | – | `_actions-bar.tsx:985-1012` | 🆕 | – |
| U-14 | UI | Confirm cancel motivo required | implícito | obrigatório | ✅ (melhor) | – |
| U-15 | UI | Tooltips em botões action | implicit title | text-only | ⚠ | P3 |
| U-16 | UI | Recovery dry-run | sim | – | ⚠ | P2 |

## F. Drag/Drop + State Machine (do `07-drag-drop-status-machine.md`)

| ID | Área | Feature | Legacy | v2 | Parity | Sev |
|---|---|---|---|---|---|---|
| S-01 | DnD | Drag/Drop existe | sim (`agendaDrop:1144`) | sim (`@dnd-kit`) | ✅ (audit anterior errou) | – |
| S-02 | DnD | Optimistic UI | sim | não | ⚠ | P2 |
| S-03 | DnD | Conflict message | "Conflito com {nome}..." | "Conflito · {subj} já ocupa" | ⚠ | P1 |
| S-04 | DnD | Force override admin | implícito | param sem UI | ⚠ | P3 |
| S-05 | SM | em_consulta zumbi | presente | eliminado | ✅ (corrige) | – |
| S-06 | SM | Self-loops idempotência | – | sim | 🆕 | – |
| S-07 | SM | RPC dedicada `appointment_attend` | implícito | sim | 🆕 | – |
| S-08 | SM | RPC dedicada `appointment_finalize` | implícito | sim | 🆕 | – |
| S-09 | SM | Audit trail status changes | localStorage | tabela RPC | ✅ (melhor) | – |
| S-10 | SM | Terminal states finalizado/cancelado/no_show | sim | sim | ✅ | – |
| S-11 | SM | Bloqueado (time block) | sim | createBlockTime | ✅ | – |

## G. Side modules (cross-cutting)

| ID | Área | Feature | Legacy | v2 | Parity | Sev |
|---|---|---|---|---|---|---|
| X-01 | Orcamento | UI completa items/edit/bulk | `orcamentos.js` | parcial | ⚠ | P1 |
| X-02 | Orcamento | Export CSV | `exportPatientsCsvAction` em pacientes | – | ❌ | P3 |
| X-03 | Perdidos | Module | `js/perdidos*.js` | `markLeadLostAction` + recovery tab | ✅ | – |
| X-04 | Leads | CRUD + lifecycle | sim | sim (Phase 1C) | ✅ (melhor) | – |
| X-05 | Pacientes | CRUD + lifecycle | sim | parcial | ⚠ | P1 |
| X-06 | Mesa Op | Cards injetáveis/retornos/secretaria | sim | – | ❌ | P1 |
| X-07 | Anamnese | Módulo dedicado | `anamnese*.js` | painel intra-consulta | ✅ (melhor) | – |
| X-08 | Consentimento | Manual send + auto | `LegalDocumentsService` | TCLE intra + audit | ✅ (melhor) | – |
| X-09 | Fotos prontuário | upload UI | `prontuario-wow.ui.js` | – | ❌ | P2 |
| X-10 | Financeiro tab no paciente | `cashflow.ui.js` | – | – | ❌ | P2 |
| X-11 | Automation engine | `agenda-automations.engine.js:405` `_executeRule` | parcial em v2 | ⚠ | P1 |
| X-12 | Recovery flow | módulo dedicado | – | em construção | ⚠ | P2 |

## Totais

- **Linhas auditadas**: ~80
- **Parity ✅**: 28
- **Parity ⚠**: 16
- **Regressões ❌**: 25
- **Novos 🆕**: 11

## Top 30 gaps ranked

1. **M-09 Multi-procedimentos** P0
2. **M-10 Valor per-proc** P0
3. **M-11 Cortesia per-proc + motivo** P0
4. **M-04 Sala select** P0
5. **M-16 Forma pagamento (10→5)** P0
6. **M-17 Multi-pagamento** P0
7. **M-18 Parcelas** P0
8. **M-19 Soma=total** P0
9. **M-08 Tipo Consulta×Procedimento** P0
10. **F-07 Cashflow integration** P0
11. **F-09 WA pós-atendimento** P0
12. **F-10 Google review automation** P0
13. **F-11 VPI auto-enroll** P0
14. **F-13 Payment follow-up task** P0
15. **D-15 Sala select v2** P0 (idem M-04)
16. **U-08 Multi-proc warning** P0 (depende M-09)
17. **V-07 Conflito sala** P0 (depende M-04)
18. **D-08 Multi-procedure v2** P0 (idem M-09)
19. **M-02 Tipo Novo/Retorno** P1
20. **M-12 Desconto per-item** P1
21. **M-22 Motivo cortesia per-item** P1
22. **M-24 Confirmação WA toggle wizard** P1
23. **M-26 Offline queue** P1
24. **F-08 Queixas update** P1
25. **F-12 Retoques suggestion** P1
26. **F-14 Tags engine** P1
27. **D-03 Auto-link prof→sala** P1
28. **D-04 Férias profissional** P1
29. **D-09 Partner pricing exposure** P1
30. **D-17 Conflict message com nome** P1
