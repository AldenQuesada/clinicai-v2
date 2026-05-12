# CRM_PHASE_LEGACY.UI.AUDIT · Legacy UI Inventory & Port Plan

> Inventário completo do legacy × v2 com matriz de portabilidade controlada.
> **Audit-only** · zero código alterado · zero migration · zero envio.
> Worker 71 OFF · contratos canônicos v2 prontos · `can_open_control_audit_after_port_plan=true`.

---

## 1. Resumo executivo

Mapeados **25 módulos** do legacy (74 arquivos JS em `apps/lara/public/legacy/js/`)
e cruzados com a árvore v2 (`apps/lara/src/app/`). Resultado:

| Status | Qtd | Comentário |
|---|---|---|
| ✅ **COBERTO** (já no v2) | **9** | Agenda, agendamento criar/editar, paciente chegou, iniciar atendimento, finalização, cancel/no-show/remarcação, anamnese, recuperação, secretaria/conversas/alertas |
| 🟡 **PORTAR** (UI legacy útil · recriar em Next.js) | **5** | Tags/kanban personalizado, agenda automations engine, dashboards/KPIs, copilot/SDR, anamnese-builder |
| 🔵 **RECRIAR** (legacy gambiarra · contrato v2 deve guiar) | **4** | Procedimentos UI, Pacientes UI legacy detail, Orçamentos UI legacy, Birthday/Broadcast |
| ❌ **DESCARTAR** | **2** | Alexa real legacy (zumbi), legal-doc legacy duplicado |
| 🔴 **BLOQUEADO** (Meta/provider) | **3** | Alexa real, broadcast WhatsApp real, conversas WhatsApp envio |
| ❓ **AUDITAR MAIS** | **2** | Captação kanbans + injetáveis · contexto ambíguo |

**Total módulos:** 25 · **Total arquivos legacy varridos:** 74.

Veredito: o v2 cobre **toda a coluna vertebral CRM-Agenda** (status, finalização,
recuperação, alertas). Próximos ports concentram-se em camadas auxiliares
(kanban, dashboards, copilot) e em **descartar zumbis** (Alexa real, status
legacy em pg_proc) antes do CONTROL.1 final.

---

## 2. Estado atual v2 (pré-port)

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `eb21879` |
| origin/main | `eb21879` |
| Worker 71 | OFF ✓ |
| Jobs 12/72/89-94 | ON ✓ |
| `wa_outbox` queued/pending/unsafe | 0/0/0 ✓ |
| `phase='perdido'` count | 0 ✓ |
| Invalid appointment status | 0 ✓ |
| Core contracts ready | ✓ (9 RPCs/views) |
| Zumbi functions no DB | 18 (informativo) |
| Alexa RPCs dormentes no DB | 9 (informativo) |

V2 routes (`apps/lara/src/app/`):

```
/crm/                        crm/page.tsx
/crm/agenda/                 crm/agenda/{page,novo,[id]/{page,editar}}
/crm/pacientes/              crm/pacientes/{page,novo,[id]/{page,editar}}
/crm/orcamentos/             crm/orcamentos/{page,novo,[id]/{page,editar}}
/crm/recuperacao/            crm/recuperacao/page (workflow dry-run)
/(authed)/conversas/         conversas/page (inbox WhatsApp)
/(authed)/secretaria/        secretaria/{page,notificacoes}
/(authed)/dashboard/         dashboard/page
/(authed)/dra/perguntas/     dra/perguntas/page (mirror Dra Mirian)
/(authed)/leads/             leads/{page,[id]}
/(authed)/campanhas/         campanhas/{page,nova,[id]} (broadcast UI)
/(authed)/templates/         templates/page
/(authed)/midia/             midia/page
/(authed)/logs/              logs/page
/(authed)/admin/health/      admin/health/page
/(authed)/configuracoes/     configuracoes/{page,clinica,usuarios,permissoes}
/(authed)/prompts/           prompts/page
/orcamento/[token]           public RSC
```

Core contracts disponíveis (mig 156-174):

