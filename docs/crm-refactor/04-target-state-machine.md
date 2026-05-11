# 04 · State Machine ALVO (Enterprise CRM v2)

> Status: **PROPOSTA · derivada do prompt-contrato do Alden (2026-05-10)**
> Versão alvo: **v2 enterprise** · sucessora do CRM_CORE_FLOW.md (v1, 2026-04-28)
> Migrations ainda NÃO escritas · este doc define o destino, não o estado atual.

---

## 1 · Princípios não-negociáveis

1. **Banco é a fonte da verdade.** Frontend só consome views/RPCs oficiais. Não infere estado crítico, não inventa status, não decide transição.
2. **Macrofase é excludente.** `public.leads.phase` aceita apenas 4 valores. `perdido`, `compareceu`, `reagendado`, `pre_consulta`, `em_consulta`, `attending`, `converted` **não são phase**.
3. **Lifecycle é ortogonal.** `public.leads.lifecycle_status` separa o ciclo de vida (ativo / perdido / recuperação / arquivado) da macrofase do funil. Perda nunca muda phase · só muda lifecycle.
4. **`deleted_at` é exclusão real.** Nunca usado para esconder lead em transição de funil. Lead movido para `paciente` continua em `leads` (mesma linha, mesma `id`) com `phase='paciente'` · não soft-delete.
5. **Agenda é independente.** `appointments.status` tem máquina própria. Não substitui phase. Mapeamento entre agenda e CRM é unidirecional (agenda → phase via RPC controlada).
6. **`crm_operational_view` é a verdade operacional.** Frontend consome essa view, não os bruto. Ela define `mesa_operacional`, `responsavel_atual`, `next_action_at`, `sla_state`.
7. **`phase_history` é audit imutável.** Toda transição registra origem, ator, motivo. INSERT-only para `authenticated`.

---

## 2 · `leads.phase` (4 valores · excludente)

| Phase | Definição |
|---|---|
| `lead` | Pessoa entrou em contato · ainda não agendou. Estado inicial. |
| `agendado` | Tem appointment futuro ou em andamento. Inclui reagendamentos (loop em `appointments.status`). |
| `paciente` | Saiu de consulta tendo feito procedimento. Pode ter orçamento adicional (`mesa_operacional='paciente_orcamento'`). |
| `orcamento` | Saiu de consulta com orçamento aberto, sem procedimento fechado. |

**Removidos do enum:** `reagendado` `compareceu` `pre_consulta` `em_consulta` `attending` `converted` `perdido`.

Esses estados vivem em outras dimensões (vide §3 e §4).

---

## 3 · `leads.lifecycle_status` (4 valores · ortogonal a phase)

| Lifecycle | Definição |
|---|---|
| `ativo` | Está em operação normal. |
| `perdido` | Saiu do funil. Phase preservada em `lost_from_phase`. |
| `recuperacao` | Foi perdido, mas voltou a receber comunicação ativa. Phase preservada. |
| `arquivado` | Tirado da operação ativa por decisão humana (não-perda, ex: lead duplicado, faleceu, mudou de cidade). Phase preservada. |

**Regras:**
- Qualquer macrofase pode virar `perdido` → `recuperacao` → `ativo` → `perdido` (loop).
- `arquivado` é terminal (só desarquivar volta para `ativo`).
- `lifecycle_status NUNCA substitui phase`. UI mostra ambos.
- `lost_from_phase` guarda valor de `phase` no momento da perda (audit).
- `lost_reason` obrigatório quando `lifecycle_status='perdido'`.
- `lost_at` obrigatório quando `lifecycle_status='perdido'`.

---

## 4 · `appointments.status` (11 valores · máquina própria)

| Status | Etapa |
|---|---|
| `agendado` | Marcado, sem confirmação ainda. |
| `aguardando_confirmacao` | Confirmação ativa enviada, aguardando resposta. |
| `confirmado` | Paciente confirmou (humano ou bot). |
| `aguardando` | Dia da consulta, paciente ainda não chegou. |
| `na_clinica` | Check-in. |
| `em_atendimento` | Procedimento/consulta em curso. |
| `finalizado` | Atendimento concluído. Outcome obrigatório (paciente / orcamento / paciente_orcamento). |
| `remarcado` | Data foi alterada (gera novo appointment ou atualiza existente · TBD). |
| `cancelado` | Não vai acontecer. |
| `no_show` | Não compareceu. |
| `bloqueado` | Slot bloqueado (não é appointment de paciente · operacional). |

