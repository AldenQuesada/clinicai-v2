# LEADS · 1×1 UIX Audit · Legacy ↔ v2

**Status:** PARTIAL_LEADS_1X1_AUDIT_BLOCKED ⚠️
**Data:** 2026-05-18
**Branch:** `crm/functional-1x1-leads-first-audit`
**Methodology:** graph-first (após reparo)
**Regra inegociável:** legacy clinic-dashboard é a referência canônica de UIX/funcionalidade.

## Reparo metodológico (declaração honesta)

Auditoria inicial fez raw read direto via Explore agents · violou regra inviolável do CLAUDE.md ("ANTES de qualquer Read em arquivo deste repo, consultar o grafo"). Após questionamento do usuário, refeito com:

1. **Legacy graph** (`Documents/clinic-dashboard/graphify-out/`) · 10191 nodes · 848 communities · consultado wiki entry index + páginas `leads.md`, `leads.js.md`, `lead-modal.js.md`, `lead-card.js.md`
2. **V2 graph** (`Documents/clinicai-v2/graphify-out/`) · 1917 nodes · 358 communities · consultado wiki entry index + `LeadRepository.md`, `LeadDetailClient.tsx.md`, `LeadFiltersPanel.tsx.md`, `lead.schemas.ts.md`
3. **Reading cirúrgico raw** apenas em arquivos legacy onde o grafo apontou função-chave (`lead-modal.js` tab nav block) e em v2 apps/lara onde CLAUDE.md explicita "apps/lara tem AST mas NÃO tem semantic layer ainda"

**Achado mais grave que o raw-read perdeu:** lead-modal.js legacy tem **10 tabs** (Geral · Clínico · Anamnese · Evolução · Financeiro · Linha do Tempo · Documentos · Orçamentos · Interações · Protocolos) e o agent raw reportou apenas 4. O grafo entregou as 10 funções `_lmTabXxx()` em segundos.

Lição internalizada: sempre grafo primeiro.

## LEADS_1×1_AUDIT_MATRIX

### Categoria A · Layout / UIX

| Item | Legacy existe? | Legacy local | Legacy comportamento | v2 existe? | v2 local | v2 comportamento | Status | Severidade | Patch |
|---|---|---|---|---|---|---|---|---|---|
| Título da página | ✓ | `index.html` seção `page-leads-all` | "Leads" + subtítulo "Gerencie e acompanhe seus leads por fase" | ✓ | `(authed)/leads/page.tsx` + `crm/leads/page.tsx` | "Lista de leads" (authed) ou "Leads" (CRM) · subtítulo "Pessoas em contato com a clínica · filtros, KPIs reativos e ações por linha." | **WRONG** | **P1** | igualar título "Leads" + subtítulo "Gerencie e acompanhe seus leads por fase" |
| Header layout | ✓ | `.page-title-row` flex | título à esquerda · botão "Novo Lead" à direita | ✓ | `<PageHero>` ou `<PageHeader>` | hero com kicker · botões Export+Novo lead à direita | **PARTIAL** | P2 | manter mas alinhar microcopy |
| Toggle visualização | ✓ | botão Tabela / 7 Dias / Evolução | toggle inline na página · `.sdr-pipeline-toggle` | ✗ | — | NÃO existe na `/leads` v2 · usuário precisa ir em `/crm/kanban` ou `/crm/kanban/seven-days` separados | **MISSING** | **P0** | adicionar toggle inline ou link visível |
| Posição dos blocos | ✓ | header → toggle+KPI → filtros → tabela/kanban → "Carregar mais" | linear vertical · KPI badge perto do toggle | ✓ | hero → KPIs (5 cards) → sticky filter panel → grid lista → paginação anterior/próxima | **PARTIAL** | P1 | alinhar layout (KPIs perto do toggle no legacy) |
| Densidade visual | ✓ | tabela densa · linhas baixas (~36px) | — | ✓ | grid com avatar 32px + sub-row phone · linhas mais altas (~60-70px) | — | **PARTIAL** | P2 | revisar densidade |
| Estados vazios | ✓ | "Nenhum lead encontrado" (colspan 7) · cinza | — | ✓ | "Nenhum lead encontrado · ajuste os filtros ou aguarde novos contatos." (classe `b2b-empty`) | **PARTIAL** | P2 | igualar microcopy curto do legacy |
| Loading state | ✓ | skeleton `.sk .sk-line` várias larguras (sk-w80/60/40) | — | ✓ | Suspense aninhado · sem skeleton visível observado | **PARTIAL** | P2 | adicionar skeleton igual legacy |
| Erro state | ✓ | inline em modais (border red + texto) | — | ✓ | toast tone `'err'` (red bg) | **PARTIAL** | P2 | consistência |
| Responsividade | NEEDS_INSPECTION | css legacy não verificado | — | ✓ | grid Tailwind 4 · sem confirmação mobile | **NEEDS_INSPECTION** | P2 | testar mobile |

### Categoria B · Cards / KPIs

