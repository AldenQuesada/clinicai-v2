# Leads Full Face · Partial Visual Deploy

**Status:** LEADS_FULLFACE_PARTIAL_VISUAL_DEPLOY ⚠️
**Data:** 2026-05-19
**Branch:** `crm/functional-1x1-leads-first-audit`
**Não é:** `LEADS_1X1_COMPLETE`

Esse deploy entrega **estrutura modal + correções canônicas** sobre a página `/leads` e `/crm/leads`. Visual completo, conteúdo real das tabs, theme light purple, tabela legacy e novo lead 25+ campos **ainda pendentes** nos próximos prompts.

## O que foi entregue neste deploy

### Comportamento
- **Click row** na tabela abre `LeadDetailModalStub` (modal) · NÃO navega para `/leads/[id]` mais
- **Botão lápis (Editar)** abre o mesmo modal · consistência com row click
- **Botão Calendar (Agendar)** abre `ScheduleFromLeadModalStub` (modal) · não redireciona direto
- Rota `/leads/[id]` MANTIDA para deep-link compartilhável (não é o comportamento primário)
- Schedule modal tem botão fallback "Continuar no agendamento completo →" que ainda navega para `/crm/agenda/novo?leadId=...` — único caminho funcional pra agendar de verdade neste prompt

### Modal de detalhe (`LeadDetailModalStub`)
- **Sidebar vertical 172px** à esquerda · 10 tabs na ordem exata do legacy
- Tabs: Geral · Clínico · Anamnese · Evolução · Financeiro · Linha do Tempo · Documentos · Orçamentos · Interações · Protocolos
- Header com nome do lead + telefone + WhatsApp link + email
- ESC fecha · click fora fecha · ARIA props
- **Conteúdo da tab Geral:** 2 cards · Identificação (Nome/Telefone/Email/CPF) + Pipeline (Funnel/Fase/Lifecycle/Temperatura/Score)
- **9 outras tabs:** empty state honesto "Conteúdo será portado do legacy no próximo prompt"

### Modal Schedule (`ScheduleFromLeadModalStub`)
- Title "Agendar — {nome do lead}"
- 6 campos visuais (Profissional / Procedimento / Data / Hora / Duração / Observações) · todos `disabled`
- Texto explicativo "Submissão inline será habilitada no próximo prompt"
- Botão **fallback explícito** "Continuar no agendamento completo →" navega para `/crm/agenda/novo?leadId=...`

### Botões superiores
- **Importar Planilha** (novo · só visual): verde `#16a34a` com border + ícone planilha SVG · `disabled` · tooltip "próximo prompt"
- **Exportar:** botão mantido (CSV direto · sem dropdown CSV/PDF ainda)
- **Novo Lead:** trocou para gradient roxo legacy `linear-gradient(135deg, #7C3AED, #5B21B6)` + box-shadow

### Microcopy alinhado ao legacy
- `/leads` (authed): título `<>Leads</>` (era "Lista de leads") · lede "Gerencie e acompanhe seus leads por fase."
- `/crm/leads`: description "Gerencie e acompanhe seus leads por fase."
- Search placeholder: "Buscar por nome ou telefone..." (era "...nome, telefone ou email...")
- DeleteModal: "permanente e irreversível"

### ActiveBadge corrigido (canon)
- Antes (2A errado): `ActiveBadge` clickable usando `softDeleteLeadAction`/`restoreLeadAction` como Toggle Ativo
- Agora: `<span>` readonly com `cursor: help` + tooltip "Ativo/Inativo será ligado via lifecycle_status canônico. Não usa exclusão."
- `isActive` derivado de `lifecycleStatus === 'ativo'` · NÃO de `!deletedAt`

## O que foi REMOVIDO do 2A errado

| Item removido | Razão |
|---|---|
| `ToggleActiveModal` function (90 lines) | Tratava `deleted_at` como estado Ativo/Inativo · canon errado |
| `confirmToggleActive` state + handler | Idem |
| Import `restoreLeadAction` em `LeadsClient.tsx` | Não usar como toggle |
| `ActiveBadge` envolto em `<button>` | Idem |
| `onAgendar={() => router.push('/crm/agenda/novo?leadId=...')}` no LeadRow callsite | Schedule redirect como paridade = WRONG |
| Comentário "v2 usa deleted_at como canal de desativação" | Documentava uso errado |

## Confirmações canônicas

