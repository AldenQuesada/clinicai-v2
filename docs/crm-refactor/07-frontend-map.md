# 07 · Frontend Map

> Inventário das telas, componentes, hooks e dependências frontend do CRM. Estado em 2026-05-10.

---

## 1 · Páginas Next.js (`apps/lara/src/app/(authed)/`)

| Rota | Componente | Dados consome | Ações disponíveis | Repos/RPC | Tipo |
|---|---|---|---|---|---|
| `/crm` | `page.tsx` | KPIs leves (leads/pacientes/appts/orcamentos) | Links pra módulos | counts dos 4 repos | RSC dynamic |
| `/crm/pacientes` | `page.tsx` | Lista paginada 50/page | Criar, editar, exportar CSV, bulk status | `patients.list()` | RSC paginado |
| `/crm/pacientes/[id]` | `page.tsx` | Detalhe + histórico | Editar info, soft-delete | `patients.getById()` + `update()` | RSC + form client |
| `/crm/agenda` | `page.tsx` | Calendário multi-view + appts | Agendar, drag-drop, cancelar, attend | `appointments.list()`, `dragDropAppointmentAction()` | RSC + dnd-kit |
| `/crm/agenda/[id]` | `page.tsx` | Detalhe appointment | Editar, finalizar (modal de outcomes), cancelar | `appointments.getById()`, `finalizeAppointmentAction()` | RSC + modal |
| `/crm/orcamentos` | `page.tsx` | Lista 6 KPIs + filtros | Criar, enviar, marcar visualizado/aprovado/perdido | `orcamentos.list()`, `countByStatus()` | RSC paginado |
| `/crm/orcamentos/[id]` | `page.tsx` | Detalhe + itens + share | Editar, aprovar, marcar perdido, compartilhar | `orcamentos.getById()` + actions | RSC + forms |
| `/leads` | `LeadsClient.tsx` | Lista tabela (porta clinic-dashboard) | Tags, mudança fase/funnel/temp, soft-delete | `leads.list()` + tag actions | Client paginado |
| `/leads/[id]` | `LeadDetailClient.tsx` | Detalhe (Info + Tags + Histórico) | Editar, mudar fase/temp/funnel | `leads.getById()` + actions | Client + Server Actions |
| `/secretaria` | `page.tsx` | Inbox secretaria (6 KPIs reais) | Conversa, handoff, encaminhar Dra, perguntas | `useConversations({inbox:'secretaria'})`, `useSecretariaKpis()` | Client + SSE |
| `/dra/perguntas` | `page.tsx` | Fila perguntas pendentes | Responder, aprovar, skip, espelhar conv | fetch `/api/dra/questions` | Client (mobile-first) |
| `/conversas` | `page.tsx` | Inbox principal completa | Tudo de conversação | `useConversations({inbox:'all'})` | Client + SSE |
| `/campanhas` (broadcasts) | `page.tsx` | Broadcasts admin | Criar, agendar, enviar | `BroadcastRepository` | Mix |

**Lacuna identificada:** não existe `/crm/leads/kanban` (kanban com drag-drop por phase). Esse modo ainda vive no `clinic-dashboard` legacy.

---

## 2 · Componentes UI específicos CRM

| Componente | Arquivo | Props/Dados | Onde é usado | Notas |
|---|---|---|---|---|
| `week-calendar.tsx` | `crm/agenda/_components/` | `appointments[]`, `weekStart`, `startHour`, `endHour`, `slotMinutes` | `/crm/agenda` | Drag-drop @dnd-kit (PointerSensor + KeyboardSensor) · validação client + server-side `checkConflicts` RPC |
| `day-view.tsx` | `crm/agenda/_components/` | `appointments[]`, `date`, `professionals[]` | view switcher | Mesma lógica drag |
| `month-view.tsx` | `crm/agenda/_components/` | `appointments[]`, `month` | view switcher | Read-only render |
| `patient-list-table.tsx` | `crm/pacientes/_components/` | `patients[]` + bulk select + CSV export | `/crm/pacientes` | Selecção stateless · reset em reload |
| `orcamento-list-table.tsx` | `crm/orcamentos/_components/` | `orcamentos[]` + status filter | `/crm/orcamentos` | Read-only table + navigate |
| `kpi-cards.tsx (pacientes)` | `crm/pacientes/_components/` | `totalActive`, `churnRisk` | header `/crm/pacientes` | Client-computed: `(lastAt, status) → 'risco'\|'atencao'` |
| `kpi-cards.tsx (orcamentos)` | `crm/orcamentos/_components/` | 6 KPIs + conversion rate | header | Server-computed via `computeOrcamentoKpis()` |
| `LeadTagsPanel.tsx` | `(authed)/leads/[id]/` | `lead: LeadDTO`, `canEdit` | `/leads/[id]` | Wraps actions `addLeadTagsAction`, `setLeadPhaseAction` |
| `LeadFiltersPanel.tsx` | `(authed)/leads/` | `Available: funnels[], phases[], temps[], sources[]` | `/leads` sidebar | URL searchParams driven · client filter |
| `KpiCards.tsx (leads)` | `(authed)/leads/` | hot/warm/cold counts | header `/leads` | Client-side counts via `useMemo` |
| `ConversationList.tsx` | `conversas/components/` | `conversations[]`, `statusFilter` | `/secretaria` + `/conversas` | `/api/conversations` + `useConversations()` |
| `MessageArea.tsx` | `conversas/components/` | `messages[]`, `selectedConversation` | `/secretaria` + `/conversas` | `useMessages()` · SSE real-time |
| `LeadDetailClient.tsx` | `(authed)/leads/[id]/` | `lead`, history | `/leads/[id]` | ~22KB · modal forms + info panel |