| Item | Legacy existe? | Legacy local | Legacy comportamento | v2 existe? | v2 local | v2 comportamento | Status | Severidade | Patch |
|---|---|---|---|---|---|---|---|---|---|
| KPI "Total" | ✓ | `leadsStat_total` | número grande · label "leads" minúsculo · cor #111 | ✗ | — | NÃO existe | **MISSING** | **P0** | adicionar |
| KPI "Quente" | ✓ | `leadsStat_hot` | número + ícone chama vermelha 🔴 · color #ef4444 · bg #FEF2F2 | ✗ | — | NÃO existe (v2 tem "Sem resposta 24h" no lugar) | **MISSING** | **P0** | adicionar |
| KPI "Morno" | ✓ | `leadsStat_warm` | número + chama laranja 🟡 · #f59e0b · bg #FFFBEB | ✗ | — | NÃO existe | **MISSING** | **P0** | adicionar |
| KPI "Frio" | ✓ | `leadsStat_cold` | número + chama azul 🔵 · #60a5fa · bg #EFF6FF | ✗ | — | NÃO existe | **MISSING** | **P0** | adicionar |
| KPI "Ativos" | ✗ | — | — | ✓ | `KpiCards.tsx` · Sparkles icon | leads não soft-deleted | **EXTRA_NOT_IN_LEGACY** | P2 | discutir manter |
| KPI "Novos hoje" | ✗ | — | — | ✓ | `KpiCards.tsx` · UserPlus2 icon | criados desde 00:00 UTC | **EXTRA_NOT_IN_LEGACY** | P2 | discutir manter |
| KPI "Sem resposta 24h" | ✗ | — | — | ✓ | `KpiCards.tsx` · MessageSquareWarning | `last_response_at < now-24h` ou NULL | **EXTRA_NOT_IN_LEGACY** | P2 | discutir manter |
| KPI "Orçamentos abertos" | ✗ | — | — | ✓ | `KpiCards.tsx` · FileText | sum status não-terminal | **EXTRA_NOT_IN_LEGACY** | P2 | discutir manter |
| KPI "Transbordados" | ✗ | — | — | ✓ | `KpiCards.tsx` · AlertCircle | leads com tag `transbordo_humano` | **EXTRA_NOT_IN_LEGACY** | P2 | discutir manter |
| KPI visibilidade | ✓ | só aparece na view "Tabela" | oculto em 7 Dias/Evolução | ✓ | aparece em todas as views (v2 só tem uma view) | — | **PARTIAL** | P2 | OK |

**Veredito B:** divergência total · v2 trocou KPIs de temperatura (cor de pipeline emocional) por KPIs operacionais. Decisão arquitetural válida MAS quebra paridade UIX 1×1 com legacy. **Recomendação:** restaurar 4 KPIs legacy E manter 5 v2 (= 9 cards total · primeira fileira temperatura · segunda fileira operacionais).

### Categoria C · Filtros e busca

| Item | Legacy existe? | Legacy local | Legacy comportamento | v2 existe? | v2 local | v2 comportamento | Status | Severidade | Patch |
|---|---|---|---|---|---|---|---|---|---|
| Busca por nome/telefone | ✓ | input text · `leadsOnSearch()` | placeholder "Buscar por nome ou telefone..." · oninput dispara `loadLeads()` | ✓ | `LeadFiltersPanel.tsx` · URL `?q=` | placeholder "Buscar por nome, telefone ou email..." · debounce 300ms | **PARTIAL** | **P1** | igualar placeholder (legacy curto) · debounce já OK |
| Filtro de período | ✓ | botões pill Todos/Hoje/Semana/Mês/Período · `.ao-period-bar` | "Período" abre date range custom · botão "Aplicar" | ✓ | tabs 5 opções (all/today/week/month/custom) · URL `?period=` | sem botão "Aplicar" explícito · re-fetch imediato no change | **PARTIAL** | P1 | adicionar microcopy legacy + botão "Aplicar" no custom |
| Filtro de temperatura | ✓ | select 4 opções (Todas/Quente/Morno/Frio) · `leadsOnTempFilter()` | onchange dispara loadLeads | ✓ | select URL `?temp=` | onchange imediato | **MATCH** | — | OK |
| Filtro de tags | ✓ | select dinâmico (preenchido via `_leadsLoadTagsFilter()`) · onchange `leadsOnTagFilter()` | — | ✓ | select URL `?tag=` | **PAUSADO** em Lote 2 P0.2 (2026-05-17) · UI livre tags removida | **PARTIAL** | **P1** | (TAGS PAUSADAS · esperar decisão arquitetural · documentar) |
| Filtro de queixas | ✗ | (queixas exibidas em coluna mas não filtram) | — | ✓ | select URL `?queixa=` · queixas do recordset atual | **EXTRA_NOT_IN_LEGACY** | P2 | manter (melhoria) |
| Filtro de origem | NEEDS_INSPECTION | provável em legacy (campo `lead.source` existe) | — | ✗ | server filtra `?source=` mas sem UI select visível | **MISSING_UI** | **P0** | adicionar select UI |
| Filtro de status (ativo/pacientes/perdidos) | NEEDS_INSPECTION | toggles inline · `is_active` | — | ✗ | server filtra `?status=active` (default) mas sem UI select | **MISSING_UI** | **P0** | adicionar select UI (ativo / pacientes / perdidos / todos) |
| Filtro de responsável | NEEDS_INSPECTION | — | — | ✗ | — | NÃO existe | **MISSING_UI** | P2 | adicionar se legacy tinha |
| Filtro de "sem resposta" dias | ✗ | — | — | ✓ | server `?no_resp_days=N` sem UI | **EXTRA_NOT_IN_LEGACY** | P2 | OK · v2 melhor |
| Limpar filtros | ✓ | implícito ao mudar de view | — | ✓ | clear via `null` URL param · X button na busca | **MATCH** | — | OK |
| Persistência | parcial | sessionStorage implícito (`_leadsPeriod`) | — | ✓ | URL params (back/forward funciona) · sem localStorage | **PARTIAL** | P2 | v2 melhor (URL stateful) |

### Categoria D · Lista / Tabela