- `appointment_attend` · `appointment_finalize` · `appointment_change_status`
- `lead_lost` · `lead_recover`
- `appointment_clinical_gate_status`
- `appointment_arrival_internal_alert`
- `crm_operational_view`
- `commercial_recovery_queue_view` + `_workflow_view`
- 8 RPCs workflow recovery (mig 174)

---

## 3. Critério de portabilidade

**PORTAR** quando:
- UI legacy tem boa UX/fluxo
- Não depende de status zumbi (`em_consulta`/`pre_consulta`/`compareceu`/`reagendado`)
- Dados já existem em RPC/view v2
- Pode ser recriado limpo em Next.js (Server Action + Zod + role gate)

**RECRIAR** quando:
- Fluxo é útil, implementação legacy é ruim (localStorage, DOM manual, status velho)
- Precisa usar banco/RPC v2 que ainda não tem UI

**DESCARTAR** quando:
- Redundante / substituído por fluxo melhor v2
- Quebra contrato canônico v2
- Usa provider externo perigoso sem unban

**BLOQUEADO** quando:
- Depende de Meta/WhatsApp real (ban gate 2L)
- Depende de Alexa real (sem env)
- Depende de integração externa não aprovada

---

## 4. Matriz Legacy × V2 (25 módulos)

### 4.1 Agenda mensal/semanal/diária

| Campo | Valor |
|---|---|
| Legacy path | `agenda-overview.js`, `agenda-overview.panels.js`, `agenda-overview.birthdays.js`, `agenda-day-panel.js` |
| V2 path | `apps/lara/src/app/crm/agenda/page.tsx` |
| Existe v2? | ✅ sim · vista canônica |
| DB | `crm_operational_view` + `appointments` |
| Status | **COBERTO** |
| Risco | baixo |
| Motivo | View canônica já consome agenda · status + chegada + sala vivem na tabela |
| Observação | Vista diária legacy tem painéis (próximo paciente · birthdays) · candidato a recriar como widget no `/recepcao/painel` |

### 4.2 Modal criar agendamento

| Campo | Valor |
|---|---|
| Legacy path | `agenda-modal.js`, `agenda-modal.recurrence.js`, `agenda-smart.js` |
| V2 path | `apps/lara/src/app/crm/agenda/novo/page.tsx` + `_form.tsx` |
| Existe v2? | ✅ sim · wizard 2AUX entregue |
| DB | `appointment_create_via_rpc` (RPC canon · clinic_id JWT-scoped) |
| Status | **COBERTO** |
| Risco | baixo |
| Motivo | Wizard 2AUX entregue + recorrência grupo |
| Observação | Falta `professional_id` FK first-class (próx 2AUX.2) |

### 4.3 Modal editar agendamento

| Campo | Valor |
|---|---|
| Legacy path | `agenda-modal.detail.js`, `agenda-modal.js` |
| V2 path | `apps/lara/src/app/crm/agenda/[id]/editar/page.tsx` |
| Existe v2? | ✅ sim · 2AUX.3 |
| DB | `appointment_update_via_rpc` + state-machine gate |
| Status | **COBERTO** |
| Risco | baixo |
| Motivo | Editar restrito a status editáveis · bloqueado em terminal |

### 4.4 Paciente chegou / Paciente na clínica

| Campo | Valor |
|---|---|
| Legacy path | `agenda-finalize.js`, `agenda-smart.js` (notifyArrival + Alexa) |
| V2 path | `apps/lara/src/app/crm/agenda/[id]/page.tsx` (botão "Marcar chegada") |
| Existe v2? | ✅ sim · 2H |
| DB | `appointment_attend` RPC + `appointment_arrival_internal_alert` |
| Status | **COBERTO** |
| Risco | baixo |
| Motivo | Internal alert dashboard via `AlertBell` |
| Observação | Painel-TV recepção é refinement futuro (2ALEXA.2) |

### 4.5 Iniciar atendimento

