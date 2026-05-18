# 02 · Schedule Modal · 1×1 Audit

> READ-ONLY · doc-only · 2026-05-18 · graph-driven (community 0 legacy / 134 v2)

## Entry points

| Aspecto | Legacy | v2 |
|---------|--------|----|
| Função/rota | `openApptModal(apptId|null)` em `js/agenda-modal.js:95` | Rota `/crm/agenda/novo` · server component `apps/lara/src/app/crm/agenda/novo/page.tsx` → `<NewAppointmentForm/>` em `_form.tsx` |
| Trigger | Botão "+ Nova Consulta" + click em slot vazio | Botão "Novo agendamento" + click em slot vazio `day-view.tsx` |
| Container | Modal DOM-presente (`display:none`) · `modal-system.css` | React `<Modal>` controlado (`packages/ui/src/components/modal.tsx`) · 4-step wizard |
| Draft autosave | `_restoreDraft()` `js/agenda-modal.js:446` · localStorage chave `clinicai_appt_draft` | **AUSENTE** |
| Offline queue | sim · localStorage `clinicai_appointments` + `_saveQueue()` `js/agenda-smart.js:51` | **AUSENTE** (server actions diretos, sem fila offline) |
| Idempotência | sem flag explícita | submit button busy state |

## 1×1 Field Matrix (~31 itens)

> Colunas: **L-path:line · L-behavior · V-path:line · V-behavior · Client val · Server val · Tooltip · Alert · Table/RPC · 1×1 · Gap · Sev · Fix**