| Item | Legacy existe? | Legacy local | Legacy comportamento | v2 existe? | v2 local | v2 comportamento | Status | Severidade | Patch |
|---|---|---|---|---|---|---|---|---|---|
| Tipo de layout | ✓ | tabela HTML pura · 7 colunas | — | ✓ | grid CSS (`display: grid`) · 8 colunas (com checkbox bulk) | **WRONG** (estrutura diferente) | P2 | aceitar grid mas alinhar UX |
| Coluna # (índice) | ✓ | rowIdx + 1 | — | ✓ | `(page-1)*pageSize + idx + 1` | **MATCH** | — | OK |
| Coluna Nome | ✓ | nome + telefone formatado (com botão WhatsApp inline) | — | ✓ | avatar 32px + nome + telefone + WhatsApp link verde | **PARTIAL** | P2 | legacy sem avatar · v2 tem · v2 melhor (manter) |
| Coluna Temperatura | ✓ | `.lt-temp-badge` clicável · popover para trocar | — | ✓ | TempPill readonly | **PARTIAL** | **P1** | adicionar popover clicável para trocar inline |
| Coluna Tags | ✓ | badges + botão "+" → popover gerenciar | — | ✓ | chips até 3 + "+N" · SEM botão de gerenciar (tags pausadas) | **PARTIAL** | **P1** | (tags pausadas globalmente) |
| Coluna Queixas | ✓ | texto truncado 2 linhas (WebkitLineClamp) | — | ✓ | mesmo padrão WebkitLineClamp 2 | **MATCH** | — | OK |
| Coluna Ativo (toggle) | ✓ | `<input type="checkbox" class="lt-toggle">` · clica abre modal confirm | abre modal "Ativar lead"/"Desativar lead" · confirma + RPC `leads.update({is_active})` | ✓ | ActiveBadge `readonly` (Ativo/Inativo) | **WRONG** (perdeu funcionalidade) | **P0** | restaurar toggle clicável com modal confirm |
| Coluna Ações | ✓ | 3 botões: Agendar (calendar icon), Editar (pencil), Deletar (trash) | — | ✓ | 2 botões: Edit (Edit3), Delete (Trash2) · SEM botão Agendar | **WRONG** (perdeu Agendar) | **P0** | restaurar botão Agendar → modal schedule |
| Checkbox bulk | ✗ | — | — | ✓ | col 1 · 36px · seleção múltipla | **EXTRA_NOT_IN_LEGACY** | P2 | manter (melhoria operacional) |
| Ordenação | ✗ | sem clicáveis · DESC by created_at default | — | ✗ | sem clicáveis · provável DESC by created_at | **MATCH** | — | OK |
| Paginação | ✓ | "Carregar mais N leads" botão (offset += pageSize) | append mais 50 abaixo | ✓ | botões "Anterior" / "Próxima" · estado URL `?page=N` | **WRONG** (legacy é load more · v2 é página) | **P1** | trocar para "Carregar mais" ou manter mas adicionar load more como alternativa |
| Telefone formatado | ✓ | `(XX) XXXXX-XXXX` ou `(XX) XXXX-XXXX` | — | ✓ | mesma formatação BR | **MATCH** | — | OK |
| WhatsApp link | ✓ | `https://wa.me/[55+digits]` em nova aba | — | ✓ | `https://wa.me/{phoneDigits}` (prefix 55 se ≤11 dígitos) · target=_blank | **MATCH** | — | OK |
| Clique na linha | NEEDS_INSPECTION | provavelmente abre detalhe inline | — | ✓ | router.push(`/leads/{id}`) → rota separada | **WRONG** (legacy é modal · v2 é página) | **P1** | discutir: rota dedicada (v2) vs modal (legacy) · escolha arquitetural |
| Kanban view | ✓ | toggle inline · 7-day/Evolução | render `lead-card.js` em colunas | ✗ | redireciona para `/crm/kanban` separado | **MISSING_INLINE** | P1 | adicionar toggle ou link visível |

### Categoria E · Ações principais (toolbar)

| Item | Legacy existe? | Legacy local | Legacy comportamento | v2 existe? | v2 local | v2 comportamento | Status | Severidade | Patch |
|---|---|---|---|---|---|---|---|---|---|
| Botão "Novo Lead" | ✓ | header superior direito · `showNewPatientModal()` | abre modal 3 etapas · ícone plus | ✓ | header toolbar · `setShowNewLead(true)` → NewLeadModal | **MATCH** posição/label | — | OK |
| Botão Exportar | ✗ | — | — | ✓ | toolbar · CSV client-side | **EXTRA_NOT_IN_LEGACY** | P2 | manter (melhoria) |
| Botão "Carregar mais" | ✓ | abaixo tabela · "Carregar mais N leads" | offset increment | ✗ | — (v2 usa paginação) | **MISSING** | P1 | (ver Paginação acima) |
| Bulk action bar | ✗ | — | — | ✓ | banner sticky quando seleção · "Mudar fase" + "Marcar perdido" | **EXTRA_NOT_IN_LEGACY** | P2 | manter (melhoria) |

### Categoria F · Modais

#### F1 · Modal Novo Lead

| Aspecto | Legacy | v2 | Status | Severidade |
|---|---|---|---|---|
| Estrutura | 3 etapas (Dados Pessoais / Endereço+Origem / Dados Clínicos) | 3 steps (Identificação / Origem+Qualificação / Operação+Notas) | **PARTIAL** | **P0** |
| Step 1 campos | Nome*, Sobrenome*, Sexo* (toggle), CPF*, Telefone*, Email, Data nasc., RG, Profissão, Status inicial (select) | Nome*, Telefone*, Email, CPF, Data nasc. | **MISSING** Sobrenome, Sexo, RG, Profissão, Status inicial | **P0** |
| Step 1 placeholders | "Ex: Ana Carolina" / "Ex: Silva" / "000.000.000-00" / "(11) 99999-9999" | sem placeholders explícitos vistos | **PARTIAL** | P1 |
| Step 2 campos | CEP, Rua, Número, Complemento, Bairro, Cidade, Estado (UF 27), Canal origem*, Indicado por (parceiro VPI), Campanha/UTM | Source, Source Type, Funnel, Temperature, Score | **WRONG** completamente diferente | **P0** |
| Step 3 campos | Procedimento de interesse, Valor estimado, Duração consulta, Lead Score 0-100, Prioridade (Normal/Alta/VIP), Queixa principal, Expectativas, Observações internas | Notas (textarea) | **MISSING** procedimento/valor/duração/prioridade/queixa/expectativas | **P0** |
| Validação CPF/RG duplicidade | ✓ assíncrono via `npCheckDuplicateDoc()` (Supabase + fallback localStorage) | ✓ `lookupLeadByPhoneAction()` apenas por telefone | **PARTIAL** | **P0** |
| Botões | Voltar / Próximo / Cadastrar (gradient verde checkmark) | Cancelar / Voltar / Próximo / Criar lead | **PARTIAL** | P2 |
| Indicador etapa | 3 dots numerados (1./2./3.) | provavelmente similar | **NEEDS_INSPECTION** | P2 |