| Campo | Valor |
|---|---|
| Legacy path | `agenda-smart.js`, `agenda-finalize.js` |
| V2 path | `apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx` |
| Existe v2? | ✅ sim · 2H.1 |
| DB | `appointment_start_attendance` RPC (na_clinica → em_atendimento) |
| Status | **COBERTO** |
| Risco | baixo |
| Motivo | Transition gated · idempotente |

### 4.6 Finalização

| Campo | Valor |
|---|---|
| Legacy path | `agenda-smart.finalize.js`, `agenda-finalize.js` |
| V2 path | `apps/lara/src/app/crm/agenda/[id]/page.tsx` + wizard 3 outcomes |
| Existe v2? | ✅ sim · 2J + 2I.1 |
| DB | `appointment_finalize` RPC + clinical_gate_status |
| Status | **COBERTO** |
| Risco | baixo |
| Motivo | Enterprise finalization · 3 outcomes (paciente/orcamento/lost) + hard gate clínico |

### 4.7 Cancelamento / 4.8 No-show / 4.9 Remarcação

| Campo | Valor |
|---|---|
| Legacy path | `agenda-validation.js`, `agenda-validation.cancel.js` |
| V2 path | `apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx` + modals dedicados |
| Existe v2? | ✅ sim · 2R.2 |
| DB | `appointment_change_status` RPC + colunas dedicadas (`motivo_cancelamento`, `motivo_no_show`, `cancelado_em`, `no_show_em`) |
| Status | **COBERTO** |
| Risco | baixo |
| Motivo | 7 motivos cancel + 4 motivos no-show predefinidos · botão "Remarcar" → /editar |

### 4.10 Anamnese

| Campo | Valor |
|---|---|
| Legacy path | `anamnese.js`, `anamnese-builder.js`, `anamnese-core.js`, `anamnese-types.js`, `form-render.js` |
| V2 path | `apps/lara/src/app/crm/agenda/[id]/_clinical-panel.tsx` |
| Existe v2? | 🟡 parcial · status/gate cobertos (2I+2I.1) mas builder NÃO portado |
| DB | `anamnesis_requests` + `appointment_clinical_gate_status` |
| Status | **PORTAR** (anamnese-builder) · **COBERTO** (status/gate) |
| Risco | médio |
| Motivo | Builder legacy permite criar templates customizados de anamnese · v2 ainda usa templates fixos. UI builder é valiosa mas precisa redo em React. |
| Próx fase | CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER |

### 4.11 Consentimento

| Campo | Valor |
|---|---|
| Legacy path | `agenda-smart.js` `_enviarConsentimento`, `legal-document-public.js`, `legal-doc-templates.js` |
| V2 path | `apps/lara/src/app/crm/agenda/[id]/_clinical-panel.tsx` |
| Existe v2? | ✅ sim · 2I (consent signing inline) |
| DB | `legal_doc_requests` + `legal_doc_signatures` + RPCs |
| Status | **COBERTO** |
| Risco | baixo |
| Motivo | Hard gate clínico bloqueia finalização sem consent assinado |
| Observação | "Enviar consentimento por WhatsApp" do legacy continua **BLOQUEADO** (sem provider) · v2 entrega via link público assinado |

### 4.12 Recuperação comercial

| Campo | Valor |
|---|---|
| Legacy path | `tags.js` (kanban perdidos+orcamento) · `leads.js` |
| V2 path | `apps/lara/src/app/crm/recuperacao/page.tsx` + workflow dry-run |
| Existe v2? | ✅ sim · 2RC + 2RC.1 |
| DB | `commercial_recovery_queue_view` + `commercial_recovery_workflow_view` + 8 RPCs |
| Status | **COBERTO** |
| Risco | baixo |
| Motivo | Workflow interno completo · zero envio · suggested_message dry-run |

### 4.13 Secretaria / Conversas WhatsApp

