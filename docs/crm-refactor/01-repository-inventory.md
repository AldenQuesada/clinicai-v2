# 01 · Repository Inventory

> Inventário read-only de código backend que toca CRM. Estado em 2026-05-10.

---

## 1 · Repositories canônicos (`packages/repositories/src/`)

Pattern: cada repo encapsula tabela canônica + RPCs relacionadas. Server Actions consomem repos via `makeRepos()` (DI factory · god node, 27 edges no grafo).

| Repository | Arquivo | LOC | Métodos públicos (resumido) | RPCs / tabelas tocadas |
|---|---|---|---|---|
| `LeadRepository` | `lead.repository.ts` | ~725 | `createViaRpc`, `create`, `update`, `softDelete`, `restore`, `updateName`, `setFunnel`, `setTemperature`, `addQueixas`, `setPhase`, `toAppointment` (RPC), `toPaciente` (RPC), `toOrcamento` (RPC), `markLost` (RPC), `changePhase` (RPC), `referFromPartner` (RPC), `getById`, `listByPhase`, `list`, `findByPhones`, `kanbanSnapshot`, `countByFunnels` | RPCs: `lead_create`, `lead_to_appointment`, `lead_to_paciente`, `lead_to_orcamento`, `lead_lost`, `sdr_change_phase`, `b2b_refer_lead_safe`. Tabelas: `leads` (CRUD via update direto e RPC), `phase_history` (leitura via RPC) |
| `AppointmentRepository` | `appointment.repository.ts` | ~559 | `create`, `update`, `cancel`, `markNoShow`, `softDelete`, `attend` (RPC), `finalize` (RPC), `changeStatus` (RPC), `checkConflicts`, `aggregates`, `getById`, `listByDate`, `listByDateRange`, `listBySubject`, `countInRange`, `countByStatusInRange` | RPCs: `appointment_attend`, `appointment_finalize`, `appointment_change_status` (se existir · não confirmada). Tabelas: `appointments` (CRUD direto), `leads` / `patients` (via FK em RPC) |
| `OrcamentoRepository` | `orcamento.repository.ts` | ~544 | `update`, `markSent`, `markApproved`, `markLost`, `addPayment`, `softDelete`, `ensureShareToken`, `getById`, `getByShareToken`, `getByShareTokenGlobal`, `list`, `listBySubject`, `listFollowupsDue`, `countByStatus`, `pickFollowupCandidates` (RPC), `markFollowupSent` (RPC), `clearStuckFollowups` (RPC), `getFollowupStats` | RPCs: `orcamento_followup_pick`, `orcamento_followup_mark_sent`, `orcamento_followup_clear_stuck`. Tabelas: `orcamentos` (CRUD direto), `leads`/`patients` (FK) |
| `PatientRepository` | `patient.repository.ts` | ~403 | `update`, `softDelete`, `addRevenueAfterAppointment`, `getById`, `findByPhoneVariants`, `list`, `countWithFilters`, `search`, `count`, `aggregates`, `listAllForExport` | Tabelas: `patients` (CRUD direto), `appointments` (read-only FK) |
| `PhaseHistoryRepository` | `phase-history.repository.ts` | ~91 | `listByLead`, `listRecent`, `countTransitionsToPhase` | Tabelas: `phase_history` (read-only · INSERTs vêm de RPCs) |
| (helper) `lead-dedup.ts` | `lead-dedup.ts` | — | `findLeadInAnySystem` | Tabelas: `leads`, `patients`, `orcamentos` (dedup cross-table) |

**Observação:** não existe `perdido.repository.ts` separado. Perdidos vivem em `leads` com `phase='perdido'` + `lost_*` colunas. Operações de perda passam por `LeadRepository.markLost()` → RPC `lead_lost()`.

### 1.1 · Mutações diretas (sem RPC) — onde estão

Padrão `.from('tabela').update()` aparece **apenas em repositories** (esperado · esse é o ponto de controle):