**Veredito F1:** WIZARD V2 É RUDIMENTAR vs LEGACY · perde >20 campos críticos (sobrenome, sexo, RG, profissão, endereço completo 7 campos, parceiro VPI indicação, campanha UTM, procedimento interesse, valor, duração, prioridade VIP, queixa principal, expectativas, observações internas). **P0 absoluto.**

#### F2 · Modal Detalhe Lead

| Aspecto | Legacy | v2 | Status | Severidade |
|---|---|---|---|---|
| Tipo | modal (showLeadModal) | rota separada `/leads/[id]` | **WRONG** arquitetura | **P1** |
| Sidebar nav | sim · vertical | tabs horizontais (5) | **PARTIAL** | P2 |
| **NÚMERO DE TABS** | **10** (Geral · Clínico · Anamnese · Evolução · Financeiro · Linha do Tempo · Documentos · Orçamentos · Interações · Protocolos) | **5** (Info · Conversa · Histórico · Tags & Pipeline · Ações) | **MISSING 6 tabs** | **P0** |
| Tab Geral | ✓ `_lmTabGeral()` · async · ComplaintsPanel embed | InfoTab parcial | **PARTIAL** | **P0** |
| Tab Clínico | ✓ `_lmTabClinico()` · dados clínicos (`cf.anamnese` campos) | ✗ NÃO EXISTE | **MISSING** | **P0** |
| Tab Anamnese | ✓ `_lmTabAnamnese()` · digital section + form completo | embed em `_clinical-panel` da agenda, NÃO em /leads | **MISSING** em /leads | **P0** |
| Tab Evolução | ✓ `_lmTabEvolucao()` · appointments ordenados DESC + WOW #5 SOAP + #6 Prescrição | ✗ NÃO EXISTE | **MISSING** | **P0** |
| Tab Financeiro | ✓ `_lmTabFinanceiro()` · WOW #7 gráfico financeiro + budget badge refresh + comanda detail | ✗ NÃO EXISTE | **MISSING** | **P0** |
| Tab Linha do Tempo | ✓ `_lmTabTimeline()` · appts + cronologia + WOW timeline luxury · localStorage `clinicai_appointments` | ✓ HistoricoTab (phase_history apenas) | **PARTIAL** (legacy mais rico) | **P1** |
| Tab Documentos | ✓ `_lmTabDocumentos()` · "Solicitar documento" botão + `_lmLoadDocumentos()` | ✗ NÃO EXISTE | **MISSING** | **P0** |
| Tab Orçamentos | ✓ tab dedicada · CRUD inline (showBudgetModal, saveBudget, removeBudget) + badge refresh | InfoTab seção orçamentos read-only filtrado open | **PARTIAL** | **P0** |
| Tab Interações | ✓ histórico de touchpoints | ✓ ConversaTab (link/iframe `/conversas?lead={id}`) | **PARTIAL** | **P1** |
| Tab Protocolos | ✓ Default (3M/6M/1A com Botox/Bioestimulador/Fotona) + Custom (adicionar/remover) | ✗ NÃO EXISTE | **MISSING** | **P0** |
| Header detalhe | nome + phone | avatar 64px + nome (em em) + meta (phone/email/created/score) + pills (funnel/phase/temp/AI persona) | **PARTIAL** | P2 |
| Botão WhatsApp | dentro do detalhe legacy | ✓ no header detalhe v2 | **MATCH** | — |
| Botão Editar | inline (campos editáveis) | LeadEditDrawer side panel | **PARTIAL** | P2 |
| Botão Imprimir | NEEDS_INSPECTION (`_lmGenerateAnamneseLink`) | ✗ NÃO EXISTE | **MISSING** | P1 |

**Veredito F2:** **6 tabs faltam em v2** (Clínico, Anamnese inline, Evolução, Financeiro, Documentos, Protocolos). Esta é a perda funcional MAIS GRAVE da auditoria · sem essas tabs, a secretária precisa sair de /leads e ir em outras rotas (agenda, prontuário) para ver dados clínicos do lead. **P0 absoluto.**

#### F3 · Modal Agendar a partir do lead

| Aspecto | Legacy | v2 | Status | Severidade |
|---|---|---|---|---|
| Acesso | botão Agendar na linha da tabela | ✗ NÃO EXISTE em /leads | **MISSING** | **P0** |
| Modal | `leadsActionSchedule()` → schedule-modal.js | — | — | — |
| Campos | Profissional select, Procedimento, Data, Hora início, Duração, Observações | — | — | — |
| RPC | `appt_upsert(p_data: payload)` com `origem='sdr_table'` | — | — | — |
| Validação | data obrigatória / hora / procedimento | — | — | — |

**Veredito F3:** v2 NÃO TEM agendar-a-partir-do-lead inline. Staff precisa: 1) ir para `/crm/agenda/novo`, 2) pickar o lead pelo lead-picker. Perda funcional grave. **P0**.

#### F4 · Modal Toggle Ativo

| Aspecto | Legacy | v2 | Status | Severidade |
|---|---|---|---|---|
| Acesso | toggle na linha (lt-toggle) | ✗ badge readonly | **MISSING** | **P0** |
| Modal confirm | "Deseja ativar/desativar [name]?" · botão Confirmar (verde/laranja) | — | — | — |
| RPC | `leads.update({is_active}).eq('id', leadId)` | — | — | — |

**Veredito F4:** v2 NÃO PERMITE ativar/desativar lead a partir da lista. **P0**.