**Removidos do enum CHECK atual:** `pre_consulta` `em_consulta` (consolidados em `em_atendimento`).

**Transições proibidas (matriz):**
- `cancelado / no_show / finalizado` → terminal (não voltam para vivo).
- `bloqueado` é isolado · não interage com leads.

---

## 5 · Mapeamento `appointments.status` → CRM

Movimento de phase do lead é **DERIVADO** de eventos de agenda via RPC controlada.

| Evento | Phase resultante | Lifecycle resultante |
|---|---|---|
| Novo `appointment` criado (lead → agendado) | `agendado` | preserva `ativo` |
| `appointment.status` → `confirmado/aguardando/na_clinica/em_atendimento` | mantém `agendado` | preserva |
| `appointment.status` → `cancelado` | mantém phase atual | sem mudança automática (decisão humana via `lead_lost` se for perda) |
| `appointment.status` → `no_show` | mantém phase atual | dispara alerta · humano decide `lead_lost` |
| `appointment_finalize(outcome='paciente')` | `paciente` | preserva |
| `appointment_finalize(outcome='orcamento')` | `orcamento` | preserva |
| `appointment_finalize(outcome='paciente_orcamento')` | `paciente` + tag `orcamento_aberto` (ou mesa derivada) | preserva |
| Último appointment ativo deletado | volta para `lead` (se vinha de `agendado`) | preserva |

**Regra de ouro:** `appointment_finalize` NÃO pode produzir `perdido` · perda é exclusivamente via `lead_lost(reason)`.

---

## 6 · `crm_operational_view` (read model canônico)

View materializada (ou regular, TBD) que projeta cada lead com:

```sql
SELECT
  l.id,
  l.clinic_id,
  l.name,
  l.phone,
  l.phase,
  l.lifecycle_status,
  l.lost_from_phase,
  l.lost_reason,
  l.lost_at,
  l.created_at,
  l.updated_at,
  -- derivações operacionais
  CASE
    WHEN l.lifecycle_status = 'perdido' THEN 'perdido'
    WHEN l.lifecycle_status = 'recuperacao' THEN 'recuperacao'
    WHEN l.lifecycle_status = 'arquivado' THEN 'arquivado'
    WHEN l.phase = 'paciente' AND EXISTS(orcamento aberto) THEN 'paciente_orcamento'
    ELSE l.phase
  END AS mesa_operacional,
  -- agregados da agenda
  next_appointment_at,
  last_appointment_at,
  appointment_status_active,
  -- agregados de orçamento
  orcamento_aberto_id,
  orcamento_valor,
  -- responsável
  responsavel_atual_user_id,
  -- SLA
  next_action_at,
  sla_state,  -- 'on_track' | 'warning' | 'overdue'
  -- mensagens
  last_inbound_at,
  unread_count,
  -- conversation
  primary_conv_id
FROM public.leads l
LEFT JOIN ...
WHERE l.deleted_at IS NULL;
```

**Frontend consome esta view** para Kanban, mesas operacionais, cards, contadores. Filtros aplicados sobre `mesa_operacional` e `lifecycle_status`.

**Decisão humana necessária:**
- View regular vs MATERIALIZED (refresh cadenciado)?
- Se materialized: cron de refresh? trigger de invalidação?

---

## 7 · RPCs canônicas (assinatura alvo)

### CRM core
- `lead_create(...)` — única entrada de lead (não muda)
- `sdr_change_phase(p_lead_id uuid, p_to_phase text, p_reason text)` — apenas para transições permitidas pela matriz
- `leads_bulk_change_phase(p_lead_ids uuid[], p_to_phase text, p_reason text)` — bulk com mesma matriz
- `_lead_phase_transition_allowed(p_from text, p_to text) → boolean IMMUTABLE` — matriz centralizada
- `_sdr_record_phase_change(...)` — internal · escreve em `phase_history`