| Campo | Valor |
|---|---|
| Legacy path | n/a (legacy não tinha "secretaria" dedicada) |
| V2 path | `apps/lara/src/app/(authed)/secretaria/page.tsx` + `conversas/page.tsx` |
| Existe v2? | ✅ sim · 6 KPIs + dra-pending mirror |
| DB | `wa_mih_inbox_view` + secretaria health RPC |
| Status | **COBERTO** |
| Risco | médio |
| Motivo | Envio WhatsApp **BLOQUEADO** por ban gate 2L · receive funciona via webhook |

### 4.14 Cards de conversa

| Campo | Valor |
|---|---|
| Legacy path | n/a (legacy era SDR-style) |
| V2 path | `apps/lara/src/app/(authed)/conversas/components/*` (MessageArea, SecretariaSummary, etc.) |
| Existe v2? | ✅ sim |
| DB | `wa_conversations` + `wa_messages` (UNIQUE per-channel) |
| Status | **COBERTO** |
| Risco | médio (envio bloqueado) |

### 4.15 Tags / filas / kanban personalizado

| Campo | Valor |
|---|---|
| Legacy path | `tags.js` (2400+ linhas · CRUD tags + kanban per-phase + screen-templates + checkout modal) |
| V2 path | NENHUM (não portado) |
| Existe v2? | ❌ não |
| DB | tabelas `tags` + `lead_tags` (existem · não usadas no v2) |
| Status | **RECRIAR** (não portar literal · legacy é monstro vanilla) |
| Risco | alto · `tagsFinalizeCheckout` legacy tem fluxo de orçamento embutido + provider externo |
| Motivo | UI legacy mistura tag CRUD + budget checkout + alert templates · separação verificável no v2 |
| Próx fase | CRM_PHASE_LEGACY.PORT.TAGS_KANBAN (depois CONTROL.1) |

### 4.16 Copilot / SmartReplies / SDR

| Campo | Valor |
|---|---|
| Legacy path | `sdr.js` (~16 funções · funil + source comparison + period config + thresholds) |
| V2 path | parcial em `apps/lara/src/app/(authed)/secretaria/notificacoes` + `dra/perguntas` |
| Existe v2? | 🟡 parcial · funil SDR não portado |
| DB | dashboards funil/source · views derivadas |
| Status | **PORTAR** (renderiza analytics · SQL canônico) |
| Risco | médio |
| Motivo | SDR copilot do legacy é analytics + thresholds editáveis · v2 tem só pieces |
| Próx fase | CRM_PHASE_LEGACY.PORT.SDR_DASHBOARD |

### 4.17 Orçamentos

| Campo | Valor |
|---|---|
| Legacy path | `orcamentos.js`, `tags.js` (parte de checkout) |
| V2 path | `apps/lara/src/app/crm/orcamentos/*` (page, novo, [id], editar) |
| Existe v2? | ✅ sim |
| DB | `orcamento_*` RPCs + `orcamentos` table |
| Status | **COBERTO** |
| Risco | baixo |
| Motivo | Wizard novo + listing + edit + view com itens |
| Observação | Public RSC `/orcamento/[token]` cobre signing |

### 4.18 Pacientes

| Campo | Valor |
|---|---|
| Legacy path | `patients.js`, `patients-docs.js`, `prontuario.js` |
| V2 path | `apps/lara/src/app/crm/pacientes/*` (page, novo, [id], editar) |
| Existe v2? | ✅ sim · `prontuario` parcial |
| DB | `patient_*` RPCs + `patients` table |
| Status | **COBERTO** (CRUD) · **RECRIAR** (prontuário detalhado) |
| Risco | médio |
| Motivo | Listing + CRUD v2 OK · prontuário legacy é HTML inline com histórico clínico que v2 ainda não cobre |
| Próx fase | CRM_PHASE_LEGACY.PORT.PRONTUARIO |

### 4.19 Procedimentos

| Campo | Valor |
|---|---|
| Legacy path | `procedimentos.js` |
| V2 path | NENHUM (CRUD não portado · só leitura via `ProcedureRepository`) |
| Existe v2? | ❌ CRUD não · 🟡 read-only via API |
| DB | `procedures` + `commercial_procedures` |
| Status | **RECRIAR** (CRUD admin) |
| Risco | baixo |
| Motivo | Procedimentos só lidos pelo agendamento atual · admin precisa CRUD dedicado |

