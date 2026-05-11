# 05 · Journey Map

> Matriz das jornadas operacionais que envolvem o CRM. Estado atual + recomendações.
>
> Para cada jornada: actor · trigger · estado inicial · estado final · tabelas tocadas · efeitos colaterais · travas atuais · travas faltantes · risco.

---

## Convenções

- `phase` se refere a `public.leads.phase`.
- `status` se refere a `public.appointments.status`.
- `lifecycle` se refere a `lifecycle_status` (ainda não existente · contrato alvo).
- ❌ = trava ausente · ⚠️ = trava parcial · ✅ = trava presente.

---

## J1 · Novo lead entra (WhatsApp inbound)

| Campo | Valor |
|---|---|
| Actor | Sistema (webhook) |
| Trigger | POST inbound em `/api/webhook/whatsapp` ou `whatsapp-evolution` |
| Phase antes | (não existe) |
| Phase depois | `lead` |
| Lifecycle | `ativo` (alvo) |
| Tabelas escritas | `leads` (INSERT via `lead_create` RPC) · `wa_conversations` (upsert) · `wa_messages` (INSERT) |
| Efeitos colaterais | Smart Reply / Copilot cache invalidation · notificação inbound · `phase_history` (origin=`webhook`) |
| Travas atuais | ✅ Idempotência por (clinic_id, phone) na RPC |
| Travas faltantes | Nenhuma |
| Recomendação | Adicionar `event_log` row para `lead.created` |
| Risco | Baixo |

---

## J2 · Lead recebe mensagem (já existe)

| Campo | Valor |
|---|---|
| Actor | Sistema |
| Trigger | Inbound em conv existente |
| Phase antes | qualquer |
| Phase depois | inalterada |
| Tabelas escritas | `wa_messages`, `wa_conversations` (preview, unread_count) |
| Travas atuais | ✅ Não muda phase |
| Risco | Baixo |
| Eventos derivados | `message.inbound_unread` (alerta UI) |

---

## J3 · Lead é qualificado (humano/IA marca temperatura)

| Campo | Valor |
|---|---|
| Actor | Atendente / IA |
| Tela | `/leads/[id]` ou `/conversas` |
| Phase antes/depois | inalterada |
| Lifecycle | inalterado |
| Tabelas | `leads.temperature` UPDATE · `phase_history` (origin=`manual_override`) |
| Travas | ✅ Repo · ⚠️ legacy JS usa `tags` array em vez de coluna |
| Recomendação | Consolidar em `leads.temperature` direto; deprecate tags |
| Risco | Baixo |

---

## J4 · Lead é agendado (SDR cria appointment)

| Campo | Valor |
|---|---|
| Actor | Atendente |
| Tela | `/leads/[id]` ou agenda · ou via Mira chat |
| RPC | `lead_to_appointment(lead_id, scheduled_date, ...)` |
| Phase antes | `lead` |
| Phase depois | `agendado` |
| Tabelas | `appointments` INSERT · `leads` UPDATE phase · `phase_history` |
| Travas atuais | ✅ Matriz `lead → agendado` permitida · ✅ SELECT FOR UPDATE evita race |
| Eventos | `appointment.scheduled` |
| Mensagens | Mira envia confirmação automática (configurável) |
| Risco | Baixo |

---

## J5 · Agendamento aguarda confirmação

| Campo | Valor |
|---|---|
| Actor | Sistema (cron) |
| Trigger | Mira automation envia confirmação 1d antes |
| Status antes/depois | `agendado → aguardando_confirmacao → confirmado` |
| Phase | inalterada (`agendado`) |
| Lifecycle | `ativo` |
| Travas atuais | ⚠️ NÃO há `_appointment_status_transition_allowed` · status mudado direto |
| Eventos | `appointment.confirmation_pending`, `appointment.confirmed` |

---

## J6 · Agendamento confirmado

Idem J5 · status final `confirmado`. Lifecycle preservado. Trigger pode mandar mensagem de boas-vindas.

---

## J7 · Paciente chegou na clínica