#### F5 · Modal Deletar Lead

| Aspecto | Legacy | v2 | Status | Severidade |
|---|---|---|---|---|
| Acesso | botão trash na linha | ✓ botão Delete na linha (Trash2) | **MATCH** | — |
| Modal | "Deletar lead" · "permanente e irreversivel" · digitar nome exato | "Esta ação é permanente (soft-delete · pode ser restaurado por admin)" · digitar nome exato | **MATCH** (microcopy difere) | P2 |
| Validação | onchange compara `=== leadName.trim()` | mesmo padrão | **MATCH** | — |
| RPC | `leads.update({deleted_at}).eq('id', leadId)` (soft delete) | `softDeleteLeadAction` | **MATCH** | — |

**Veredito F5:** ✅ paridade boa · microcopy difere mas funcionalidade igual.

### Categoria G · Regras de negócio

| Regra | Legacy | v2 | Status | Severidade |
|---|---|---|---|---|
| Phases canônicas | 6+ ({agendado, reagendado, compareceu, perdido, paciente, orcamento}) | 4 ({lead, agendado, paciente, orcamento}) + lifecycle separado | **WRONG** (legacy) · v2 canon correto Phase 1C | N/A · não copiar legacy aqui |
| `lifecycle_status` | inexistente (tudo via phase) | {ativo, perdido, recuperacao, arquivado} | **EXTRA** v2 melhor | — |
| Marcar perdido | via mudança de phase → `perdido` | via `markLeadLostAction` → `lifecycle_status='perdido'` + `lost_from_phase` | **MATCH** intent · WRONG modelo (canon v2 correto) | — |
| Soft delete | `deleted_at IS NULL` filtro · restaurar | ✓ mesmo padrão · `restoreLeadAction` | **MATCH** | — |
| Soft deactivate | `is_active=false` filtra | ✓ existe schema · UI não permite toggle | **PARTIAL** (UI faltando) | **P0** |
| Duplicidade telefone | `npCheckDuplicateDoc()` async · CPF/RG | `lookupLeadByPhoneAction()` async · só telefone | **PARTIAL** | **P0** (perdeu CPF/RG check) |
| Agenda muda phase? | sim (no backend via `appt_upsert`) | sim (via `scheduleAppointmentAction` → `setLeadPhase('agendado')`) | **MATCH** | — |
| Converter para paciente | via finalize wizard (R3 entrega) | mesmo · via `appointment_finalize` RPC + `lead_to_paciente` | **MATCH** | — |
| Converter para orçamento | via lead-modal tab Orçamentos · `saveBudget()` · ou finalize wizard | via `appointment_finalize` outcome=orcamento + `lead_to_orcamento` | **PARTIAL** (legacy permitia criar orçamento inline · v2 só via finalize) | **P1** |
| Recuperação | toggle "perdido"→"recuperação" via flag | rota `/crm/recuperacao` separada | **PARTIAL** | P1 |

### Categoria H · Integrações internas

| Integração | Legacy | v2 | Status | Severidade |
|---|---|---|---|---|
| Lead → Agenda | botão Agendar inline na linha | ❌ ausente em /leads · só em `/crm/agenda/novo` | **MISSING** | **P0** |
| Lead → Paciente | finalize wizard | finalize wizard | **MATCH** | — |
| Lead → Orçamento | tab Orçamentos inline | rota `/crm/orcamentos` separada | **PARTIAL** | P1 |
| Lead → Recuperação | flag inline | rota `/crm/recuperacao` separada | **PARTIAL** | P1 |
| Lead → Kanban | toggle view inline | rota `/crm/kanban` separada | **PARTIAL** | P1 |
| Lead → Notificações | possível (`broadcast.ui.js`) | post-actions count badge + day-alerts-strip | **PARTIAL** | P1 |
| Lead → Post-actions | NEEDS_INSPECTION | rota `/crm/post-acoes` separada | **PARTIAL** | P2 |
| Lead → Histórico | tab Linha do Tempo + appointments | rota detalhe tab Histórico | **PARTIAL** | P1 |
| Lead → Tags | popover inline em tabela + modal | LeadTagsPanel · **PAUSADO** | **WRONG** | **P1** (depende decisão arquitetural) |

### Categoria I · Side effects externos

| Effect | Legacy | v2 | Status | Severidade |
|---|---|---|---|---|
| WhatsApp dispatch real | worker 71 + Evolution + Cloud | ✗ worker 71 OFF · zero provider em v2 | **DEFERRED_EXTERNAL** (Phase 2F) | DEFERRED |
| Webhook outbound | possível | ✗ DEFERRED | **DEFERRED_EXTERNAL** | DEFERRED |
| wa_outbox write | possível | ✗ zero write em /leads | **DEFERRED_EXTERNAL** | DEFERRED |
| Notificação topbar | possível (`broadcast.ui.js`) | wire ready · trigger automatic awaits | **DEFERRED_EXTERNAL** | P2 (Phase 2E) |
| Cron / Worker | sim (mira-cron, vpi, etc.) | ✗ zero cron em /leads CRM track | **DEFERRED_EXTERNAL** | DEFERRED |

### Categoria J · Banco / Fonte da verdade

| Aspecto | Legacy | v2 | Status |
|---|---|---|---|
| Tabela `leads` | colunas legacy (sem lifecycle_status) | colunas canon (com lifecycle_status + lost_from_phase) | v2 canon correto |
| RPC `appt_upsert` | usado em schedule-modal | RPC v2 canônica `scheduleAppointmentAction` | v2 canon correto |
| RPC `lead_create` | criação direta via supabase-js | RPC atômica idempotente com dedup phone | v2 melhor |
| Phase history | tabela existe | mesmo · v2 lê via `phaseHistory.listByLead` | MATCH |
| RLS multi-tenant | `app_clinic_id()` JWT | mesmo padrão · canon v2 | MATCH |
| Tags table | `lead_tags` + `lead_tag_assignments` | PAUSADO (coluna `leads.tags` removida) | v2 BLOCKED_BY_DECISION |

