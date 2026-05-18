# 05 · Validations · Rules · Checks Matrix

> READ-ONLY · doc-only · 2026-05-18 · client + server + DB CHECK

## A. Matriz Mestre

| # | Rule | Legacy (file:line + msg) | v2 client (file:line) | v2 server (file:line + RPC) | DB CHECK/constraint | Parity | Gap | Sev |
|---|------|--------------------------|------------------------|------------------------------|---------------------|--------|-----|-----|
| 01 | **Data passada** | `agenda-validation.js validateRequiredFields` L176-204 + L198-202 SAME_DAY_ONLY_STATUSES não pode ser inicial em data futura | `_form.tsx` startDate validator client | RPC `appt_upsert` valida | — | ✅ | – | – |
| 02 | **Hora passada** | `validateTime()` L209-247 antecedência mínima | `_form.tsx` time validator | – | – | ⚠ | v2 client-only, RPC não bloqueia | P2 |
| 03 | **Antecedência mínima** | `clinic_settings.antecedencia_min` lido + validateTime L209-247 (msg "Antecedência mínima de X horas") | – | – | – | ❌ | v2 não usa clinic_settings | P1 |
| 04 | **Dentro do expediente** | `clinic_settings.horario_funcionamento` jsonb por dia · valida `agenda-validation.js` | – | – | – | ❌ | v2 não bloqueia fora do horário | P1 |
| 05 | **Almoço/períodos bloqueados** | `clinic_settings.almoco_inicio / almoco_fim` | – | – | – | ❌ | v2 ausente | P2 |
| 06 | **Conflito profissional** | `checkProfConflict()` L268-288 msg `"Profissional já tem consulta no horário"` | `_drag-utils.ts detectDropConflict` + `_form.tsx` step 4 `checkAppointmentConflictAction` retorna `counts.professional` | `AppointmentRepository.checkConflicts()` (wiki: 2 conexões) | — | ✅ | mensagem v2 não cita nome do conflitante | P1 |
| 07 | **Conflito sala** | `checkRoomConflict()` L293-310 msg `"Conflito de sala: {nome} já está ocupada — {detalhes}."` | `counts.room` | `AppointmentRepository.checkConflicts()` | — | ⚠ | v2 não tem seletor sala → conflict é informativo só | P0 |
| 08 | **Conflito paciente** | `checkPatientConflict()` L318-336 msg `"Paciente tem outra consulta no mesmo horário"` | `counts.patient` | `AppointmentRepository.checkConflicts()` | — | ✅ | – | – |
| 09 | **Back-to-back gap (<60min)** | `checkPatientBackToBack()` L343+ warning não-bloqueante | – | – | – | ❌ | v2 ausente | P2 |
| 10 | **Profissional férias** | `professional_profiles.ferias` jsonb (legacy) | – | – | – | ❌ | v2 ausente | P1 |
| 11 | **Procedimento obrigatório (tipo=procedimento)** | legacy se "tipo procedimento" exige ≥1 proc | – | – | – | ❌ | v2 não distingue tipo | P1 |
| 12 | **Duração ≥ mínimo** | legacy default 15min | derivado client | CHECK `chk_appt_duration` (mig 62) ENFORÇA `end_at - start_at >= interval '15 minutes'` | mig 62 | ✅ | – | – |
| 13 | **end_at > start_at** | implícito legacy | client | CHECK `chk_appt_end_after_start` (mig 62) | mig 62 | ✅ | – | – |
| 14 | **Status permitido** | STATE_MACHINE constants | `getAppointmentActionFlags()` | RPC `appointment_change_status` + `_appointment_status_transition_allowed()` (mig 72) | enum + CHECK status | ✅ | – | – |
| 15 | **Tipo XOR (lead_id ⊕ patient_id)** | implícito | client toggle | – | **CHECK `chk_appt_subject_xor`** (mig 62 L146-155): `((lead_id IS NOT NULL) <> (patient_id IS NOT NULL)) OR status = 'bloqueado'` | mig 62 | ✅ | – | – |
| 16 | **Recurrence consistency** | apptSaveWithSeries (recurrence.js) | RecurrenceSection form | RPC `appt_upsert_recurrence_persist` (mig 700/805) | **CHECK `chk_appt_recurrence_consistency`** (mig 62 L167-176): if `recurrence_group_id IS NOT NULL` então `recurrence_index ≥ 1 AND recurrence_total ≥ recurrence_index` | mig 62 + 700/443+805+811 | ✅ | – | – |
| 17 | **Payment status enum** | legacy 10 formas | enum 5 status (`pendente/parcial/pago/cortesia/isento`) | – | CHECK payment_status enum (mig 152) | ⚠ | regressão | P0 |
| 18 | **Cancelado consistency** | apptReagendarConfirm L2017 | `cancelAppointmentAction` exige motivo | RPC valida motivo | **CHECK `chk_appt_cancelled_consistency`** (mig 62): if `status='cancelado'` então `cancelled_at IS NOT NULL AND cancelled_reason IS NOT NULL` | mig 62 | ✅ | – | – |
| 19 | **No-show consistency** | _showInlineAlert via legacy | markNoShow exige motivo | RPC valida | **CHECK `chk_appt_noshow_consistency`** (mig 62): if `status='no_show'` então `no_show_at IS NOT NULL AND no_show_reason IS NOT NULL` | mig 62 | ✅ | – | – |
| 20 | **Pagamento obrigatório** | finalize legacy `"Informe o valor total"` L973 | n/a (valor opcional null) | – | – | ❌ | regressão · v2 finaliza sem cobrar | P1 |
| 21 | **Parcelas (boleto/parcelado)** | finalize L990-992 `"Informe o 1o vencimento do boleto"` | – | – | – | ❌ | regressão | P0 |
| 22 | **Soma pagamentos = total** | apptSyncPagamentoTotal L809 valida | – | – | – | ❌ | regressão · v2 não tem multi-pay | P0 |
| 23 | **Cortesia motivo (≥3 chars)** | finalize L975-978 `"Informe o motivo da cortesia"` | Zod refine appointment.schemas.ts L353-364 `"Motivo da cortesia obrigatório (mínimo 3 caracteres)"` | mesma Zod no server action | – | ✅ | melhor em v2 com tamanho mínimo | – |
| 24 | **Cortesia value=0** | implícito | Zod L366-378 `"value deve ser 0 (ou null) quando paymentStatus=cortesia"` | – | – | ✅ | – | – |
| 25 | **Desconto ≤ preço** | finalize por-item `finDescontoCb` | – | – | – | ❌ | regressão (desconto per-item) | P1 |
| 26 | **Retorno intervalo** | finalize L1661 `"Procedimento de retorno sem intervalo definido"` | – | – | – | ❌ | regressão | P2 |
| 27 | **Bloqueado (time block)** | suporta `status=bloqueado` | suporta `createBlockTime()` (`AppointmentRepository.createBlockTime`) | – | CHECK XOR bypass para bloqueado | ✅ | – | – |
| 28 | **Finalizado travado** | `apptTransition` L190 bloqueia transição saindo de finalizado | `isTerminalStatus()` helper · STATE_MACHINE entrada vazia | RPC retorna `idempotent_skip` ou erro | mig 72 transitionRules vazias para finalizado | ✅ | – | – |
| 29 | **Archive/Reactivate (paciente)** | tags + lifecycle | `lifecycle_status='arquivado'` enum (Phase 1C) | RPC `patient_archive`/`patient_reactivate` | enum lifecycle_status | ✅ | – | – |
| 30 | **Phase canon (Phase 1C)** | SdrService.changePhase manual | enum `phase ∈ {lead, agendado, paciente, orcamento}` + `lifecycle_status ∈ {ativo, perdido, recuperacao, arquivado}` | RPC `lead_to_paciente`/`lead_to_orcamento`/`lead_lost` + `phase_history` tabela | enum + trigger phase_history | ✅ | melhor em v2 (canônico ADR-028) | – |
| 31 | **Soft delete (deleted_at)** | `deleteAppt` L1935 | `AppointmentRepository.softDelete()` | RPC | column `deleted_at timestamptz` | ✅ | – | – |
| 32 | **Perdido (lead_lost separado)** | `js/perdidos*.js` módulo | `markLeadLostAction` no `_actions-bar.tsx:265-275` | RPC dedicado `lead_lost` · BLOQUEADO em `appointment_finalize` | – | ✅ | melhor em v2 (separação outcome) | – |
| 33 | **Consentimento required pre-finalize** | bloco legacy + LegalDocumentsService | gate query `appointment_clinical_gate_status` | **RPC `appointment_finalize`** retorna `clinical_gate_required` se `consent.signed=false ∧ !override` | tabela `appointment_clinical_gate_overrides` audit | ✅ | novo em v2 (mig 167) | – |
| 34 | **Anamnese complete pre-finalize** | módulo separado | gate query | mesma RPC mig 167 valida `anamnesis.status='complete'` | – | ✅ | novo em v2 | – |
| 35 | **Orçamento subtotal/items obrigatórios** | n/a (finalize sem orçamento estruturado) | Zod L320-336 `"orcamentoItems (>=1) + orcamentoSubtotal obrigatorios quando outcome=orcamento ou paciente_orcamento"` | RPC `appointment_finalize` valida | – | ✅ | novo em v2 | – |
| 36 | **Orçamento discount ≥ 0** | – | – | RPC `invalid_orcamento_discount` (mig 167 L127-150) | – | ✅ | – | – |
| 37 | **Paciente duplicado** | legacy busca por phone/email antes de criar | `_form.tsx` patient picker autocompleta | RPC `lead_to_paciente` checa lead existente | UNIQUE(phone, clinic_id) parcial | ⚠ | v2 não impede duplicate explicit | P2 |
| 38 | **RLS multi-tenant** | sempre `clinic_id = app_clinic_id()` | mesmo | RLS em todas tabelas (appointments, leads, patients, orcamentos, professional_profiles, clinic_procedimentos, clinic_rooms) | RLS policy per table | ✅ | – | – |
| 39 | **Override admin clinical** | n/a | `_actions-bar.tsx:985-1012` checkbox + reason ≥5 chars | RPC mig 167 valida `is_admin() ∧ override_reason.length ≥ 5` | tabela audit `appointment_clinical_gate_overrides` | ✅ | novo em v2 | – |
| 40 | **Idempotency finalize** | `_finalizingInProgress` flag legacy | `isFinalizing` busy state | RPC mig 167 L169-176 retorna `idempotent_skip: true` se já finalizada | – | ✅ | melhor em v2 | – |
| 41 | **Outcome enum válido** | radio buttons | select | RPC mig 167 L94-100 retorna `invalid_outcome` | enum check | ✅ | – | – |
| 42 | **Status para finalize** | `agenda-validation.js:409` lista permitida | `canFinalize` flag | RPC L181-188 `invalid_status_for_finalize` | – | ✅ | – | – |
| 43 | **Lead required for outcome=perdido** | legacy permitia | bloqueado em finalize | RPC L198-204 `lost_requires_lead` | – | ✅ | – | – |
| 44 | **Lead required for orcamento** | legacy permitia patient-only | – | RPC L207-211 `cannot_create_budget_without_lead` | – | ✅ | melhor em v2 | – |
| 45 | **Sub-RPC failure handling** | tags via tag engine | – | RPC retorna `patient_conversion_failed` / `budget_creation_failed` / `patient_conversion_failed_after_budget` (atomic-ish) | – | ✅ | melhor em v2 | – |