| # | Field | Legacy | v2 | Client val | Server val | Tooltip/Alert | Table/RPC | 1×1 | Gap | Sev | Fix |
|---|-------|--------|----|------------|------------|---------------|-----------|-----|-----|-----|-----|
| 01 | **Paciente/Lead (XOR)** | `apptSetTipo()` L569 + select de paciente (`_apptHandleDelegated` L71). Aceita modo "lead" só implicitamente | `_form.tsx:149+` toggle Paciente/Lead radio step 1; usa `patientId` ou `leadId` exclusive | required | CHECK `chk_appt_subject_xor` (mig 62) | toast "Informe paciente ou lead" | `appointments.patient_id`, `lead_id` | ⚠ | legacy aceita "sem subject" pra bloqueado; v2 só `status=bloqueado` | P2 | propagar exception status no v2 |
| 02 | **Tipo Novo/Retorno** | `apptSetTipo()` L569 troca modo · pré-popula procedimentos de retorno | toggle implicit via `procedureMode` ou patientId existente | n/a | n/a | "Trocar para Consulta vai apagar dados de retorno" `agenda-modal.js:581-584` | n/a | ❌ | v2 não tem distinção Novo vs Retorno explícita | P1 | adicionar toggle UI + label |
| 03 | **Profissional** | `getProfessionals()` `js/professionals.js:11` → select dropdown em `agenda-modal.js:120` · auto-select da única opção | `professional-profiles.repository.ts:82-102 listActiveForAgenda` → React select | required | RLS multi-tenant + FK appointments.professional_profile_id | "Profissional ativo & agenda_enabled" | `professional_profiles` | ✅ | parity OK | – | – |
| 04 | **Sala** | Select index-based (`salaIdx`) em `agenda-modal.js:120-129` · auto-link `prof.sala_id` em L1425-1440 | **AUSENTE no form v2** · só `counts.room` no conflict report | n/a | n/a | "Sala não está disponível" só legacy | `clinic_rooms` + `appointments.room_idx` (mig 62 L69) | ❌ | v2 sem seletor de sala | P0 | step 2 ganha select de sala + auto-link |
| 05 | **Data** | input `date` + helper `dateToISO` `api.js:344` | React form `startDate` field · client validator data passada | data passada bloqueia se status agendado | CHECK `chk_appt_end_after_start` indirect | "Não é possível agendar no passado" | `start_at::date` | ✅ | parity OK | – | – |
| 06 | **Hora início** | input `time` `agenda-modal.js:120` · `_horaInicio` | `_form.tsx` timepicker step 2 | required + dentro do expediente | clinic_settings horario_funcionamento (legacy só) | "Fora do expediente" só legacy | `start_at::time` | ⚠ | v2 não consulta `clinic_settings.horario_funcionamento` | P1 | bindar settings.json |
| 07 | **Hora fim** | `apptUpdateEndTime()` L297 · default = inicio+duração | `_form.tsx endTime` | required + end > start | CHECK `chk_appt_end_after_start` (mig 62) | n/a | `end_at::time` | ✅ | parity OK | – | – |
| 08 | **Duração (min)** | derivado de `(fim-inicio)` ou `procedure.duracao_min` ou default 60 | `durationMinutes()` helper `_form.tsx:188-193` derivado de end-start | required | CHECK `chk_appt_duration` (mig 62) | "Duração mínima 15min" só legacy | n/a | ⚠ | v2 não usa `procedure.duracao_min` como default | P1 | bindar default da escolha do proc |
| 09 | **Tipo consulta/procedimento** | radio "Consulta" vs "Procedimento" + `apptSetTipo` L569 | `procedureMode` `canonical|manual` (`__manual__` sentinel) | n/a | n/a | "Consulta ainda não definida" só legacy | `procedure_id` opt + `procedure_name` snapshot | ❌ | v2 não distingue Consulta de Procedimento | P0 | adicionar enum `appointment_type` |
| 10 | **Múltiplos procedimentos** | `apptAddProc()` L815 · `apptRemoveProc()` L897 · `_renderApptProcs()` L1032 · `_apptProcs[]` array · multi-proc warning L910-1000 (1h slot dialog) | **SINGLE só** · `procedure_id` único | required ≥1 (legacy) | – | "O tempo pode nao ser suficiente para todos os procedimentos. Escolha uma opção para continuar:" | n/a | ❌ | regressão crítica | P0 | tabela `appointment_procedure_items` |
| 11 | **Procedimento obrigatório** | se "Procedimento" no tipo, ≥1 proc | só if `__manual__` user digitar | required varies | – | "Selecione um procedimento" | – | ⚠ | parity parcial | P2 | – |
| 12 | **Valor por procedimento** | `_apptProcs[i].valor` (preço auto do catálogo) | só `value` agregado em payment | numeric ≥0 | – | "Valor obrigatório" | – | ❌ | regressão | P0 | per-item value em `appointment_procedure_items` |
| 13 | **Cortesia por procedimento** | `_apptProcs[i].cortesia` + `cortesiaMotivo` | `payment_status='cortesia'` appointment-level + `motivoCortesia` | required if cortesia | Zod refine `appointment.schemas.ts:353-364`+`366-378` | "Informe o motivo da cortesia" | – | ❌ | regressão crítica (audit financeiro) | P0 | per-item flag |
| 14 | **Desconto** | `finDescontoCb` checkbox + `finDescontoVal` por item (em finalize) + scope orçamento legacy | só `orcamentoDiscount` global (somente outcome=orcamento) | numeric ≥0 ≤ preço | – | n/a | – | ❌ | per-item discount ausente | P1 | – |
| 15 | **Retorno (intervalo sessões)** | `_apptProcs[i].retornoTipo` (`avulso|retorno`) + `retornoIntervalo` (dias) · catálogo `procedure.fases` jsonb (mig 700/390) | só `recurrence_*` columns appointment-level (mig 62 + recurrence-section.tsx) | – | CHECK `chk_appt_recurrence_consistency` | "Procedimento de retorno sem intervalo definido" | `clinic_procedimentos.fases` | ⚠ | v2 não mapeia fases | P2 | série de appointments ou novo schema |
| 16 | **Recorrência (série)** | `agenda-modal.recurrence.js` (community 170): `I()` L25, `_apptRecurrenceUpdatePreview()` L104, `apptSaveWithSeries()` L247, `apptCreateNextSessionOnly()` L395 + RPCs mig 700/443, 700/805, 700/811 | `RecurrenceSection` component + appointment.repository `.createSeries()` | required if recurrent | CHECK `chk_appt_recurrence_consistency` (mig 62) + RPC `appt_upsert_recurrence_persist` | "Frequência" tooltip | `recurrence_group_id` + `recurrence_index` + `recurrence_total` (mig 62) | ✅ | parity OK | – | – |
| 17 | **Status inicial** | "agendado" default · `apptTransition()` `js/agenda-smart.js:190` | "agendado" hardcoded em create | n/a | CHECK status enum | – | – | ✅ | parity OK | – | – |
| 18 | **Forma de pagamento** | 10 formas dinâmicas em finalize (pix, dinheiro, débito, crédito à vista/parcelado, parcelado, entrada+saldo, boleto, link, cortesia, convênio) | **NÃO no form de agendamento** (pagamento só em finalize ou patient detail) | – | – | – | – | ⚠ | parity legacy/v2 difere de quando capturar | P1 | – |
| 19 | **Múltiplas formas de pagamento** | `appt.pagamentos[]` array · `apptShowPagamentosBlock` L1343 / `apptRenderPagamentos` L1360 / `apptUpdatePagamentosTotal` L1403 | **AUSENTE** | sum=total | – | "Soma diverge do total" | – | ❌ | regressão | P0 | tabela `appointment_payments` |
| 20 | **Parcelas** | crédito/parcelado/boleto: `n_parcelas` + `data_1o_venc` | – | numeric ≥2 | – | "Informe o 1o vencimento do boleto" | – | ❌ | regressão | P0 | per-payment installments |
| 21 | **Soma pagamentos = total** | `apptSyncPagamentoTotal` L809 valida | – | sum match | – | "Soma diferente do total" | – | ❌ | regressão | P0 | validate na finalize |
| 22 | **Status pagamento** | derivado `pago>=total ? pago : parcial : pendente` (em finalize) | enum `pendente|parcial|pago|cortesia|isento` (mig 152) | required | CHECK enum | "Status 'Pago' mas valor pago e zero" | – | ✅ | parity (v2 + isento) | – | – |
| 23 | **Cortesia/Isento** | só `cortesia` (legacy) | distinção `cortesia` ≠ `isento` (mig 152) | – | Zod | – | – | ✅ | melhor em v2 | – | – |
| 24 | **Motivo cortesia/isento** | `cortesiaMotivo` per-item + agregado | `motivoCortesia` appointment-level (≥3 chars) | Zod refine 353-364 | – | "Registrado no audit · ficará visível no histórico" | – | ⚠ | per-item perdido | P1 | – |
| 25 | **Origem** | input livre `origem` | `origin` campo em lead-side, não appointment | text | – | "Origem do lead" | – | ⚠ | v2 só captura no lead, não no appt | P2 | – |
| 26 | **Indicado por** | input livre | mesmo (lead-side) | text | – | – | – | ⚠ | – | P2 | – |
| 27 | **Confirmação WhatsApp** | switch "Enviar confirmação ao WhatsApp" + auto-send em `scheduleAutomations()` `js/agenda-smart.js:77` + `sendWATemplate()` L827 | toggle `sendConfirmation` provavelmente em config, **não exposto no wizard** | n/a | – | – | `wa_outbox` enqueue | ❌ | UX regressão | P1 | restaurar toggle |
| 28 | **Consentimento (TCLE)** | bloco "Consentimento" no detalhe (legacy + `agenda-smart.finalize.js:265-275`) + `LegalDocumentsService.autoSendForStatus` | painel intra-consulta `_clinical-panel.tsx` + RPC `acceptAppointmentConsentAction` | required pre-finalize (gate) | mig 167 RPC hard gate | "Antes de finalizar, registre o consentimento" | `appointment_clinical_gate_overrides` | ✅ | melhor em v2 (hard gate) | – | – |
| 29 | **Observações** | `appt.obs` textarea livre | `notes` field max 4000 | text | – | – | `appointments.obs` | ✅ | parity OK | – | – |
| 30 | **Draft autosave** | `_restoreDraft()` L446 + listener input → localStorage `clinicai_appt_draft` | **AUSENTE** | n/a | – | – | – | ❌ | regressão UX | P2 | adicionar `useFormPersist` em React form |
| 31 | **Offline queue** | sim · `_saveQueue` L51 + flush ao sync | **AUSENTE** (server-first) | – | – | – | – | ❌ | regressão grave em conexão ruim | P1 | offline-first via SW + IndexedDB |