### Categoria K · Permissões

| Permissão | Legacy | v2 | Status |
|---|---|---|---|
| Ver leads | sem RBAC granular | `patients:view` (receptionist+) | v2 melhor |
| Editar lead | sem RBAC | `patients:edit` | v2 melhor |
| Deletar lead | sem RBAC | `patients:delete` (admin/owner) | v2 melhor |
| Criar lead | sem RBAC | `patients:create` | v2 melhor |
| Recuperar | sem RBAC | gated | v2 melhor |
| Converter | sem RBAC | gated | v2 melhor |

**Veredito K:** v2 é objetivamente melhor (RBAC granular). Não copiar a ausência do legacy.

### Categoria L · Textos e microcopy

| Onde | Legacy | v2 | Status | Severidade |
|---|---|---|---|---|
| Título página | "Leads" | "Lista de leads" (authed) / "Leads" (CRM) | **WRONG** (authed) | **P1** |
| Subtítulo | "Gerencie e acompanhe seus leads por fase" | "Pessoas em contato com a clínica · filtros, KPIs reativos e ações por linha." | **WRONG** | **P1** |
| Placeholder busca | "Buscar por nome ou telefone..." | "Buscar por nome, telefone ou email..." | **WRONG** (v2 adicionou email) | **P1** |
| Empty state | "Nenhum lead encontrado" | "Nenhum lead encontrado · ajuste os filtros ou aguarde novos contatos." | **PARTIAL** | P2 |
| Confirm delete | "Esta acao e permanente e irreversivel" | "Esta ação é permanente (soft-delete · pode ser restaurado por admin)." | **WRONG** | **P1** (legacy mais simples e correto na intenção) |
| Mensagens erro novo lead | "Nome é obrigatório" / "CPF é obrigatório" etc. | "Nome obrigatório · mínimo 2 caracteres" etc. | **PARTIAL** | P2 |
| Toast sucesso novo | (implícito · modal fecha) | "Lead criado" | **EXTRA** | P2 |
| Toast sucesso edit | (implícito) | "Lead atualizado" | **EXTRA** | P2 |
| Etapas wizard | "1. Dados Pessoais / 2. Endereço e Origem / 3. Dados Clínicos" | "Identificação / Origem & qualificação / Operação & notas" | **WRONG** | **P0** |

## LEADS_PAGE_VERDICT

### MATCH_PERCENT_ESTIMATED

**~35%** funcional 1×1 com legacy.

Breakdown:
- DB/schema canon: ~95% (v2 melhor · canon Phase 1C correto)
- Backend RPCs: ~80% (parcial · falta agendar inline, toggle ativo)
- UI/UIX layout: ~25% (KPIs trocados, lista parcial, falta toggle view)
- Modal Novo Lead: ~30% (campos críticos faltando)
- Modal Detalhe Lead: ~40% (5 de 10 tabs · funcionalmente incompleto)
- Microcopy: ~40% (textos divergentes)
- Ações rápidas: ~60% (Agendar/Toggle Ativo faltam)

### P0 count: **9**

1. Toggle view (Tabela/7 Dias/Evolução) MISSING inline
2. KPIs temperatura (Total/Quente/Morno/Frio) MISSING (substituídos)
3. Coluna Ativo toggle MISSING (badge readonly)
4. Botão Agendar na linha MISSING
5. Modal Novo Lead campos críticos MISSING (sobrenome, sexo, RG, profissão, endereço, procedimento de interesse, valor, duração, prioridade, queixa principal, expectativas, observações internas, parceiro VPI)
6. Modal Detalhe Lead 6 tabs MISSING (Clínico, Anamnese inline, Evolução, Financeiro, Documentos, Protocolos)
7. Modal Agendar a partir do lead MISSING (inline)
8. Filtro origem UI MISSING
9. Filtro status UI MISSING

### P1 count: **10**

1. Filtros tags PAUSADOS (depende decisão arquitetural)
2. Placeholder busca diferente
3. Microcopy título/subtítulo/empty/confirm delete diferentes
4. Pagination tipo diferente (load more vs page)
5. Lead detail = rota (vs modal legacy)
6. Botão Imprimir MISSING
7. Tab Linha do Tempo só phase_history (sem appts)
8. Temperatura popover inline MISSING (badge readonly)
9. Lead → Orçamento inline MISSING (só via finalize)
10. Lead → Recuperação inline MISSING (rota separada)

### P2 count: **8**

1. Avatar adicionado em v2 (não em legacy)
2. Densidade linha diferente
3. Skeletons loading diferentes
4. Botão Exportar EXTRA em v2 (manter)
5. Filtro queixas EXTRA em v2 (manter)
6. Filtro no-response-days EXTRA em v2 (manter)
7. Bulk action bar EXTRA em v2 (manter)
8. Botão "Carregar mais" microcopy diferente

### can_use_v2_today_for_leads?

**PARTIAL** ⚠️

- ✅ Listagem básica funciona
- ✅ Criação básica funciona (com campos reduzidos)
- ✅ Edição via drawer funciona
- ✅ Soft delete + restore funcionam
- ✅ Marcar perdido funciona
- ✅ Transbordar funciona
- ✅ Bulk ops funcionam (P2 melhoria)
- ❌ NÃO permite agendar-a-partir-do-lead → friction enorme para secretaria
- ❌ NÃO mostra dados clínicos no detalhe (6 tabs faltam)
- ❌ NÃO permite toggle ativo na linha
- ❌ NÃO captura sobrenome/sexo/RG/profissão/endereço completo no cadastro
- ❌ NÃO captura queixa principal/expectativas/observações internas
- ❌ Falta filtro UI por origem/status
- ❌ KPIs operacionais diferentes do que staff está acostumado

**Veredito:** v2 hoje é uma "lista de leads" minimalista · legacy é "centro de comando do lead". Secretaria treinada no legacy vai sentir falta de >50% das funcionalidades.

