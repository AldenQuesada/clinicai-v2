# 03 · Finalization Modal · 1×1 Audit

> READ-ONLY · doc-only · 2026-05-18 · graph-driven (community 57 legacy / 11 v2 · mig 151+167)

## Entry points

| Aspecto | Legacy | v2 |
|---------|--------|----|
| Função principal | `openFinalizeModal(id)` `js/agenda-smart.finalize.js:22` | Botão "Finalizar consulta" `_actions-bar.tsx:198-208` → `<FinalizeWizard>` modal lines 338-353 |
| Bridges | `quickFinish(id)` `js/agenda-finalize.js:20`, `openFinishModal(id)` L32, `closeFinishModal()` L36, `confirmFinishAppt()` `js/api.js:2264` | — |
| Builder | `_buildFinModal()` L104 (DOM render) | React component tree (`_actions-bar.tsx` + `_clinical-panel.tsx`) |
| Idempotência | `_finalizingInProgress` flag auto-reset 3s + check "já finalizada" → `"Esta consulta ja foi finalizada anteriormente."` | RPC `appointment_finalize` retorna `idempotent_skip: true` (mig 167 L169-176) |
| Pré-condição status | `{na_clinica, em_consulta, aguardando, confirmado, agendado}` (`agenda-validation.js:409`) | `canFinalize = status === 'na_clinica' || status === 'em_atendimento'` (`appointment-state.ts:121`) |

## Outcome Matrix (4 + 3)

### Legacy (4 outcomes via radio "Bloco 4")

| Outcome | Trigger | Side effects |
|---------|---------|--------------|
| **paciente** | radio `value=paciente` | `appt.status='finalizado'`; `SdrService.changePhase(pacienteId,'paciente','finalizacao')` L1257; `TagEngine.applyTag` `consulta_realizada` + `procedimento_realizado` (se procs) L1269-1270; auto-WA pós (`sendWATemplate(id,'pos_atendimento')`); auto-Google review D+3; `VPIEngine.autoEnroll` + `closeIndication`; `RetoquesEngine.openSuggestionModal`; `_enviarConsentimento(...,'pagamento')` se forma in `[boleto,parcelado,entrada_saldo]`; `clinic_op_tasks` (pagamento) se saldo>0 |
| **pac_orcamento** | radio `value=pac_orcamento` | Mesma do paciente +`TagEngine.applyTag` `orcamento_aberto` L1276 |
| **orcamento** | radio `value=orcamento` | `SdrService.changePhase(pacienteId,'orcamento','finalizacao')` L1259; `TagEngine.applyTag` `orc_em_aberto` L1282 |
| **nenhum** (apenas finalizar) | radio `value=nenhum` default | Sem phase change · sem tag · só `status=finalizado` |

### v2 (3 outcomes via select)

| Outcome | Trigger | Side effects (RPC + invalidações) |
|---------|---------|------------------------------------|
| **paciente** | select `outcome=paciente` | RPC `lead_to_paciente(p_lead_id, p_total_revenue, p_first_at, p_last_at, p_notes)`; invalida tags `appointments`+`leads`+`patients`+`phaseHistory`; `appointment.status='finalizado'` |
| **orcamento** | select `outcome=orcamento` | RPC `lead_to_orcamento(p_lead_id, p_subtotal, p_discount, p_items, p_notes)`; invalida `appointments`+`leads`+`orcamentos` |
| **paciente_orcamento** | select `outcome=paciente_orcamento` | Sequencial: `lead_to_orcamento` PRIMEIRO → `lead_to_paciente` DEPOIS; se patient falha após budget criado → `patient_conversion_failed_after_budget` (orcamento permanece) |
| **(perdido bloqueado)** | – | `appointment.actions.ts:489-501` PATCH_0C_FINALIZE_BACKEND_GUARD bloqueia. Mensagem: `"appointment_finalize nao aceita perdido · use markLeadLostAction (lead_lost RPC)"` |
| **(cancelado / no_show)** | botões dedicados (não finalize) | `cancelAppointmentAction` exige motivo (CHECK `chk_appt_cancelled_consistency` mig 62); `markNoShow` exige motivo (CHECK `chk_appt_noshow_consistency`) |

### Comparação outcome × outcome

| Legacy → v2 | Mapping | Status | Gap |
|-------------|---------|--------|-----|
| paciente | paciente | ✅ |  — |
| pac_orcamento | paciente_orcamento | ✅ |  — |
| orcamento | orcamento | ✅ |  — |
| nenhum | (n/a) | ❌ | v2 elimina rota "apenas finalizar"; impossível finalizar sem promover algum estado · P2 |
| (legacy perdido em `js/perdidos*.js`) | `markLeadLostAction` separado | ✅ |  — |