| Campo | Valor |
|---|---|
| Actor | Recepção |
| Tela | `/crm/agenda` ou app secretaria |
| RPC | `appointment_attend(appt_id)` |
| Status antes | `confirmado/aguardando/agendado` |
| Status depois | `na_clinica` |
| Phase | mantém `agendado` (ALVO) · ATUAL transiciona para `compareceu` |
| Lifecycle | `ativo` |
| Travas atuais | ✅ Idempotente · ✅ valida não cancelado/no_show/bloqueado |
| Eventos | `appointment.checked_in` |
| Recomendação | **No alvo, NÃO movimentar phase para `compareceu` (esse phase é deletado)** |

---

## J8 · Atendimento iniciado

| Campo | Valor |
|---|---|
| Actor | Profissional |
| RPC | (futuro) `appointment_change_status(appt_id, 'em_atendimento')` · hoje direct UPDATE |
| Status antes/depois | `na_clinica → em_atendimento` |
| Phase | mantém `agendado` (alvo) |
| Travas | ❌ matriz ausente |
| Eventos | `appointment.in_progress` |

---

## J9 · Atendimento finalizado como **paciente** (fez procedimento)

| Campo | Valor |
|---|---|
| Actor | Recepção / profissional |
| RPC | `appointment_finalize(appt_id, outcome='paciente', value, payment_status, ...)` |
| Status appt | → `finalizado` |
| Phase antes | `compareceu` (atual) / `agendado` (alvo) |
| Phase depois | `paciente` |
| Tabelas | `appointments` UPDATE · `leads` soft-delete (atual) ou UPDATE phase (alvo) · `patients` INSERT (atual) ou só UPDATE em `leads` (alvo) · `phase_history` · `phase_updated_at` |
| Travas atuais | ✅ matriz · ✅ outcome ∈ enum |
| Eventos | `appointment.finalized`, `lead.became_patient` |
| **Decisão alvo** | Manter modelo excludente OU mover para single-table com `phase='paciente'`? **Decisão humana pendente** |

---

## J10 · Atendimento finalizado como **orcamento**

Idem J9 · outcome=`orcamento` · cria row em `orcamentos`. No alvo: lead fica com `phase='orcamento'`.

---

## J11 · Atendimento finalizado como **paciente+orcamento**

| Campo | Valor |
|---|---|
| Actor | Recepção |
| RPC | `appointment_finalize(appt_id, outcome='paciente_orcamento', ...)` · NÃO EXISTE como outcome (atual) |
| Phase depois | `paciente` |
| Mesa derivada | `paciente_orcamento` (via `crm_operational_view` no alvo) |
| Travas | ❌ não há outcome dedicado · hoje requer 2 chamadas (`lead_to_paciente` + `lead_to_orcamento`) |
| Recomendação | Adicionar outcome `paciente_orcamento` na RPC e criar orçamento associado ao novo `patient_id` |

---

## J12 · Agendamento cancelado

| Campo | Valor |
|---|---|
| Actor | Recepção / paciente (via WA) |
| Hoje | `appointment.repository.cancel()` UPDATE direto |
| Status | `* → cancelado` |
| Phase | mantida (ALVO) · pode disparar reversão para `lead` se for o único appt (trigger atual) |
| Travas | ❌ matriz ausente · cancelado de finalizado é proibido mas não validado |
| Eventos | `appointment.cancelled` · pode encadear `lead_lost` se humano confirma |
| Recomendação | RPC `appointment_cancel(appt_id, reason)` dedicada · matriz transição |

---

## J13 · Agendamento remarcado

| Campo | Valor |
|---|---|
| Hoje | UPDATE direto · ou cria novo + cancela velho (comportamento incerto) |
| Status | `* → remarcado` |
| Phase | atualmente `agendado → reagendado` (atual) · ALVO mantém `agendado` |
| Risco | Comportamento ambíguo · documentar |

---

## J14 · No-show

| Campo | Valor |
|---|---|
| Trigger | Recepção marca depois de X minutos do horário · ou cron monitora |
| RPC | `appointment.repository.markNoShow()` UPDATE direto |
| Status | `* → no_show` |
| Phase | mantida (ALVO) · ⚠️ hoje pode disparar reversão |
| Lifecycle | mantém `ativo` (ALVO) · humano decide depois se vira `perdido` |
| Eventos | `appointment.no_show` · alerta para SDR |

---

## J15 · Lead ativo vira **perdido**