| Arquivo | Linha aprox. | Tabela | Operação | Contexto |
|---|---|---|---|---|
| `lead.repository.ts` | 105 | leads | UPDATE | `updateScore()` |
| `lead.repository.ts` | 151 | leads | UPDATE | `addTags()` (coluna deprecated) |
| `lead.repository.ts` | 159 | leads | UPDATE | `setFunnel()` |
| `lead.repository.ts` | 200 | leads | UPDATE | `setTemperature()` |
| `lead.repository.ts` | 232 | leads | UPDATE | `update()` genérico |
| `lead.repository.ts` | 247 | leads | UPDATE | `softDelete()` |
| `lead.repository.ts` | 258 | leads | UPDATE | `restore()` |
| `lead.repository.ts` | 270 | leads | UPDATE | `toggleTag()` (deprecated) |
| `lead.repository.ts` | 285 | leads | UPDATE | `removeTags()` (deprecated) |
| `lead.repository.ts` | 301 | leads | UPDATE | `updateLastResponseAt()` |
| `appointment.repository.ts` | 196 | appointments | INSERT | `create()` |
| `appointment.repository.ts` | 237 | appointments | UPDATE | `update()` genérico |
| `appointment.repository.ts` | 256 | appointments | UPDATE | `cancel()` |
| `appointment.repository.ts` | 276 | appointments | UPDATE | `markNoShow()` |
| `appointment.repository.ts` | 295 | appointments | UPDATE | `softDelete()` |
| `orcamento.repository.ts` | 155 | orcamentos | UPDATE | `ensureShareToken()` |
| `orcamento.repository.ts` | 306 | orcamentos | UPDATE | `update()` genérico |
| `orcamento.repository.ts` | 321 | orcamentos | UPDATE | `markSent()` |
| `orcamento.repository.ts` | 338 | orcamentos | UPDATE | `markApproved()` |
| `orcamento.repository.ts` | 355 | orcamentos | UPDATE | `markLost()` |
| `orcamento.repository.ts` | 377 | orcamentos | UPDATE | `addPayment()` |
| `orcamento.repository.ts` | 402 | orcamentos | UPDATE | `softDelete()` |
| `patient.repository.ts` | 332 | patients | UPDATE | `update()` genérico |
| `patient.repository.ts` | 351 | patients | UPDATE | `softDelete()` |
| `patient.repository.ts` | 393 | patients | UPDATE | `addRevenueAfterAppointment()` |

**ZERO mutations diretas em `apps/lara/` fora dos repositories.** ✅ Padrão arquitetural respeitado.

**Risco residual:** `appointment.repository.cancel()` e `markNoShow()` mudam `appointments.status` direto via UPDATE, **sem matriz `_appointment_status_transition_allowed`** (que ainda não existe). Pode produzir transições ilegais (ex: `cancelado → confirmado`). Débito.

---

## 2 · Server Actions (camada 5 · `apps/lara/src/app/crm/_actions/`)

Padrão consistente: cada action faz `loadServerReposContext()` → Zod validate → repo call → `revalidatePath()`. Retornos sempre `Result<T, E>`.

### 2.1 · `lead.actions.ts` — 6 actions

| Action | Função | Repo / RPC | Zod schema |
|---|---|---|---|
| `createLeadAction` | Cria lead novo via RPC `lead_create` | `repos.leads.createViaRpc()` | `CreateLeadSchema` |
| `scheduleAppointmentAction` | Lead → agendado (cria appt + transita) | `repos.leads.toAppointment()` → RPC `lead_to_appointment` | `ScheduleAppointmentSchema` |
| `promoteToPatientAction` | Lead/compareceu → paciente | `repos.leads.toPaciente()` → RPC `lead_to_paciente` | `PromoteToPatientSchema` |
| `createOrcamentoFromLeadAction` | Lead → orcamento | `repos.leads.toOrcamento()` → RPC `lead_to_orcamento` | `CreateOrcamentoFromLeadSchema` |
| `changeLeadPhaseAction` | Roteador genérico via RPC `sdr_change_phase` | `repos.leads.changePhase()` | Zod |
| `markLeadLostAction` | Marca perdido (reason obrig) | `repos.leads.markLost()` → RPC `lead_lost` | Zod |

### 2.2 · `appointment.actions.ts` — 7 actions

| Action | Função | Repo / RPC |
|---|---|---|
| `createAppointmentAction` | Slot para paciente já existente / bloqueado | `repos.appointments.create()` (direct) |
| `updateAppointmentAction` | Edição (data/hora/profissional/notas) | `repos.appointments.update()` (direct) |
| `cancelAppointmentAction` | status=`cancelado` + motivo | `repos.appointments.cancel()` (direct) |
| `markNoShowAction` | status=`no_show` + motivo | `repos.appointments.markNoShow()` (direct) |
| `attendAppointmentAction` | Paciente chegou · status=`na_clinica` | `repos.appointments.attend()` → RPC |
| `finalizeAppointmentAction` | Estado terminal · outcome=paciente/orcamento/perdido | `repos.appointments.finalize()` → RPC |
| `softDeleteAppointmentAction` | Soft-delete | direct |