## Validation Matrix (verbatim)

| # | Validação | Legacy code+msg | v2 code+msg | Parity |
|---|-----------|-----------------|-------------|--------|
| 01 | Valor obrigatório | `agenda-smart.finalize.js:973` if `forma≠cortesia ∧ valor≤0` → `"Informe o valor total"` | n/a (valor opcional · default null) | ⚠ |
| 02 | Status pago mas valor zero | L974 `"Status 'Pago' mas valor pago e zero"` | n/a explicit; cortesia força value=0 (Zod L366-378) | ⚠ |
| 03 | Cortesia motivo | L975-978 `"Informe o motivo da cortesia"` | Zod L353-364 `"Motivo da cortesia obrigatório (mínimo 3 caracteres)"` · refine `motivoCortesia.length ≥ 3` | ✅ (melhor em v2 com tamanho mínimo) |
| 04 | Convênio nome | L979-981 `"Informe o nome do convenio"` | n/a (sem campo convênio em v2 finalize) | ❌ |
| 05 | Entrada+saldo | L982-986 `"Informe o valor da entrada"` + `"Informe o vencimento do saldo"` | n/a (sem entrada+saldo em v2) | ❌ |
| 06 | Boleto 1º venc | L990-992 `"Informe o 1o vencimento do boleto"` | n/a | ❌ |
| 07 | Routing obrigatório | L993-994 `"Selecione o proximo estado do paciente (Bloco 4)"` | enforced via select required | ✅ |
| 08 | Avaliação paga | `agenda-validation.js:1050-1064` `"Avaliação paga exige valor definido."` / `"Avaliação paga: registre o pagamento (parcial ou total) antes de finalizar."` | n/a (sem distinção paga/cortesia em consulta) | ❌ |
| 09 | Já finalizada | L956 `"Esta consulta ja foi finalizada anteriormente."` | RPC retorna `idempotent_skip: true` (sem msg user-facing) | ✅ (silent idempotent) |
| 10 | Proc zero não-cortesia | L1074-1088 `"Os procedimentos a seguir estão com valor R$ 0,00 e não estão marcados como cortesia: ${nomes}${extra}. Ajuste o valor ou marque cortesia antes de finalizar."` (P2.3D.1) | n/a (sem per-proc value) | ❌ |
| 11 | Orcamento subtotal | n/a | `_actions-bar.tsx:851-863` `"Subtotal do orçamento obrigatório (>0)"` | ✅ novo em v2 |
| 12 | Orcamento items | n/a | Zod L320-336 `"orcamentoItems (>=1) + orcamentoSubtotal obrigatorios quando outcome=orcamento ou paciente_orcamento"` | ✅ |
| 13 | Clinical override reason | n/a | Zod L337-351 `"clinicalOverrideReason obrigatorio (min 5 chars) quando clinicalOverride=true"` | ✅ novo em v2 |
| 14 | Outcome inválido | n/a | RPC mig 167 L94-100 retorna `{ok:false, error:'invalid_outcome'}` | ✅ |
| 15 | Status invalid for finalize | – | RPC L181-188 `{ok:false, error:'invalid_status_for_finalize', hint:'Chame appointment_attend antes...'}` | ✅ |
| 16 | Lost requires lead | – | RPC L198-204 `{error:'lost_requires_lead'}` | ✅ |
| 17 | Budget without lead | – | RPC L207-211 `{error:'cannot_create_budget_without_lead'}` | ✅ |
| 18 | Hard gate clínico | n/a | RPC mig 167 L213-222 `{error:'clinical_gate_required', hint:'Preencha anamnese e registre consentimento OU finalize com override admin + motivo'}` | ✅ novo |
| 19 | Override perm denied | n/a | RPC `override_permission_denied` (só owner/admin) | ✅ novo |
| 20 | Patient conv failed | n/a | RPC `patient_conversion_failed` / `patient_conversion_failed_after_budget` / `budget_creation_failed` | ✅ |

## Side Effects Matrix