### Perda / recuperação
- `lead_lost(p_lead_id uuid, p_reason text)` — única forma de marcar perda. Define `lifecycle_status='perdido'`, preenche `lost_from_phase` `lost_at` `lost_reason`. **Não muda phase.**
- `perdido_to_lead(p_lead_id uuid, p_reason text)` — DEPRECIA · substituir por `lead_recovery_activate`
- `lead_recovery_activate(p_lead_id uuid, p_reason text)` — passa para `lifecycle_status='recuperacao'`. Mantém phase.
- `lead_archive(p_lead_id uuid, p_reason text)` — `lifecycle_status='arquivado'`.
- `lead_unarchive(p_lead_id uuid)` — `lifecycle_status='ativo'`.

### Agenda
- `appointment_change_status(p_appt_id uuid, p_to_status text)` — usa matriz interna `_appointment_status_transition_allowed`
- `appointment_attend(p_appt_id uuid)` — atalho `→ em_atendimento` (estado em sala)
- `appointment_finalize(p_appt_id uuid, p_outcome text)` — `outcome ∈ {paciente, orcamento, paciente_orcamento}`. **Proibido `perdido`.**
- `appointment_cancel(p_appt_id uuid, p_reason text)` — cancelamento controlado · pode encadear `lead_lost` se humano confirmar
- `_appointment_status_transition_allowed(from, to) → boolean IMMUTABLE`

### Conversões
- `lead_to_appointment(p_lead_id uuid, p_appt_payload jsonb)` — cria agenda + transita phase
- `lead_to_paciente(...)` / `lead_to_orcamento(...)` — usadas pelo `appointment_finalize`, ou diretamente em casos especiais (importação manual, correção)

---

## 8 · Matriz de transições de phase (atualizada)

| from \ to | `lead` | `agendado` | `paciente` | `orcamento` |
|---|---|---|---|---|
| `lead` | ✓ no-op | ✓ | — | — |
| `agendado` | ✓ (último appt removido) | ✓ no-op | ✓ (via finalize) | ✓ (via finalize) |
| `paciente` | — | ✓ (nova consulta) | ✓ no-op | — (vira tag, mantém paciente) |
| `orcamento` | — | ✓ (volta a marcar) | ✓ (orçamento aceito) | ✓ no-op |

**Regras adicionais:**
- `paciente → orcamento` **proibida como transição de phase**. Paciente que ganha orçamento adicional fica em `phase=paciente` com `mesa_operacional='paciente_orcamento'` (derivada na view).
- Transições `paciente → lead` e `orcamento → lead` **proibidas** (nunca regridem ao topo do funil).
- `agendado → lead` permitida apenas via trigger `_appt_revert_lead_phase_on_remove` quando o último appointment ativo é hard/soft-deletado (caso raro · correção de erro).

---

## 9 · Matriz de lifecycle

Lifecycle transita ortogonalmente em qualquer phase:

| from \ to | `ativo` | `perdido` | `recuperacao` | `arquivado` |
|---|---|---|---|---|
| `ativo` | ✓ no-op | ✓ (via `lead_lost`) | — | ✓ (via `lead_archive`) |
| `perdido` | — | ✓ no-op | ✓ (via `lead_recovery_activate`) | ✓ (via `lead_archive`) |
| `recuperacao` | ✓ (recuperou de fato — humano decide) | ✓ (perdeu de novo) | ✓ no-op | ✓ |
| `arquivado` | ✓ (via `lead_unarchive`) | — | — | ✓ no-op |

**Não há transição automática** de lifecycle. Toda mudança é humana, via RPC.

---

## 10 · `phase_history` e audit

Toda transição de `phase` OU de `lifecycle_status` registra 1 row em `phase_history` com:

| Coluna | Tipo | Conteúdo |
|---|---|---|
| `id` | uuid | PK |
| `lead_id` | uuid FK | lead alvo |
| `from_phase` | text | phase anterior (ou NULL se transição é lifecycle-only) |
| `to_phase` | text | phase nova (ou NULL) |
| `from_lifecycle` | text | lifecycle anterior |
| `to_lifecycle` | text | lifecycle novo |
| `origin` | text | `manual` / `auto_transition` / `webhook` / `cron` / `import` |
| `triggered_by` | text | nome da RPC ou trigger que disparou |
| `actor_id` | uuid | user_id do humano (quando aplicável) |
| `reason` | text | motivo livre |
| `created_at` | timestamptz | now() |