---

## 3 · Hooks client-side

| Hook | Arquivo | State gerenciado | Fonte | É fonte operacional? |
|---|---|---|---|---|
| `useSecretariaKpis()` | `secretaria/hooks/` | 6 KPIs `{total, secretaria, mirian, alden, aguardando, urgente}` | `/api/secretaria/kpis` · refetch 30s + manual refresh | **SIM** · cache curto da view |
| `useConversations()` | `conversas/hooks/useConversations.ts` | conversations[], selected, statusFilter | SSE + paginated fetch | **SIM** · inbox dinâmica |
| `useMessages()` | `conversas/hooks/useMessages.ts` | messages[], messageText, isLoading | SSE `/api/stream/messages?convId=...` | **SIM** · chat real-time |
| `useLeadEvents()` | `conversas/hooks/useLeadEvents.ts` | leads[] snapshot read-only | SSE `/api/stream/leads` | CACHE display only |
| `useConversationTags()` | `conversas/hooks/` | tags (from `wa_conversations_operational_view`) | view DB | CACHE da view |
| `useClinicMembers()` | `conversas/hooks/` | members + roles | `/api/clinic-members` | CACHE read-only |
| `usePresence()` | `conversas/hooks/` | `whoIsOnline: Map<userId, ...>` | SSE `/api/stream/presence` | CACHE real-time |
| `useNotificationSettings()` | `hooks/useNotificationSettings.ts` | `{enabled, quietHours, channels}` | localStorage + defaults role | **NÃO** (prefs UI) |
| `useCopilot()` | `conversas/hooks/useCopilot.ts` | `smartReplies: string[]`, isLoading | `/api/copilot/smart-replies` · cache 10min | CACHE (sugestões IA) |

---

## 4 · localStorage / sessionStorage no domínio CRM (Lara v2)

| Key | Arquivo | Propósito | É fonte operacional? |
|---|---|---|---|
| `lara_notification_settings` | `hooks/useNotificationSettings.ts:55` | Prefs notificação | NÃO (cache UI) |
| `lara_broadcast_draft` | `campanhas/nova/BroadcastFormClient.tsx:154` | Auto-save rascunho · 7d cleanup | NÃO (draft) |
| `notification_dismiss_key` | `components/NotificationPermissionBanner.tsx:22` | "user já viu o banner" | NÃO (UX flag) |

✅ **Lara v2 NÃO usa localStorage como fonte operacional crítica.** Toda lógica de estado vem de Server Actions + repos (DB). Padrão correto.

⚠️ **clinic-dashboard legacy é exatamente o oposto** — vide `08-legacy-audit.md`.

---

## 5 · Drag-and-drop

| Implementação | Arquivo | RPC chamada | Validação |
|---|---|---|---|
| Week Calendar drag | `crm/agenda/_components/week-calendar.tsx` | `dragDropAppointmentAction({appointmentId, newDate, newStartTime, newEndTime, forceOverride?})` | Local conflict detect + `checkConflicts` RPC · bloqueia override sem flag |
| Day View drag | `crm/agenda/_components/day-view.tsx` | Mesma action | Mesma validação |
| **Leads Kanban drag** | ❌ NÃO EXISTE | N/A | N/A · não portado |

---

## 6 · Apps secundários

| App | Toca CRM | Como |
|---|---|---|
| `apps/dashboard/` | Não (landing minimalista) | KPIs leves via Lara API |
| `apps/mira/` | Indireto (B2B) | Cria leads via RPC `b2b_refer_lead_safe` (referrals B2B) · usa `OrcamentoRepository` para vouchers |
| `apps/flipbook/` | Não | Biblioteca digital |
| `apps/mira-cron/` | Não diretamente | Crons B2B background (voucher dispatch, etc) |

---

## 7 · Conceito "mesa operacional"

Conceito explicitamente NOMEADO no contrato-alvo, mas o termo **não aparece** em nenhum arquivo do Lara v2 (`mesa_operacional` retornou 0 hits).

O conceito **existente e funcionando** é `operational_owner` em `wa_conversations`:

- Coluna: `wa_conversations.operational_owner` ∈ {`secretaria`, `mirian`, `alden`, NULL}
- View: `wa_conversations_operational_view` (mig 147) · agrupa por owner + status
- API: `/api/secretaria/kpis` faz 5 COUNTs paralelos
- UI: `/secretaria` mostra 6 KPIs com refetch 30s