| Side effect | Legacy | v2 | Status |
|-------------|--------|----|--------|
| `appointment.status='finalizado'` | sim (`apptFinal.status=finalizado` L1140) | sim (RPC) | ✅ |
| Phase do lead/paciente | `SdrService.changePhase()` manual | RPC sub-call (`lead_to_paciente`/`lead_to_orcamento`) | ✅ (melhor em v2 atômico) |
| Cashflow (financeiro) | `CashflowService.createFromAppointment()` se pago>0 (L1183) | **AUSENTE** | ❌ regressão P0 |
| Queixas update | `ComplaintsPanel.saveComplaint(...)` (L1191-1212) | **AUSENTE** | ❌ regressão P1 |
| Documentos legais | `LegalDocumentsService.autoSendForStatus('na_clinica',...)` (L1214-1227) | substituído por `acceptAppointmentConsentAction` intra-consulta | ✅ ported (melhor) |
| Tags engine | `TagEngine.applyTag()` (consulta_realizada / procedimento_realizado / orcamento_aberto / orc_em_aberto) | Substituído por invalidação Next.js `CRM_TAGS.{appointments|leads|patients|orcamentos|phaseHistory}` | ⚠ (perde regras automation) |
| VPI auto-enroll | `VPIEngine.autoEnroll()` se `finVPIEnroll` checked + `closeIndication` sempre | **AUSENTE** | ❌ regressão P0 |
| Retoques suggestion | `RetoquesEngine.openSuggestionModal()` async | **AUSENTE** | ❌ regressão P1 |
| Avaliação Google | `clinic_op_tasks` + automation `d_plus_3` | **AUSENTE** | ❌ regressão P0 |
| WA pós-atendimento | `sendWATemplate(id, 'pos_atendimento')` se `finWAPos` | **AUSENTE** (nenhum trigger em v2 finalize) | ❌ regressão P0 |
| Payment follow-up task | `clinic_op_tasks` (pagamento) se forma ∈ `[boleto,parcelado,entrada_saldo,link]` ∧ saldo>0 (L1295-1319) | **AUSENTE** | ❌ regressão P0 |
| Audit trail | `historicoAlteracoes` em localStorage | tabela `appointment_clinical_gate_overrides` + invalidação tags | ✅ (melhor em v2) |
| Status history | `historicoStatus` em appt JSON | enum mig + RPC `appointment_change_status` registra | ✅ |
| Phase history | implícito em SdrService | tabela `phase_history` dedicada (Phase 1C canon) | ✅ |
| Duplicate prevention | `_finalizingInProgress` flag | RPC idempotency + `isFinalizing` button state | ✅ |

## Hard Gate Clínico (mig 167)

- RPC `appointment_clinical_gate_status(p_appointment_id)` retorna:
  - `anamnesis.status` ∈ `{none, draft, complete, archived}`
  - `consent.signed` boolean
  - `gate_status` `ok|warning` (ok = anamnese complete + consent signed)
- Bloqueio (L213-222): `gate_status='warning' ∧ !p_clinical_override` → `{ok:false, error:'clinical_gate_required', gate, hint}`
- Override válido (L213-251): `p_clinical_override=true ∧ is_admin() ∧ override_reason.length≥5` → insert em `appointment_clinical_gate_overrides` (`clinic_id`, `appointment_id`, `actor_id`, `outcome`, `reason`, `gate_status_prev`, `gate_details`, `created_at`)
- UI banner (`_actions-bar.tsx:966-982`): `"Finalização bloqueada · gate clínico: [Anamnese {status} (precisa estar completa)], [Consentimento informado não registrado]. Preencha pelo painel clínico acima OU use override admin abaixo (somente owner/admin)."`
- Override checkbox (L985-1012): `"Finalizar mesmo assim (override admin): ciente que anamnese e/ou consentimento estão pendentes · justificativa obrigatória abaixo (mín. 5 caracteres) · ficará registrada no audit trail."`
- Permission denied (L1015-1018): `"Você não tem permissão para override (somente owner/admin). Preencha anamnese + consentimento pelo painel clínico para liberar a finalização."`

## Anamnesis + Consent UI

- Anamnese painel `_clinical-panel.tsx`:
  - 4 estados (Anamnese L64-69): `none="Não preenchida"`, `draft="Em rascunho"`, `complete="Completa"`, `archived="Arquivada"`
  - Botões: `"Preencher anamnese"` / `"Editar anamnese"` (L385-390): `"Salvar rascunho"` / `"Salvar e marcar completa"` · busy: `"Salvando…"`
- Consent modal L408-527:
  - Template TCLE v1.0 (Procedimentos Estéticos) text L467-477
  - Campos: `signerName` (2-200 chars), `accepted` checkbox
  - Button (L518): `"Registrar consentimento"` → busy `"Registrando…"`; if signed: `"Fechar"`
  - Read-only state L480-483: `"✓ Já registrado para este appointment · termo {version}."`
- Action: `acceptAppointmentConsentAction()` (`clinical.actions.ts:143-199`)

## Confirm dialog + Toasts

### Legacy confirm (`agenda-smart.finalize.js:1002-1010`)
```
Tem certeza que quer finalizar a consulta de *${nomePac}*?

Procedimentos: ${procs.join(', ') || 'nenhum'}
Valor: R$ ${fmtBRL(valor)}
Pagamento: ${forma || '—'}
Destino: ${routeLabel}
```