**RLS:** `authenticated` pode SELECT + INSERT. `UPDATE/DELETE` reservados para `service_role`.

---

## 11 · Eventos derivados (alertas / mensagens)

Lista mínima que a view operacional + tabela `crm_events_log` (TBD) precisa cobrir:

- `lead.created` `lead.first_contact`
- `lead.no_response_24h` `lead.no_response_72h`
- `appointment.scheduled` `appointment.confirmation_pending`
- `appointment.confirmed` `appointment.day_of`
- `appointment.no_show` `appointment.cancelled` `appointment.rescheduled`
- `appointment.checked_in` `appointment.in_progress` `appointment.finalized`
- `lead.budget_open` `lead.budget_stale_7d` `lead.budget_stale_15d`
- `lead.budget_accepted` `lead.budget_rejected`
- `lead.lost` `lead.recovery_started` `lead.archived` `lead.unarchived`
- `patient.followup_due` `patient.budget_added`
- `message.inbound_unread` `message.assigned` `message.unassigned`
- `copilot.recommended_action`

Cada evento dispara opcionalmente: alerta UI, notificação interna, mensagem WhatsApp, badge, mudança de mesa.

Cada um deve ser inscrito em `crm_event_catalog` (tabela nova) com config:
- nasce quando · morre quando · quem pode dispensar · template de mensagem · destino · canal

---

## 12 · Tabelas afetadas pela transição v1 → v2

| Tabela | Mudança esperada |
|---|---|
| `public.leads` | `phase` enum: drop `reagendado/compareceu`. `lifecycle_status` valida 4 valores. `lost_from_phase` valida apenas {lead,agendado,paciente,orcamento}. Coluna `archived_at`/`archive_reason` (opcionais). |
| `public.appointments` | `chk_appt_status`: drop `pre_consulta/em_consulta` (consolidam em `em_atendimento`). |
| `public.perdidos` | **demovida a espelho/histórico**. Não é mais fonte. Ou drop completo se backfill em `lead_history` for suficiente. |
| `public.phase_history` | adicionar `from_lifecycle` `to_lifecycle`. |
| `public.crm_operational_view` | **CRIAR** (nova). |
| `public.crm_event_catalog` | **CRIAR** (nova). |
| `public.crm_events_log` | **CRIAR** (opcional · pode ser audit de eventos derivados). |

---

## 13 · Decisões humanas pendentes (gate da execução)

Estas precisam de aprovação do Alden antes de Fase 1 começar:

1. **`reagendado` e `compareceu` deixam de ser `phase`?** Sim, por contrato. Mas precisa migrar leads existentes nesses estados para o phase correto.
2. **`perdido` deixa de ser phase totalmente?** Sim. Mas migration precisa migrar todos os `phase='perdido'` para `phase = lost_from_phase` + `lifecycle_status='perdido'`. Se `lost_from_phase` é NULL na linha existente, decisão: ir para `lead` ou `agendado` baseado em outras heurísticas? **Pendente.**
3. **`paciente_orcamento`: tag em `lead.tags` ou só derivado em view?** Sugiro só derivado.
4. **`perdidos` table: dropar ou manter como espelho histórico?** Sugiro manter como audit, congelar gravações novas.
5. **`appointment.status='reagendado'`: mesmo appointment muda data + status, ou cria novo appointment e cancela velho?** Comportamento atual desconhecido.
6. **`crm_operational_view` é materializada?** Trade-off: latência de refresh vs custo de cada SELECT.
7. **`arquivado` é incompatível com `phase='paciente'`?** Provavelmente sim — paciente ativo não pode ser arquivado. Decisão pendente.
8. **RBAC**: quem pode `lead_archive`, `lead_lost`, `lead_recovery_activate`? Apenas SDR, ou também secretária, médica?

Lista completa em `11-open-questions.md`.