## Validation messages (verbatim)

### Legacy (`js/agenda-modal.js` + `js/agenda-validation.js`)
- `"Informe paciente ou lead"`
- `"Trocar para Consulta vai apagar dados de retorno"` `agenda-modal.js:581-584`
- `"Profissional já tem consulta no horário"` (via `checkProfConflict` L268-288)
- `"Sala já está ocupada"` (via `checkRoomConflict` L293-310)
- `"Paciente tem outra consulta no mesmo horário"` (via `checkPatientConflict` L318-336)
- `"Procedimento sem valor (marque cortesia ou informe valor)"`
- `"O tempo pode nao ser suficiente para todos os procedimentos. Escolha uma opção para continuar:"` (multi-proc dialog L928)
- `"[Paciente] tem [N] procedimentos ([nomes]) agendados em 1 hora.\nPor favor revise e confirme se o tempo e suficiente."` (createDoubleCheck WA alert L999)
- `"Não é possível agendar no passado"`
- `"Antecedência mínima de X horas"` (de `clinic_settings.antecedencia_min`)

### v2 (`_form.tsx` + `appointment.schemas.ts` + `appointment.actions.ts`)
- `"Subtotal do orçamento obrigatório (>0)"` (`_actions-bar.tsx:851-863`)
- `"Motivo da cortesia obrigatório (mínimo 3 caracteres)"` Zod
- `"value deve ser 0 (ou null) quando paymentStatus=cortesia"` Zod refine 366-378
- `"{N} appointment(s) na mesma sala"` / `"{N} na mesma agenda do profissional"` / `"{N} para esse paciente"` (`_form.tsx:996-997`)
- toasts via `useToast()`