⚠️ `cancelAppointmentAction` e `markNoShowAction` chamam **mutation direta** (não RPC). Não há matriz de transição de appointment status hoje.

### 2.3 · `orcamento.actions.ts` — 6 actions

| Action | Função | Repo |
|---|---|---|
| `updateOrcamentoAction` | Edita campos simples | `repos.orcamentos.update()` |
| `markOrcamentoSentAction` | status=sent | `repos.orcamentos.markSent()` |
| `markOrcamentoApprovedAction` | status=approved | `repos.orcamentos.markApproved()` |
| `markOrcamentoLostAction` | status=lost + reason | `repos.orcamentos.markLost()` |
| `addOrcamentoPaymentAction` | append payment array | `repos.orcamentos.addPayment()` |
| `ensureShareTokenAction` | Gera share token | `repos.orcamentos.ensureShareToken()` |

### 2.4 · `patient.actions.ts` — 3 actions

| Action | Função | Repo | RBAC |
|---|---|---|---|
| `updatePatientAction` | Edita campos editáveis | `repos.patients.update()` | qualquer com role |
| `softDeletePatientAction` | Soft-delete | `repos.patients.softDelete()` | `requireRole(['owner','admin'])` |
| `addPatientRevenueAction` | Agregado financeiro pós-appt | `repos.patients.addRevenueAfterAppointment()` | `requireRole(['owner','admin','receptionist'])` |

### 2.5 · `shared.ts` (helpers)

- `Result<T, E>` type
- `zodFail()` (god node, 26 edges)
- `requireRole(roles[])`
- `loadServerReposContext()` (god node, 156 edges · pattern central)
- `CRM_TAGS` constants
- Logger structured

---

## 3 · Server Actions legados (`apps/lara/src/app/(authed)/leads/actions.ts`)

10 actions vindas do clinic-dashboard portadas em diferentes momentos. Algumas tocam coluna deprecated (`leads.tags`).

| Action | Função | Mutation |
|---|---|---|
| `updateLeadAction` | Edição genérica | `repos.leads.update()` direto |
| `setLeadFunnelAction` | Set funnel (pill UI) | direct |
| `setLeadTemperatureAction` | Set temperature | direct |
| `setLeadPhaseAction` | Muda phase via RPC | RPC `sdr_change_phase` |
| `addLeadTagsAction` | Append tags (deprecated col) | direct |
| `removeLeadTagsAction` | Remove tags (deprecated) | direct |
| `updateLeadScoreAction` | Score 0-100 | direct |
| `softDeleteLeadAction` | Soft-delete | direct |
| `restoreLeadAction` | Undo soft-delete | direct |
| `transbordarLeadAction` | Pausa IA · conversation.status='dra' | direct + `conversations.setStatus()` |

Todas usam `revalidatePath('/leads')` pós-mutação.

---

## 4 · API Routes (`apps/lara/src/app/api/`)

| Route | Método | Toca CRM | Mutação |
|---|---|---|---|
| `/api/webhook/whatsapp` | POST | `processInboundMessage()` cria lead via `LeadRepository.createViaRpc` | INSERT em leads (via RPC) |
| `/api/webhook/whatsapp-evolution` | POST | Inbound LID-aware · cria lead se inbox_role='secretaria' | INSERT em leads |
| `/api/leads/[id]/appointments` | GET | Lista appts do lead | read-only |
| `/api/cron/orcamento-followup` | POST | Pick + send follow-up | UPDATE orcamentos, INSERT wa_outbox |
| `/api/cron/lid-pending-monitor` | GET | Health monitor | read-only |
| `/api/cron/divergence-check` | GET | Soak monitor legacy↔public | read-only |
| `/api/secretaria/kpis` | GET | KPIs secretaria | read-only |
| `/api/secretaria/dra-pending` | GET | Mirror dra-pending count | read-only |
| `/api/dra/questions` | GET | Fila de perguntas pra Dra | read-only |
| `/api/conversations/[id]/copilot` | GET | Smart Replies | read-only (cache) |
| `/api/stream/messages` | SSE | Stream de mensagens | read-only |
| `/api/stream/leads` | SSE | Stream de leads | read-only |
| `/api/stream/presence` | SSE | Presença online | read-only |

---

## 5 · Services (`apps/lara/src/services/`)

Serviços de orchestration · não tocam CRM diretamente:

| Arquivo | Responsabilidade |
|---|---|
| `ai.service.ts` | Chamadas Claude para Smart Replies / Copilot |
| `cold-open.service.ts` | Geração de opening messages |
| `transcription.service.ts` | Áudio → texto |
| `whatsapp-cloud.ts` | Adapter Cloud Meta |

---

## 6 · Legacy JS (`apps/lara/public/legacy/js/services/`)

Servido junto com Lara Next.js mas **decommissioned** (não consumido pelo Lara novo). Vive aqui por compatibilidade durante a transição.

| Arquivo | Função (legado) | Risco |
|---|---|---|
| `leads.service.js` | Queries legadas em `leads` | Refactor pendente / dropar |
| `patients.service.js` | Queries em `patients` | idem |
| `appointments.service.js` | Queries em `appointments` | idem |
| `sdr.service.js` | Phase changes + temperature/priority tags | idem |
| `budgets.service.js` | Queries em `orcamentos` (via view `budgets`) | idem |
| `sdr.repository.js` | Repo legacy | idem |
| (+11 outros .js) | Vários · ~6663 LOC total | Candidatos a remoção |

**NÃO são fonte operacional em prod.** Servidos apenas como artefatos · risco zero se removidos junto com clinic-dashboard.

---

## 7 · Apps secundários

| App | Toca CRM | Como |
|---|---|---|
| `apps/dashboard/` | Praticamente não | Landing page · KPIs leves via Lara API |
| `apps/mira/` | Sim (B2B refer) | `LeadRepository.referFromPartner()` → RPC `b2b_refer_lead_safe` |
| `apps/flipbook/` | Não | Biblioteca digital |
| `apps/mira-cron/` | Sim (B2B background) | Crons B2B (voucher dispatch, etc) |

---

## 8 · clinic-dashboard (repositório legado · vanilla JS)

Repositório paralelo `C:\Users\Dr.Quesada\Documents\clinic-dashboard\` ainda em produção (painel.miriandpaula.com.br). Compartilha o MESMO banco Supabase.

| Camada | Arquivos | Risco |
|---|---|---|
| `js/components/lead-modal.js` | Modal de lead · usa `localStorage` como cache | 🔴 P0 · stale data perpétuo |
| `js/repositories/appointments.repository.js` | `.from('appointments').update()` direto | 🔴 P1 · viola matriz canônica |
| `js/sdr/sdr.repository.js` | RPC `sdr_change_phase` (correto) + outros UPDATE direto | 🟡 P2 |
| `js/services/sdr.service.js` | Manipula `leads.temperature/priority` via tags em vez de coluna | 🟡 débito |
| `js/components/leads-table.js` | `.filter().length` para contadores · subestima quando > 50 | 🔴 stale counters |
| `js/dashboard-birthdays.js` | Lê `localStorage('clinicai_leads')` | 🔴 |
| `js/agenda-leads.js` | `.getAppointments()` lê localStorage | 🔴 |
| `js/anamnese-core.js` | `localStorage('clinicai_lead_patient_map')` | 🔴 P0 · paciente_id pode ficar stale |
| `js/ui/funnel-automations/modules/perdido.module.js` | Triggers de "perdido" follow-up | 🟡 verificar se está rodando |

**Decisão arquitetural pendente:** clinic-dashboard legacy continuará escrevendo no DB durante refactor v2? Se sim, precisa de double-write protection.

---

## 9 · Padrões observados

✅ **Bom:**
- Repository pattern consistente
- Server Actions tipadas com Zod
- ZERO mutations CRM em apps/lara fora de repos
- RLS multi-tenant via JWT
- Phase mutations sempre via RPC (em Lara v2)
- Soft-delete pattern uniforme
- `loadServerReposContext()` (god node) centraliza setup de cada Server Action

⚠️ **Débito:**
- `appointment.cancel()` e `markNoShow()` mutam status sem matriz
- `leads.tags` coluna deprecated ainda referenciada em 4 actions/repo methods
- clinic-dashboard legacy faz mutations diretas no mesmo DB
- Tags `temperature` / `priority` manipuladas via array de tags em sdr.service.js legado
- `appointment_change_status` RPC genérica não existe (fragmentada)

---

## 10 · Métricas

- Repositories CRM: **2.322 LOC**
- Server Actions CRM novas (crm/_actions/): **~200 LOC** + 22 actions
- Server Actions legadas (leads/actions.ts): **~322 LOC** + 10 actions
- Mutations diretas em repos: **25 hits** (todos contidos)
- Mutations CRM em apps/lara fora de repos: **0** ✅
- Legacy JS deprecated: **~6.663 LOC** em ~16 arquivos