| Verificação | Status |
|---|---|
| `deleted_at` NÃO é usado como ativo/inativo | ✓ confirmado · `isActive` deriva de `lifecycleStatus` |
| `softDeleteLeadAction`/`restoreLeadAction` NÃO são Toggle Ativo | ✓ só usados em DeleteModal real e em `/leads/[id]/LeadActions.tsx` (rota detail · ações distintas Deletar/Restaurar) |
| Modal é primário · rota `/leads/[id]` é deep-link | ✓ click row + lápis abrem modal · rota mantida só para URL compartilhável |
| Schedule modal é primário · redirect é fallback explícito | ✓ botão Calendar abre `ScheduleFromLeadModalStub` · redirect só dentro de "Continuar no agendamento completo →" |
| Canon Phase 1C preservado | ✓ zero `phase IN ('compareceu','perdido','reagendado')` runtime |
| Zero WhatsApp/provider/cron novo em runtime | ✓ scan limpo |

## Cobertura atual da spec (17 componentes)

| # | Componente | Status |
|---|---|---|
| 1 | Container raiz | PARTIAL (b2b dark theme · light theme pendente) |
| 2 | Header (page-title) | PARTIAL |
| 3 | Botão Importar Planilha | PARTIAL (visual literal · disabled · service não portado) |
| 4 | Botão Exportar + dropdown | PARTIAL (botão sim · dropdown CSV/PDF MISSING) |
| 5 | Botão Novo Lead | **MATCH** (gradient roxo legacy aplicado) |
| 6 | Toggle view | PARTIAL |
| 7 | Count badges | PARTIAL (cores OK · ícone Thermometer ≠ chama) |
| 8 | Filtros linha 1 | PARTIAL (placeholder MATCH) |
| 9 | Filtros linha 2 estratégico | PARTIAL (sem fundo roxo claro inline) |
| 10 | Tabela 7 colunas | DIVERGENT (v2 grid 8 cols vs tabela 7 cols) |
| 11 | Tabela linha · click row → MODAL | **MATCH ESTRUTURAL** |
| 12 | Botão Carregar mais leads | MISSING (v2 usa paginação Anterior/Próxima) |
| 13 | Lead Card Kanban | MISSING |
| 14 | Kanban columns | MISSING |
| 15 | **Modal de detalhe 10 tabs** | **MATCH ESTRUTURAL** (sidebar 172px · 10 tabs ordem literal · 1/10 preenchida) |
| 16 | Modais segurança | PARTIAL (DeleteModal MATCH · ScheduleStub presente · ToggleActiveModal removido) |
| 17 | Subelementos detalhe | MISSING |

## Itens ainda pendentes (próximos prompts)

| Item | Prioridade |
|---|---|
| Full Face light theme completo (fundo branco · purple `#7C3AED` · sem b2b dark vars) | P0 visual |
| Tabela 7 colunas literal (vs grid 8 cols atual) | P1 |
| Load more 50 + sessionStorage offset (vs paginação Anterior/Próxima) | P1 |
| Export dropdown CSV/PDF (vs botão CSV direto) | P2 |
| Importar Planilha real (`SheetsImportService` portado) | P1 |
| Schedule Modal funcional completo (carrega profissionais · submete `createAppointmentAction`) | P0 |
| NewLeadModal 25+ campos (3 etapas legacy) | P0 |
| Conteúdo real das 9 tabs vazias do detail modal | P0 |
| Lead Card / Kanban view inline | P1 |
| Action canônica `setLeadLifecycleStatusAction` + UI ActiveBadge clicável | P0 |
| Ícones SVG individuais nas 10 tabs | P2 |
| Pre-filtro `funnel='fullface'` em `/crm/leads` ou rotas separadas | P1 |
| E2E + smoke final | P1 |

## Próxima etapa

**Continuar Leads · NÃO iniciar Agenda.**

Próximo GO sugerido:
**`GO CRM_FUNCTIONAL_1X1_LEADS_FULLFACE_FINALIZE_PROMPT3`** →
- Theme conversion (light + purple)
- 4 tabs prioritárias com conteúdo real (Linha do Tempo · Financeiro · Anamnese · Orçamentos)
- Schedule Modal funcional
- Action `setLeadLifecycleStatusAction` + UI Toggle Ativo
- NewLeadModal expansão 25+ campos
- Tabela legacy 7 colunas + load more