### Biggest mismatches

1. **Detalhe Lead** · 6 tabs faltam (Clínico, Anamnese, Evolução, Financeiro, Documentos, Protocolos)
2. **Modal Novo Lead** · ~13 campos faltam
3. **Agendar a partir do lead** · funcionalidade crítica MISSING
4. **Toggle Ativo** · funcionalidade MISSING
5. **KPIs de temperatura** · MISSING (substituídos)
6. **Toggle view** · MISSING inline (kanban em rota separada)

### Patch complexity

**ALTA.** Não é apenas UI · também:
- adicionar campos no schema (ou consumir colunas já existentes)
- ressuscitar tabs com sub-componentes (Anamnese, Evolução, Financeiro, Documentos, Protocolos)
- portar `_lmTabXxx()` de vanilla JS para Next.js 16 + React 19 + TS
- decidir arquitetura: rota dedicada vs modal grande
- decidir tags arquitetural (pausadas em Lote 2 P0.2)
- decidir KPIs: restaurar 4 temperatura + 5 operacionais = 9, ou só legacy 4

### Recommended next prompt

**NOT** `READY_FOR_LEADS_PATCH_PROMPT` único · patch é grande demais.

**Dividir em 3 prompts:**

**Prompt 2A · Leads UI/layout/cards/filtros**
- Restaurar título "Leads" + subtítulo "Gerencie e acompanhe seus leads por fase"
- Restaurar 4 KPIs temperatura (Total/Quente/Morno/Frio) · manter 5 operacionais como segunda fileira
- Adicionar toggle view Tabela/7 Dias/Evolução (inline · não rota separada)
- Adicionar filtros UI: origem, status, responsável
- Restaurar coluna Ativo toggle (com modal confirm)
- Restaurar botão Agendar na linha
- Alinhar microcopy (busca placeholder, empty state, delete confirm)

**Prompt 2B · Leads modais/actions/regras**
- Expandir Modal Novo Lead para 3 etapas completas (Dados Pessoais com 10+ campos / Endereço+Origem com 8+ campos / Dados Clínicos com 8+ campos)
- Adicionar modal Agendar a partir do lead (porta schedule-modal.js legacy → React)
- Restaurar 6 tabs no detalhe (Clínico, Anamnese, Evolução, Financeiro, Documentos, Protocolos)
- Decidir arquitetura tags (P1 · pode ser fase 2)

**Prompt 2C · Leads tests/smoke/closeout**
- Adicionar E2E spec `crm-leads-1x1.spec.ts`
- Validar smoke contra legacy (visual diff)
- Closeout doc + commit + PR docs+code

## LEADS_1×1_PATCH_PLAN

### Arquivos legacy referência

| Categoria | Legacy file | Funções-chave |
|---|---|---|
| Lista | `js/leads.js` + `js/components/leads-table.js` | `loadLeads`, `renderLeadsTable`, `leadsActionSchedule`, `leadsToggleActive`, `leadsActionDelete`, `leadsActionEdit` |
| Modal Detalhe | `js/components/lead-modal.js` | `_lmTabGeral`, `_lmTabClinico`, `_lmTabAnamnese`, `_lmTabEvolucao`, `_lmTabFinanceiro`, `_lmTabTimeline`, `_lmTabDocumentos`, `_lmTabOrcamentos`, `_lmTabInteracoes`, `_lmTabProtocolos`, `_lmNav`, `_lmSwitchTab` |
| Modal Schedule | `js/components/schedule-modal.js` | `leadsActionSchedule()` · RPC `appt_upsert` |
| Modal Novo Lead | `js/patients.js` | `showNewPatientModal()`, `npGoStep`, `saveNewPatient`, `npCheckDuplicateDoc` |
| Card Kanban | `js/components/lead-card.js` | `_renderCard`, `_renderTemperatureBadge`, `_renderPriorityBadge` |
| Filtros utils | `js/utils/leads-filter.js` | `LeadsFilter.filter()` |
| Cache | `js/shared/leads-cache.js` | `ClinicLeadsCache` |
| CSS | `css/sdr.css` + `css/style.css` | `.lead-card`, `.lt-temp-badge`, `.lt-toggle`, `.lt-modal-*`, `.kanban-*`, `.ao-period-*`, `.sdr-pipeline-*` |

### Arquivos v2 alvo

| Categoria | v2 file | Mudança |
|---|---|---|
| Listagem | `apps/lara/src/app/(authed)/leads/page.tsx` + `crm/leads/page.tsx` | mudar título · subtítulo |
| Componente lista | `apps/lara/src/app/(authed)/leads/LeadsClient.tsx` | adicionar toggle view, restaurar coluna Ativo toggle, botão Agendar |
| KPIs | `apps/lara/src/app/(authed)/leads/KpiCards.tsx` | adicionar 4 KPIs temperatura (manter 5 operacionais) |
| Filtros | `apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx` | adicionar UI: origem, status, responsável |
| Modal Novo | `apps/lara/src/app/(authed)/leads/NewLeadModal.tsx` | expandir para 3 etapas completas (~25 campos) |
| Detalhe | `apps/lara/src/app/(authed)/leads/[id]/LeadDetailClient.tsx` | adicionar 6 tabs (Clínico, Anamnese, Evolução, Financeiro, Documentos, Protocolos) |
| Modal Schedule | NOVO | criar componente Schedule-from-lead modal |
| Modal Toggle Ativo | NOVO | criar componente confirm modal |
| Server actions | `apps/lara/src/app/crm/_actions/lead.actions.ts` | adicionar `setLeadActiveAction(leadId, active)`, expandir `createLeadAction` para receber 25 campos |
| Repository | `packages/repositories/src/lead.repository.ts` | adicionar `.setActive(leadId, active)` |

### Ordem de implementação