### 4.20 Complaints / queixas

| Campo | Valor |
|---|---|
| Legacy path | NENHUM encontrado |
| V2 path | NENHUM |
| Existe v2? | n/a |
| DB | `complaints` table não confirmada |
| Status | **AUDITAR MAIS** |
| Risco | baixo |
| Motivo | Termo aparece em docs do refactor mas não há módulo dedicado · pode estar embutido em `leads.queixas[]` |
| Observação | Verificar `lead.queixas` array · provavelmente coberto via REFACTOR_LEAD_MODEL |

### 4.21 Alexa / boas-vindas

| Campo | Valor |
|---|---|
| Legacy path | `alexa-settings.js`, `alexa-notification.service.js` |
| V2 path | NENHUM (omissão explícita) |
| Existe v2? | ❌ não · ✅ alternativa: `AlertBell` dashboard |
| DB | 9 RPCs dormentes + 4 tabelas zumbi (`clinic_alexa_config` etc.) |
| Status | **DESCARTAR** (Alexa real) · **COBERTO** (dashboard internal alert) |
| Risco | alto · provider externo · cookie auth · webhook frágil |
| Motivo | Dashboard v2 cobre o caso uso real · Alexa real está deferida |
| Próx fase | CRM_PHASE_2ALEXA.1 (polish dashboard) ou 2ALEXA.2 (TV) antes de 2ALEXA.3+ |

### 4.22 Logs

| Campo | Valor |
|---|---|
| Legacy path | n/a |
| V2 path | `apps/lara/src/app/(authed)/logs/page.tsx` |
| Existe v2? | ✅ sim · estruturado |
| Status | **COBERTO** |

### 4.23 Configurações

| Campo | Valor |
|---|---|
| Legacy path | `clinic-settings.js`, `clinic-env.js`, `users-admin.js`, `settings-backups.js` |
| V2 path | `apps/lara/src/app/(authed)/configuracoes/{clinica,usuarios,permissoes}/page.tsx` |
| Existe v2? | ✅ sim (clínica + usuários + permissões) |
| Status | **COBERTO** (clinic+users) · **RECRIAR** (backup) |
| Risco | médio |
| Motivo | `settings-backups.js` legacy lida com Drive · v2 omitiu (ver `ClinicSettingsClient.tsx:53` "Tabs alexa/documentos do legado omitidas") |

### 4.24 Parcerias / Vouchers / Mira

| Campo | Valor |
|---|---|
| Legacy path | n/a (Mira é v2-native) |
| V2 path | `apps/mira/` (app dedicado) + `b2b_*` repositories |
| Existe v2? | ✅ sim · módulo separado |
| Status | **COBERTO** |
| Risco | médio (envio Evolution Mih banido) |
| Motivo | Mira tem app dedicado · vouchers/partnerships/templates · webhook Evolution |

### 4.25 Dashboards / KPIs

| Campo | Valor |
|---|---|
| Legacy path | `dashboard.js`, `dashboard-birthdays.js`, `sdr.js`, `financeiro-reports.js` |
| V2 path | `apps/lara/src/app/(authed)/dashboard/page.tsx` (parcial) |
| Existe v2? | 🟡 parcial · sem funil SDR completo |
| Status | **PORTAR** (SDR funil + financeiro-reports) |
| Risco | médio |
| Motivo | Legacy tem dashboards de funil/conversão/no-show por motivo · v2 dashboard base sem analytics profundo |
| Próx fase | CRM_PHASE_LEGACY.PORT.DASHBOARDS |

---

## 5. Módulos extras encontrados no legacy (fora dos 25 obrigatórios)