### Toasts

| Origem | Mensagem verbatim |
|--------|------------------|
| legacy success | `"Finalizado", "${pacienteNome} finalizado com sucesso", "success"` (L1343) |
| legacy info (consent recente) | `"Ja enviado", "Consentimento enviado recentemente (aguarde 10min pra reenviar)", "info"` (L492-494) |
| v2 paciente | `"Lead promovido a paciente!"` |
| v2 orcamento | `"Orçamento criado!"` |
| v2 paciente_orcamento | `"Lead virou paciente E orçamento criado!"` |
| v2 partial fail | `"Consulta finalizada · mas conversão '{outcome}' falhou. Verifique manualmente."` |
| v2 default | `"Consulta finalizada"` |

### Banners

- Avaliação Paga warning (legacy L225): `"Avaliacao Paga — confirme o pagamento antes de finalizar"` (yellow bg `#FEF3C7`)
- Consulta em aberto alert (legacy L681-684): `"Cobrar consulta antes de finalizar"` + `"Consulta paga em aberto: R$ ${fmtBRL(consultaAberta)}. Adicione um procedimento para descontar ou registre o pagamento abaixo."`
- Cortesia hint (legacy L554-555): `"Cortesia: procedimento registrado, mas so vira Paciente quando pagar."`
- Balance info (legacy L873-875): `"Saldo: ${fmtBRL(tot-pag)}"` (red) / `"Pagamento completo"` (green)
- v2 payment pending banner (`_actions-bar.tsx:1024-1064`): `"Pagamento {pendente|parcial} · confirme a cobrança antes de finalizar a consulta. Você pode: Atualizar o status do pagamento abaixo (Pago / Cortesia / Isento), ou Marcar o checkbox abaixo confirmando que a cobrança foi feita por outro canal (Pix, link Asaas, máquina, etc)."`
- v2 lead-lost banner (`_actions-bar.tsx:686-694`): `"Atenção: 'perdido' é um status comercial (lifecycle), não clínico. Isto move o lead para a aba de Recuperação e remove da fila ativa do CRM. Histórico, anamnese e consentimento permanecem intactos."`
- v2 outcome hint (L1083-1091): `"Sem lead vinculado · finalizar só fecha o appointment."` / `"Lead perdido? Use a ação dedicada no card do lead · não nasce de finalização de consulta."`

## Gap summary

- Outcomes: 4 legacy → 3 v2 (perde "nenhum")
- Validações: ~12 legacy → ~9 v2 (perde 5 legacy de pagamento detalhado, ganha 4 novas: hard gate + override + orcamento subtotal/items)
- Side effects: 14 legacy → 5 v2 (perde 9: cashflow, queixas, VPI enroll, retoques, Google review, WA pós, payment task, tags engine, daily summary)
- Parity ✅ por aspecto: 7
- Regressões críticas P0: **6** (cashflow, VPI, Google review, WA pós, payment task, "nenhum" outcome)
- Regressões P1: **3** (queixas, retoques, motivo per-item)

## Top 12 gaps do finalize

1. **Side · WA pós-atendimento** removido (P0)
2. **Side · VPI auto-enroll** removido (P0)
3. **Side · Google review automation** removido (P0)
4. **Side · Cashflow integration** removido (P0)
5. **Side · clinic_op_tasks payment follow-up** removido (P0)
6. **Side · RetoquesEngine suggestion** removido (P1)
7. **Side · ComplaintsPanel update** removido (P1)
8. **Outcome · "nenhum/apenas finalizar"** removido (P2)
9. **Pagamento · 10 formas → 5 status** simplificação demais (P0 cruzando com modal-agendamento)
10. **Cortesia · per-item** perdido (P0 cruzando)
11. **Validação · Avaliação paga** removida (P1)
12. **Validação · convênio/entrada-saldo/boleto** removidas (P0 cruzando)

## Arquivos analisados

- Grafo legacy community 57 (agenda-smart.finalize.js · 1394 LOC)
- Grafo legacy community 79 (mira repo · não usado)
- Grafo legacy community 4 (api.js helpers · `confirmFinishAppt` L2264, `openFinishModal` L2162, `openFinalizarModal` L1783, `_confirmFinalizar` L1876, `_skipFinalizar` L1919)
- Grafo v2 community 11 (`appointment.actions.ts`, `clinical.actions.ts`)
- Grafo v2 community 67 (`appointment-state.ts`)
- Migs: `20260800000151_appointment_finalize_lost_outcome.sql`, `20260800000167_hard_gate_clinical_finalization.sql`
- Audit anterior `CRM_DEEP_RULES_VALIDATIONS_GRAPH_AUDIT_2026-05-18.md`