1. Microcopy (título/subtítulo/empty/placeholders) · P1 · UI only · low risk
2. KPIs restaurar 4 temperatura · P0 · UI + server query · médio
3. Filtros UI origem/status · P0 · UI + URL params · médio
4. Coluna Ativo toggle + modal confirm · P0 · UI + server action · médio
5. Botão Agendar inline + modal Schedule · P0 · UI + server action novo · alto
6. Modal Novo Lead expansion (25 campos) · P0 · UI + schema + RPC update · alto
7. 6 tabs no detalhe · P0 · UI + componentes novos · MUITO alto (maior trabalho)
8. Toggle view (Tabela/Kanban inline) · P0 · UI + state · médio-alto
9. Microcopy remanescente · P1 · low risk
10. Tags arquitetura · P1 · BLOQUEADO por decisão arquitetural separada

### Estimativa de prompts

| Prompt | Escopo | Risco |
|---|---|---|
| 2A | KPIs + filtros UI + microcopy + coluna ativo + botão agendar + paginação + toggle view | médio (~3-5 dias de desenvolvimento) |
| 2B | Novo lead wizard (25 campos) + 6 tabs detalhe | alto (~5-10 dias · cada tab é mini-componente) |
| 2C | Tests E2E + smoke + closeout | baixo (~1-2 dias) |

## Safety

- ✅ Zero migration aplicada · zero SQL mutativo · zero DB push · zero migration repair
- ✅ Zero commit neste audit
- ✅ Zero deploy
- ✅ Zero WhatsApp real · zero provider Evolution/Meta · zero Cloud API
- ✅ Worker 71 OFF preservado (`active=false`) · wa_outbox delta 0
- ✅ Zero cron novo · zero env/secrets em arquivo
- ✅ `appointment_finalize` RPC contract preservado
- ✅ Hard gate mig 167 preservado
- ✅ `appointment_attend` / `lead_to_paciente` / `lead_to_orcamento` intocados
- ✅ Canon Phase 1C preservado · invalid_phases=0
- ✅ Zero anon grants em R2/R3/view 195
- ✅ Audit conduzido em branch separada (`crm/functional-1x1-leads-first-audit`) · não tocou main

## Próximo passo

**NÃO avançar para Agenda antes de Leads patch ser aprovado.**

Aguardar GO explícito:

**`GO CRM_FUNCTIONAL_1X1_LEADS_PATCH_2A`** → executa Prompt 2A (UI/layout/KPIs/filtros/microcopy/coluna ativo/botão agendar/paginação/toggle view)

Após 2A · aguardar `GO CRM_FUNCTIONAL_1X1_LEADS_PATCH_2B` (Novo lead expansion + 6 tabs detalhe).

Após 2B · aguardar `GO CRM_FUNCTIONAL_1X1_LEADS_PATCH_2C` (tests + closeout).

**Não mergear/declarar Leads pronta sem 2A+2B+2C.**

Não iniciar Agenda audit antes desse loop fechar.

---

## REVERSÃO DO AUDIT (2026-05-18 · RESTART FROM SPEC)

### Severidade reclassificada

| Item original | Audit anterior | Reclassificado | Razão |
|---|---|---|---|
| Lead detail = rota separada `/leads/[id]` | PARTIAL P1 | **WRONG P0** | Legacy = modal (`lead-modal.js` 10 tabs · sidebar 172px). Rota separada perde contexto da tabela. UIX fundamentalmente diferente. |
| Modal Schedule | MISSING P0 (correto) | **WRONG P0** | Era classificado como redirect aceitável; é modal legacy `schedule-modal.js`. Redirect NÃO é paridade. |
| Toggle Ativo | MISSING P0 (correto) | **WRONG P0 BLOCKER** | NÃO pode ser implementado via `softDeleteLeadAction`/`restoreLeadAction`. `deleted_at` NÃO é estado operacional. Requer action canônica `setLeadLifecycleStatusAction`. |
| Detalhe Lead = 4 tabs | MISSING 6 tabs | **MISSING 6 tabs** ainda P0 mas ordem: Clínico · Anamnese · Evolução · Financeiro · Linha do Tempo · Documentos · Orçamentos · Interações · Protocolos (10 - 1 Geral preenchido = 9 stubs hoje) |

### Verdadeiro `MATCH_PERCENT_ESTIMATED` pós-restart

| Categoria | Pontos | %
|---|---|---|
| Microcopy alinhada | 5 spots | ~70% |
| Modal de detalhe (estrutural · 10 tabs sidebar) | esqueleto presente · 1/10 tabs preenchida | ~15% conteúdo |
| Modal Schedule (stub) | UI presente · disabled · fallback explícito | ~10% funcional |
| Header buttons (Importar Planilha + Novo Lead gradient) | 2 botões | ~50% |
| Light theme purple | NÃO convertido | 0% |
| Full Face funnel pre-filter | NÃO implementado | 0% |
| Load more vs paginação | NÃO convertido | 0% |

**Estimativa global pós-restart:** ~20% UIX 1×1 com legacy.

### Sequência de prompts ajustada

- **Prompt 1** ✅ audit + spec (já entregue)
- **Prompt 2A** ✅ patch parcial (microcopy · 4 files)
- **Prompt RESTART FROM SPEC** ✅ (este prompt · reverter blockers + stubs 10 tabs + Schedule Modal stub)
- **Próximo prompt:** `GO CRM_FUNCTIONAL_1X1_LEADS_FULLFACE_THEME_AND_ACTIONS` → light theme conversion + `setLeadLifecycleStatusAction` + ScheduleModal funcional (carrega profissionais + submete) + Lead Detail tabs prioritárias (Linha do Tempo · Financeiro · Anamnese · Orçamentos)
- **Prompt seguinte:** restantes 5 tabs + NewLeadModal 25+ campos + filtros estratégicos + Importar Planilha real + Exportar dropdown CSV/PDF
- **Prompt final do Round Leads:** tests E2E + smoke + commit/PR/closeout

**Não declarar Leads pronta antes da sequência completa fechar.**