| Módulo | Arquivos | Status sugerido |
|---|---|---|
| Birthday automations | `birthday.ui.js`, `birthday-events.ui.js`, `birthday-templates.ui.js`, `dashboard-birthdays.js` | **RECRIAR** condicional ao desbloqueio WhatsApp (BLOQUEADO até unban) |
| Broadcast | `broadcast.ui.js`, `broadcast-dashboard.ui.js`, `broadcast-events.ui.js` | **COBERTO PARCIAL** v2 tem `(authed)/campanhas` · BLOQUEADO p/ envio real |
| Salas físicas | `rooms.js` | **RECRIAR** (admin) · separar da config Alexa zumbi |
| Profissionais | `professionals.js` | **RECRIAR** com FK first-class (CRM_PHASE_2AUX.2) |
| Tecnologias | `technologies.js` | **AUDITAR MAIS** · catálogo de tecnologias/equipamentos não documentado |
| Captação kanbans | `captacao-kanbans.js` | **AUDITAR MAIS** · pode duplicar tags kanban |
| Injetáveis | `injetaveis.js` | **AUDITAR MAIS** · controle de estoque de injetáveis |
| Financeiro | `financeiro.js`, `financeiro-reports.js` | **RECRIAR** (admin/manager) |
| Quiz/anatomy | `quiz-render.js` | **DESCARTAR** v2-side (quiz vive em outro app/canal) |
| Tasks | `tasks.js` | **AUDITAR MAIS** · TODO-list interno |
| LP blocks | `lp-blocks.js`, `lp-shared.js` | **DESCARTAR** v2-side (LP Builder vive no clinic-dashboard legacy) |
| Short links | `short-links.ui.js`, `wa-links.js` | **RECRIAR** se necessário · BLOQUEADO p/ wa-link real |
| Form render | `form-render.js` | **PORTAR** · core renderer compartilhado |
| Multi-tab launcher | `multi-tab-launcher.js` | **DESCARTAR** · UX legacy específica |

---

## 6. Riscos encontrados (mapa completo)

### 6.1 Status zumbi em pg_proc (DB)

| Termo | Funções |
|---|---|
| `em_consulta` | 6 funções com prosrc contendo · cleanup recomendado em CONTROL.1 |
| `pre_consulta` | 8 funções |
| `compareceu` | 5 funções |
| `reagendado` | 1 função |
| `'perdido'` literal (excluindo lost/perdido fns) | 10 funções |

**Total:** 18 funções zumbi (`zumbi_function_count=18`). Não bloqueia
porque os status canônicos do v2 já são enforced via CHECK constraints,
mas representam código morto que pode causar confusão. Cleanup deferred
para CRM_PHASE_CONTROL.1 (audit final + drop seguro).

### 6.2 Alexa RPCs dormentes (9 funções)

```
upsert_alexa_config, get_alexa_config
upsert_alexa_device, get_alexa_devices, delete_alexa_device
alexa_log_announce, alexa_log_update, alexa_metrics, alexa_pending_queue
```

Sem chamada pelo v2 · sem cron · sem cron_alexa_calls. Decisão deferida
para 2ALEXA.3+ ou drop em CONTROL.1.

### 6.3 Risco WhatsApp/Evolution

Provider call só em legacy:
- `alexa-notification.service.js` → webhook alexa-bridge (não wired no v2)
- Templates broadcast (BLOQUEADO p/ envio real)
- `wa-links.js` legacy gera URLs `https://wa.me/...` para click manual (sem envio real · pode portar)

**Confirmado por SQL:** `cron_with_provider_call = 0`.

### 6.4 localStorage como fonte da verdade no legacy

Padrão recorrente em `tags.js`, `sdr.js`, `agenda-smart.js`. **Reset
obrigatório no port:** dados canônicos vivem no DB. localStorage só pra
preferências UI (filtros, ordenação).

### 6.5 Duplicação de lógica DB no frontend

Legacy faz transformações de status/phase no JS (`tags.js` calcula
fases custom). **Regra port v2:** todo cálculo de status canônico vive
no DB (CHECK + RPC) · UI lê DTO e renderiza.

---

## 7. Ordem recomendada de portabilidade

### Prioridade 1 · Fechar gaps críticos (próxima janela)