**No contrato-alvo:**
- "Mesa" passa a ser conceito do CRM (não da conversação)
- `mesa_operacional` é derivada na `crm_operational_view` baseada em `phase + lifecycle_status + agregados`
- Possíveis valores: `lead | agendado | paciente | orcamento | paciente_orcamento | perdido | recuperacao | arquivado`
- View canoniza tudo num lugar só

---

## 8 · Legacy frontend (clinic-dashboard · vanilla JS)

Repo paralelo em `C:\Users\Dr.Quesada\Documents\clinic-dashboard\`. Servido em `painel.miriandpaula.com.br`. AINDA EM USO.

| Pasta/arquivo | Função | Status | Substituível por Next? |
|---|---|---|---|
| `js/sdr/` | Lead kanban + filtros + bulk | ⚠️ Ativo | Sim (gap em v2) |
| `js/components/lead-modal.js` | Modal de lead | ⚠️ Ativo | Sim (`LeadDetailClient.tsx` parcial) |
| `js/agenda-*.js` (família 6+ arquivos) | Agenda completa (week, modal, recurrence, finalize) | ⚠️ Ativo | Parcial (`week-calendar.tsx` cobre só week-view drag) |
| `js/components/leads-table.js` | Tabela de leads | ⚠️ Ativo | Sim (`/leads` v2) |
| `js/dashboard-*.js` | Dashboard widgets | ⚠️ Ativo | Sim (porting incremental) |
| `js/anamnese-*.js` | Wizard de anamnese | ⚠️ Ativo | Não portado ainda |
| `js/services/*.js` | Services Supabase | ⚠️ Ativo | Sim (Next.js repos cobrem) |

**Risco arquitetural:** clinic-dashboard escreve no mesmo DB que Lara v2. Sem coordenação, double-writes podem corromper estado.

---

## 9 · Telas que o contrato-alvo exige · GAP

Comparando com seção 9 do prompt-contrato ("Mapa de UI Enterprise"):

### A · CRM / Funil

| Tela alvo | Existe em Lara v2? | Existe em legacy? | Gap |
|---|---|---|---|
| Mesa Lead | Parcial (`/leads` tabela) | ✅ kanban | UI Kanban v2 faltando |
| Mesa Agendado | Não | ✅ (agenda) | Construir mesa específica |
| Mesa Paciente | Parcial (`/crm/pacientes` lista) | ✅ | Mesa operacional faltando |
| Mesa Orçamento | Parcial (`/crm/orcamentos` lista) | ✅ | Mesa operacional faltando |
| Mesa Paciente+Orçamento | Não | Parcial | Construir |
| Mesa Perdidos | Não | ✅ (filtro) | Construir UI |
| Mesa Recuperação | Não | Parcial | Construir UI |
| Mesa Arquivados | Não | Não | Construir |

### B · Agenda

| Tela alvo | Em v2? | Gap |
|---|---|---|
| Hoje / Semana | ✅ (week-calendar) | OK |
| Confirmações pendentes | Não | Filtro |
| Aguardando chegada | Não | Filtro |
| Na clínica | Não | Filtro |
| Em atendimento | Não | Filtro |
| Finalizados | Não | Filtro |
| Cancelados | Parcial (lista geral) | Vista isolada |
| Remarcados | Não | Vista isolada |
| No-show | Não | Vista isolada |
| Bloqueios | Não | Vista isolada |

### C-F · Pacientes / Orçamentos / Recuperação / Controle

Em geral, **lista básica** existe; **mesas + KPIs + filtros operacionais ricos faltam**. Construção incremental.

### Controle (§F do prompt)

| Item | Existe? |
|---|---|
| Regras (editor) | Não |
| Automações (editor) | Parcial (templates Mira/Lara) |
| Alertas (painel) | Não |
| Notificações (painel) | Não |
| Logs/Auditoria | Parcial (`phase_history` é a tabela · UI mínima) |
| Configurações de CRM | Não |

---

## 10 · Risco arquitetural frontend

| # | Risco | Severidade |
|---|---|---|
| 1 | Leads kanban não portado · dependência continua sendo clinic-dashboard | P1 |
| 2 | Secretaria KPIs com refetch 30s · pode ficar stale se webhook falhar atualizar `operational_owner` | P2 |
| 3 | Drag-drop sem idempotency key · double-booking possível em condição de corrida | P2 |
| 4 | `mesa_operacional` não existe como conceito · contadores precisam recomputar | P2 (cobertura) |
| 5 | Mira app modifica orcamentos via OrcamentoRepository cross-app · sem isolation | P3 |
| 6 | `LeadDetailClient.tsx` é 22KB · candidato a split | P3 |

---

## 11 · Métricas frontend

- Lara v2 CRM frontend: **~3.800 LOC** (páginas + components + hooks)
- Legacy clinic-dashboard CRM: **dezenas de MLOC em vanilla JS** (estimativa)
- Páginas CRM Next.js: **13 rotas** mapeadas
- Componentes CRM: **~30** identificados
- Hooks: **9 hooks** ativos