| Campo | Valor |
|---|---|
| Actor | Atendente |
| RPC | `lead_lost(lead_id, reason)` |
| Phase antes | `lead/agendado/compareceu/orcamento` |
| Phase depois | (atual) `perdido` · (ALVO) mantém phase original |
| Lifecycle antes/depois | (alvo) `ativo → perdido` |
| Tabelas | `leads` UPDATE · `phase_history` (origin=`rpc`, reason obrigatório) |
| Travas | ✅ reason obrigatório · ✅ idempotente · ✅ matriz |
| Eventos | `lead.lost` |
| Diff atual vs alvo | Atual muda phase; alvo só muda lifecycle. **RPC precisa de v2.** |

---

## J16 · Agendado ativo vira **perdido**

Idem J15 com phase original = `agendado`.

---

## J17 · Paciente ativo vira **perdido**

⚠️ **DECISÃO HUMANA:** paciente pode virar perdido? Hoje sim (matriz permite). Alvo: provavelmente arquivado ou inativo, não perdido. Discutir.

---

## J18 · Orçamento ativo vira **perdido**

| Campo | Valor |
|---|---|
| Trigger | Orçamento recusado |
| RPC | `markOrcamentoLostAction` · UPDATE `orcamentos.status='lost'` |
| Lead phase | mantém `orcamento` (atual) ou pode passar `lead_lost(reason)` |
| Lifecycle (alvo) | `perdido` (se humano decidir) |
| Risco | Duplicação · orçamento.status=lost + lifecycle pendente |

---

## J19 · Perdido entra em **recuperação**

| Campo | Valor |
|---|---|
| Actor | SDR |
| RPC alvo | `lead_recovery_activate(lead_id, reason)` · **NÃO EXISTE** |
| RPC hoje | `perdido_to_lead(lead_id)` (legado) · ou `sdr_change_phase` para uma das fases permitidas |
| Lifecycle | `perdido → recuperacao` |
| Phase | mantida |
| Travas | ⚠️ hoje altera phase de volta · alvo mantém |
| Eventos | `lead.recovery_started` |
| Recomendação | Criar RPC `lead_recovery_activate` |

---

## J20 · Recuperação volta para ativo

Igual a J19 mas lifecycle `recuperacao → ativo`. RPC dedicada também ausente. Decisão humana.

---

## J21 · Paciente cria **orçamento adicional**

| Campo | Valor |
|---|---|
| Actor | Recepção / profissional |
| Hoje | INSERT direto em `orcamentos` com `patient_id` (não lead_id) |
| Phase | mantém `paciente` |
| Mesa derivada | `paciente_orcamento` (alvo) |
| Eventos | `patient.budget_added` |
| Travas | ✅ XOR (`subject_xor`) impede lead_id+patient_id juntos |

---

## J22 · Orçamento é **enviado**

| Hoje | `markOrcamentoSentAction` · UPDATE status=sent |
| Eventos | `lead.budget_open` (timer começa a contar para stale) |

## J23 · Orçamento fica **parado**

| Trigger | Cron `orcamento-followup` 1x/dia · pick top 10 stale (≥7d sem update) |
| Ação | INSERT `wa_outbox` + UPDATE `last_followup_at` |
| Risco | Templates hardcoded · sem A/B · sem delivery tracking |

## J24 · Orçamento **aprovado**

| RPC | `markOrcamentoApprovedAction` |
| Phase | (alvo) `orcamento → paciente` · ou stays paciente se já era |
| Eventos | `lead.budget_accepted` |

## J25 · Orçamento **recusado**

Idem J18.

---

## J26 · Lead é **arquivado**

| Actor | Atendente |
| RPC alvo | `lead_archive(lead_id, reason)` · **NÃO EXISTE** |
| Lifecycle | `ativo/perdido → arquivado` |
| Phase | mantida |
| Eventos | `lead.archived` |
| Decisão | Conjuntos onde arquivado é permitido (paciente ativo?) — humano. |

## J27 · Lead é **excluído de verdade**

| Actor | Owner/admin |
| RPC | (alvo) `lead_hard_delete` ou DELETE direto via admin |
| Hoje | `softDeleteLeadAction` (sem hard-delete UI) |
| Tabelas | `leads.deleted_at = now()` (atual) ou DELETE (alvo se permitido) |
| Constraints | RLS DELETE só admin |

---

## J28 · Mensagem WhatsApp atualiza preview/conversa

| Trigger | Webhook |
| Tabelas | `wa_messages` INSERT · `wa_conversations` UPDATE preview, unread_count |
| Phase | inalterada |