1. **CRM_PHASE_2AUX.2** · Professional FK + Lead support no wizard
   - Sem provider · sem WhatsApp · fix de FK integridade
   - Pré-req para qualquer relatório por profissional

2. **CRM_PHASE_2ALEXA.1** · Polish AlertBell + som local
   - Ganho UX imediato · zero risco
   - Reuso do `appointment_internal_alerts` (mig 161)

### Prioridade 2 · Portar/recriar módulos úteis

3. **CRM_PHASE_LEGACY.PORT.DASHBOARDS** · SDR funil + financeiro-reports
   - SQL canônico já existe · render React
   - Sem provider externo

4. **CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER** · Template builder de anamnese
   - Anamnese clínica já entrega · faltam templates customizáveis

5. **CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN** · CRUD procedimentos
   - Hoje só read · admin precisa CRUD UI

6. **CRM_PHASE_LEGACY.PORT.PRONTUARIO** · Detalhe clínico do paciente
   - Histórico + anamneses + documentos

### Prioridade 3 · Refinements visuais

7. **CRM_PHASE_2ALEXA.2** · Painel-TV recepção (`/recepcao/painel`)
8. **CRM_PHASE_LEGACY.PORT.SDR_DASHBOARD** · Detalhe + thresholds editáveis
9. **CRM_PHASE_LEGACY.PORT.TAGS_KANBAN** · Kanban personalizado por phase
10. **CRM_PHASE_LEGACY.PORT.BIRTHDAYS** · Calendário + automations (BLOQUEADO até unban)

### Prioridade 4 · Cleanup & control

11. **CRM_PHASE_CONTROL.1** · Audit final · drop zumbis · audit pg_proc · audit cron · audit RLS

### Bloqueados (não tocar antes de unban Meta)

- Broadcast WhatsApp real
- Birthday automations envio
- Alexa real preflight + canary (2ALEXA.3+)
- Conversas envio outbound real

---

## 8. O que fazer antes de CONTROL.1

Pré-requisitos para CONTROL.1 (audit final):

| Pré-req | Status atual | Comentário |
|---|---|---|
| Worker 71 OFF | ✅ | mantido |
| Status canônicos enforcement | ✅ | `invalid_appointment_status_count=0` |
| `phase='perdido'` zero | ✅ | `phase_perdido_count=0` |
| Core contracts ready | ✅ | 9 views/RPCs presentes |
| Recovery workflow live | ✅ | 2RC.1 PASS |
| Internal alerts live | ✅ | 2G mig 161 PASS |
| FK profissional consistente | 🟡 | depende de **2AUX.2** |
| Zumbi pg_proc cleanup | 🔴 | 18 funções para audit · candidato a drop CONTROL.1 |
| Alexa zumbi DB cleanup | 🔴 | 9 RPCs · candidato a drop CONTROL.1 |
| 1 port crítico v2 | 🟡 | recomenda 2AUX.2 OU LEGACY.PORT.DASHBOARDS antes |

**Conclusão:** CONTROL.1 pode rodar depois de 2AUX.2 + (pelo menos 1)
LEGACY.PORT.*. Não precisa rodar todos os ports antes · só fechar o
profissional FK gap e um port que valide o padrão.

---

## 9. Veredito

V2 cobre **toda a coluna vertebral CRM-Agenda** (status canônicos,
finalização, recuperação, alertas internos, conversas read-only). Os
**ports remanescentes são auxiliares** (analytics, builder de anamnese,
prontuário detalhado, tags/kanban). O CONTROL.1 fica bem posicionado
depois de 2AUX.2 + 1 port crítico.

Audit SQL final:
```json
{
  "worker71_off": true,
  "invalid_appointment_status_count": 0,
  "phase_perdido_count": 0,
  "core_contracts_ready": true,
  "zumbi_function_count": 18,
  "alexa_rpcs_dormant": 9,
  "unsafe_outbox_count": 0,
  "can_open_control_audit_after_port_plan": true
}
```

Próximas decisões em [`89-next-prompt-after-legacy-ui-audit.md`](89-next-prompt-after-legacy-ui-audit.md).