## B. CHECK constraints v2 (verbatim from mig 62)

```sql
-- appointments table key constraints
chk_appt_subject_xor: ((lead_id IS NOT NULL) <> (patient_id IS NOT NULL)) OR status = 'bloqueado'
chk_appt_end_after_start: end_at > start_at
chk_appt_duration: end_at - start_at >= interval '15 minutes'
chk_appt_recurrence_consistency: (recurrence_group_id IS NULL)
  OR (recurrence_index >= 1 AND recurrence_total >= recurrence_index)
chk_appt_cancelled_consistency: status <> 'cancelado'
  OR (cancelled_at IS NOT NULL AND cancelled_reason IS NOT NULL)
chk_appt_noshow_consistency: status <> 'no_show'
  OR (no_show_at IS NOT NULL AND no_show_reason IS NOT NULL)
chk_appt_payment_status: payment_status IN ('pendente','parcial','pago','cortesia','isento')  -- mig 152
```

## C. Resumo

- Total rules auditadas: **45**
- Parity ✅: **26**
- Parity parcial ⚠: **4**
- Regressões ❌: **15**
- P0: **5** (sala, payment 10 formas, parcelas, soma, multi-pay sem ela isso colapsa)
- P1: **6** (antecedência, expediente, férias, conf message com nome, valor obrigatório, desconto per-item)
- P2: **3** (back-to-back, retorno intervalo, paciente duplicate)
- Outros: **1** (P3 almoço)

## D. Bottom 10 gaps de validação

1. **#06/07 conflict message** sem nome do conflitante (P1)
2. **#03 antecedência mínima** não usada em v2 (P1)
3. **#04 horário funcionamento** não validado em v2 (P1)
4. **#10 férias profissional** ausente em v2 (P1)
5. **#17 payment enum** simplificação demais (P0)
6. **#20 valor finalize obrigatório** removido (P1)
7. **#21 parcelas obrigatórias** removidas (P0)
8. **#22 soma=total** removido (P0)
9. **#25 desconto per-item** removido (P1)
10. **#37 paciente duplicado** sem block explícito em v2 (P2)

## Arquivos referenciados

- Grafo legacy: agenda-validation.js (211), agenda-modal.js (0), agenda-smart.js (27), agenda-smart.finalize.js (57), api.js (4/16)
- Grafo v2: appointment.schemas.ts, appointment.actions.ts (11), appointment-state.ts (67)
- Migs: 62, 72, 151, 152, 167, 182, 700/443, 700/805, 700/811