## Helpers / repositories citados pelo grafo

### Legacy (community 0 + 4 + 27)
- `_getAppts()` `agenda-modal.js:34` · fonte da lista
- `_apptHandleDelegated()` `agenda-modal.js:71` · event delegation
- `closeApptModal()` L267
- `apptReagendarConfirm()` L2017 · reagendar
- `deleteAppt()` L1935 · soft delete

### v2 (community 11 + 67)
- `AppointmentRepository` `packages/repositories/src/appointment.repository.ts` métodos canônicos (wiki AppointmentRepository.md): `.create()`, `.update()`, `.cancel()`, `.checkConflicts()`, `.createBlockTime()`, `.getById()`, `.markNoShow()`, `.softDelete()`, `.aggregates()`, `.attend()`, `.changeStatus()`, `.createSeries()`, `.countByStatusInRange()`
- Helpers: `appointmentsOverlap` `helpers/appointment-state.ts:216`, `isAppointmentTransitionAllowed`, `rangesOverlap`, `timeToMinutes`, `isTerminalStatus`

## Gap summary

- Total campos comparados: **31**
- Parity ✅: **12**
- Parity parcial ⚠: **8**
- Regressões v2 ❌: **11**
- P0 (operacional crítico): **8** (sala, tipo Consulta/Proc, multi-proc, valor per-item, cortesia per-item, multi-payment, parcelas, sum-payment)
- P1: **6**
- P2: **6**

## Bottom 10 gaps deste arquivo (ordem severidade)

1. **#10 multi-procedimentos** ausente em v2 (P0)
2. **#12 valor por procedimento** ausente em v2 (P0)
3. **#13 cortesia per-procedimento + motivo** ausente em v2 (P0)
4. **#19 multi-payment** ausente em v2 (P0)
5. **#20 parcelas** ausente em v2 (P0)
6. **#21 soma=total** sem validação em v2 (P0)
7. **#04 seletor de sala** ausente em v2 (P0)
8. **#09 tipo Consulta vs Procedimento** indistinguíveis em v2 (P0)
9. **#02 toggle Novo/Retorno** ausente em v2 (P1)
10. **#27 confirmação WhatsApp toggle no wizard** ausente em v2 (P1)

## Arquivos lidos (read-only)

- Grafo legacy community 0 (`js/agenda-modal.js`) e 170 (`agenda-modal.recurrence.js`) — nodes via `graphify query`
- Grafo legacy community 27 (`js/agenda-smart.js`) e 211 (`js/agenda-validation.js`)
- Grafo v2 community 11 (`appointment.actions.ts`) e 67 (`appointment-state.ts`)
- Wiki `graphify-out/wiki/AppointmentRepository.md` (clinicai-v2)
- Doc anterior `docs/crm-refactor/CRM_DEEP_RULES_VALIDATIONS_GRAPH_AUDIT_2026-05-18.md` (este audit corrige H01-H06)