## J29 · Smart Reply / Copilot lê contexto CRM

| Componente | `/api/conversations/[id]/copilot` |
| Lê | `lead.phase`, `lead.patient_id`, `conversation.ai_copilot` cache |
| **Gap** | NÃO lê `orcamento` ativo · risco de sugestões contraditórias |

## J30 · Secretaria filtra filas operacionais

| View | `wa_conversations_operational_view` (DB) |
| Hook | `useSecretariaKpis()` refetch 30s |
| Risco | stale se webhook falhar atualizar `operational_owner` |

## J31 · SDR filtra filas operacionais

Hoje no clinic-dashboard legacy via `localStorage.clinicai_sdr_config`. **Risco P0.**
Alvo: server-side filters sobre `crm_operational_view`.

## J32 · Dashboard calcula KPIs

Hoje: `/crm/page.tsx` chama `count` em 4 repos. Alvo: `crm_operational_view` agrega.

## J33 · Alertas são criados/removidos

Estado atual: dispersos · `agenda_alerts_log` provável · sem catálogo central. Alvo: `crm_event_catalog` + `crm_events_log`.

## J34 · Notificações são criadas/removidas

`inbox_notification` (referência encontrada no Evolution webhook) · catálogo não consolidado.

## J35 · Kanban move card (drag-drop)

Hoje: só na agenda (`week-calendar.tsx`). Leads kanban segue no clinic-dashboard legacy.
Alvo: portar leads kanban para Next.js · drag-drop chama `sdr_change_phase` RPC.

## J36 · Bulk change de fase

RPC `leads_bulk_change_phase` existe em **legado** (mig 623) mas **NÃO foi re-aplicada na v2**. Gap.

## J37 · Filtros por mesa operacional

Hoje: filtros básicos em `/leads` por phase/funnel/temperature. **Sem mesa derivada.**

## J38 · Paciente_orcamento aparece na UI

Hoje: paciente + orçamento → duas linhas em tabelas separadas. Alvo: mesa derivada na view.

## J39 · Perdido aparece na UI

Hoje: filtro `phase=perdido` em `/leads`. Alvo: filtro `lifecycle_status=perdido` (ortogonal).

## J40 · Arquivado aparece na UI

**Não existe hoje** (lifecycle `arquivado` não implementado). Gap inteiro.

---

## Matriz consolidada (riscos)

| # | Jornada | Risco | Trava faltante | Prioridade |
|---|---|---|---|---|
| J7-J11 | Fluxo de comparecimento + finalização | Médio | matriz appointment.status | P1 |
| J12-J14 | Cancelar / no-show / remarcado | Médio | matriz · idempotency | P1 |
| J15-J18 | Perda | Baixo (RPC robusta) · alvo precisa refactor | RPC `lead_lost` separa phase de lifecycle | P0 (alvo) |
| J19-J20 | Recuperação | Médio | RPC nova `lead_recovery_activate` | P0 (alvo) |
| J21 | Paciente + orçamento adicional | Baixo | Mesa derivada faltante | P2 |
| J26-J27 | Arquivar / hard-delete | Alto (não existe) | Lifecycle `arquivado` | P1 |
| J29 | Copilot contexto CRM | Médio | Orcamento context faltante | P2 |
| J31 | SDR filas | Alto (legacy localStorage) | Server-side via view | P0 |
| J33-J34 | Alertas / notificações | Alto (sem catálogo) | `crm_event_catalog` | P1 |
| J35 | Kanban leads drag | Alto (não portado) | UI Next.js | P1 |
| J36 | Bulk change | Médio | RPC v2 | P2 |
| J37-J40 | Filtros / mesas / arquivados | Alto (sem view) | `crm_operational_view` | P0 |

---

## Conclusão da matriz

- **5 jornadas P0** dependem de criar `crm_operational_view` + `lifecycle_status` + RPCs `lead_recovery_activate`/`lead_archive`.
- **6 jornadas P1** dependem de matriz `_appointment_status_transition_allowed` + portar leads kanban + catálogo de alertas.
- **3 jornadas P2** são melhorias incrementais (mesa derivada, bulk RPC v2, copilot context).

Sem `crm_operational_view`, qualquer evolução de UI vai re-computar lógica no frontend → débito que se acumula.
