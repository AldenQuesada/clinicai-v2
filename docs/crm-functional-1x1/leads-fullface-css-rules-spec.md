# Leads Full Face · CSS Componente-por-Componente + Regras + Validações

**Origem canônica:** `Documents/clinic-dashboard/` (legacy é referência perfeita de UIX)
**Página legacy:** `#page-leads-fullface` montada via `LeadsContext.init('fullface')` em `js/leads-context.js`
**Modal de detalhe:** `js/components/lead-modal.js` (10 tabs · ABRE COMO MODAL · não rota)
**Modal Novo Lead:** `js/patients.js · showNewPatientModal()` (3 etapas)
**Modal Schedule:** `js/components/schedule-modal.js`
**CSS arquivos:** `css/sdr.css` + `css/style.css` + `css/modal-system.css`

## 🚨 Reversão de audit verdict

Audit anterior classificou "Lead detail = rota (vs modal legacy)" como **PARTIAL P1** · isso foi **incorreto** · violou `feedback_legacy_literal`. Correção:

| Item | Audit anterior | Correção |
|---|---|---|
| Lead detail arquitetura | PARTIAL P1 (rota separada `/leads/[id]`) | **WRONG P0** · legacy abre como MODAL fullscreen com sidebar · v2 navega para rota separada · UIX fundamentalmente diferente · staff perde contexto da tabela |
| Decisão arquitetural | "Discutir: rota dedicada (v2) vs modal (legacy) · escolha arquitetural" | **NÃO É ESCOLHA** · legacy é canônico · v2 deve replicar modal · staff treinada espera modal |

**Implicação:** patch real precisará migrar `/leads/[id]` page para um modal client-side dentro de LeadsClient · ou rota que renderiza modal overlay sobre a tabela (preserve o background visível).

---

## TABELA 1 · CSS por componente

Cada linha tem: componente · classe(s) · CSS literal (resumido com valores inline) · localização legacy · estado actual v2.

### 1. Container raiz da página
| Aspecto | Legacy literal | v2 status |
|---|---|---|
| Wrapper | `<div style="padding:20px 24px;height:100%;display:flex;flex-direction:column;min-height:0">` | v2 usa `PageContainer variant="wide"` (Tailwind · não 1×1) |
| Background | herda do shell (branco) | herda b2b shell (escuro) — **DIVERGENT** |

### 2. Header (page-title-row)
| Item | Classe | CSS legacy | v2 status |
|---|---|---|---|
| Container | `.page-title-row` | `display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:24px` | DIVERGENT (usa PageHero/PageHeader) |
| Título | `.page-title` | `font-size:22px; font-weight:800; color:var(--text-primary); letter-spacing:-0.5px; margin-bottom:4px` | v2 tem `<em>` italic decorativo · não 1×1 |
| Subtítulo | `.page-subtitle` | `font-size:13.5px; color:var(--text-secondary); font-weight:400` | DIVERGENT (b2b muted) |
| Ações container | `.page-title-actions` (inline style também) | `display:flex; align-items:center; gap:8px; flex-shrink:0` | MATCH (toolbar v2 tem gap:16) |
| **Texto fixo Full Face** | título=`"Leads Full Face"` · subtítulo=`"Leads do funil Full Face — Lifting 5D e protocolos completos"` | v2 atual: `"Leads"` + `"Gerencie e acompanhe seus leads por fase."` · **WRONG** para Full Face |

### 3. Botão "Importar Planilha" (Full Face exclusivo)
| Aspecto | Valor inline literal |
|---|---|
| Background | `#fff` |
| Color (texto) | `#16a34a` (verde) |
| Border | `1.5px solid #16a34a` |
| Padding | `9px 16px` |
| Border-radius | `10px` |
| Font-size | `13px` · weight `600` |
| Ícone SVG | grid 4 quadrantes (planilha) · `15x15px` |
| Visível em | **APENAS** quando `cfg.key === 'fullface'` · NÃO em Procedimentos |
| v2 status | **MISSING** (não existe) |

### 4. Botão "Exportar" + dropdown
| Aspecto | Valor literal |
|---|---|
| Botão container | `display:flex; gap:6px; bg:#fff; color:#374151; border:1.5px solid #E5E7EB; padding:9px 14px; border-radius:10px; font-size:13px; font-weight:600` |
| Ícone | seta download SVG 14x14 |
| Dropdown | `position:absolute; top:100%; right:0; margin-top:4px; bg:#fff; border:1px solid #E5E7EB; border-radius:10px; box-shadow:0 4px 16px rgba(0,0,0,0.1); min-width:160px` |
| Opções (`.lc-export-opt`) | `display:flex; gap:8px; padding:10px 14px; font-size:13px; font-weight:500; color:#111` |
| Opção CSV | ícone verde `#10B981` |
| Opção PDF | ícone vermelho `#EF4444` |
| Hover opção | bg muda para `#F9FAFB` |
| v2 status | **PARTIAL** · v2 tem botão "Exportar" mas sem dropdown CSV/PDF · só CSV direto |

### 5. Botão "Novo Lead" (gradient roxo)
| Aspecto | Valor literal |
|---|---|
| Background | `linear-gradient(135deg, #7C3AED, #5B21B6)` |
| Color | `#fff` |
| Padding | `10px 20px` |
| Border-radius | `10px` |
| Font-size | `13px` · weight `600` |
| Box-shadow | `0 4px 12px rgba(124,58,237,0.3)` |
| Ícone | plus `16x16` stroke-width `2.5` |
| Click | `showNewPatientModal()` (3-etapas modal) |
| v2 status | **WRONG cor** · v2 usa champagne · não roxo · não gradient · não box-shadow |

### 6. Toggle de view (Tabela/7Dias/Evolução)
| Classe | CSS literal |
|---|---|
| `.sdr-pipeline-toggle` | `display:flex; gap:4px; background:#f3f4f6; border-radius:8px; padding:3px; width:fit-content` |
| `.sdr-pipeline-btn` | `background:none; border:none; padding:5px 12px; border-radius:6px; font-size:11px; font-weight:600; color:#6b7280; cursor:pointer; transition:all 0.15s` |
| `.sdr-pipeline-btn.active` | `background:#fff; color:#111827; box-shadow:0 1px 2px rgba(0,0,0,0.08)` |
| Botão Tabela com ícone | `<svg>` grid 4 quadrados antes do texto |
| Botões 7 Dias / Evolução | sem ícone |
| v2 status | **MATCH estrutural** · cores divergem (b2b champagne vs roxo) · ícones MISSING |

### 7. Count badge (Total + Quente + Morno + Frio)
| Aspecto | Valor literal |
|---|---|
| Container | `display:none; align-items:center; gap:10px; background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:6px 14px; box-shadow:0 1px 4px rgba(0,0,0,0.05)` |
| Display | `flex` quando view=table · `none` em 7 Dias/Evolução |
| Total `<span>` | `font-size:18px; font-weight:800; color:#111; line-height:1` |
| Label "leads" | `font-size:11px; font-weight:500; color:#9ca3af; text-transform:uppercase; letter-spacing:0.04em` |
| Separador | `<div style="width:1px; height:20px; background:#f3f4f6">` |
| Quente | ícone chama `#ef4444` + número `font-size:13px; font-weight:700; color:#ef4444` |
| Morno | chama `#f59e0b` + número idem cor `#f59e0b` |
| Frio | chama `#60a5fa` + número idem cor `#60a5fa` |
| v2 status | **PARTIAL** · v2 tem KpiBadge mas só na linha do toggle · cores OK · estrutura inline gradient champagne (não branco) · ícone Thermometer (não chama) |

### 8. Barra de filtros · Linha 1 (Período + Busca)
| Componente | Classe / CSS literal |
|---|---|
| Wrapper | `display:flex; align-items:center; flex-wrap:wrap; gap:8px` |
| `.ao-period-bar` | `display:flex; align-items:center; gap:6px; margin-bottom:12px; background:var(--card); border-radius:var(--radius-lg); padding:6px; width:fit-content; box-shadow:var(--shadow-sm)` |
| `.ao-period-btn` | `padding:7px 16px; border-radius:var(--radius-md); font-size:12px; font-weight:600; cursor:pointer; border:none; background:transparent; color:var(--text-secondary); transition:.15s` |
| `.ao-period-btn.active` | `background:var(--accent-purple); color:#fff` |
| `.ao-period-btn:hover` | `background:#F3F4F6; color:var(--text-primary)` |
| `.ao-date-range` (custom · 5o botão) | `display:none; align-items:center; gap:8px; margin-bottom:12px; background:var(--card); border-radius:var(--radius-lg); padding:10px 14px; box-shadow:var(--shadow-sm)` |
| `.ao-date-range.visible` | `display:flex` |
| `.ao-date-input` | `padding:6px 10px; border:1.5px solid var(--border); border-radius:var(--radius-md); font-size:12px; outline:none; cursor:pointer; background:#FAFAFA` |
| `.ao-date-input:focus` | `border-color:var(--accent-purple)` |
| `.ao-date-apply` | `padding:6px 16px; background:var(--accent-purple); color:#fff; border:none; border-radius:var(--radius-md); font-size:12px; font-weight:700` |
| Search input | `padding:7px 12px; border:1.5px solid #E5E7EB; border-radius:8px; font-size:13px; outline:none; width:200px` · placeholder `"Buscar por nome ou telefone..."` · `readonly` em foco off (anti-autofill) |
| v2 status | **PARTIAL** · v2 tem tabs underline (não pill com bg) · custom date range MISSING · search width não fixo |

### 9. Barra de filtros · Linha 2 (Estratégico · roxo)
| Aspecto | Valor literal |
|---|---|
| Wrapper | `display:flex; align-items:center; gap:8px; padding:7px 12px; background:#faf5ff; border:1px solid #ede9fe; border-radius:10px; flex-wrap:wrap` |
| Label "ESTRATÉGICO" | `font-size:11px; font-weight:700; color:#7c3aed; letter-spacing:0.04em` + ícone funil `#7c3aed` |
| Separador | `width:1px; height:18px; background:#ddd6fe` |
| Select Temperatura | `padding:5px 10px; border:1.5px solid #ddd6fe; border-radius:8px; font-size:12px; background:#fff; color:#374151` |
| Select Tags | mesmo padrão |
| Botão Queixas | mesmo padrão · com ícone funil 12x12 · label dinâmico ("Todas as queixas" / "N queixas") |
| Panel Queixas | `position:absolute; margin-top:4px; z-index:50; background:#fff; border:1px solid #E5E7EB; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,0.08); padding:10px; min-width:260px; max-height:340px; overflow-y:auto` |
| v2 status | **WRONG** · v2 tem grid layout (não inline) · sem fundo roxo claro · sem label "ESTRATÉGICO" · ChipGroup ao invés de select |

### 10. Tabela · Cabeçalho
| Aspecto | Valor literal |
|---|---|
| Container | `background:#fff; border-radius:12px; border:1px solid #F3F4F6; overflow:hidden` |
| Table | `width:100%; border-collapse:collapse; table-layout:fixed` |
| Colgroup widths | `44px / 220px / 110px / 180px / auto / 90px / 100px` |
| Thead bg | `background:#F9FAFB; border-bottom:1px solid #F3F4F6` |
| TH padding | `padding:12px 16px` · primeiro TH `padding:12px 8px 12px 16px` |
| TH style | `text-align:left; font-size:12px; font-weight:600; color:#6B7280; text-transform:uppercase; letter-spacing:0.05em` |
| TH sort (`.lc-sort-th`) | `cursor:pointer; user-select:none` |
| TH "Acoes" | `text-align:center` |
| Checkbox header | `width:14px; height:14px; accent-color:#7C3AED; cursor:pointer` |
| **Colunas (em ordem)** | `[ ] · Nome · Temperatura · Tags · Queixas · Data · Acoes` (7 colunas) |
| v2 status | **DIVERGENT** · v2 usa grid CSS · 8 colunas (inclui # idx) · sem fundo branco · cores b2b |

### 11. Tabela · Linha (row)
| Aspecto | Valor literal |
|---|---|
| TR | `border-bottom:1px solid #F9FAFB; cursor:pointer; transition:background .1s` |
| Hover | bg muda `#FAFAFA` (inline JS) |
| TD padding | `padding:12px 16px` (primeiro TD `padding:12px 8px 12px 16px`) |
| Nome | `font-size:13px; font-weight:600; color:#111827` |
| Phone | `font-size:12px; color:#6B7280` |
| Temperatura badge | inline `display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:600; color:[temp.color]; background:[temp.bg]; border-radius:6px; padding:3px 10px` |
| Temp Quente | color `#f87171` · bg `#fef2f2` (legacy `_TEMP_CFG.hot`) |
| Temp Morno | color `#f59e0b` · bg `#fffbeb` |
| Temp Frio | color `#93c5fd` · bg `#eff6ff` |
| Tags cell | até 3 inline · cada `<span>` com `font-size:11px; background:#f3f4f6; border-radius:4px; padding:2px 7px; color:#374151` |
| Queixas | `font-size:12px; color:#374151; line-height:1.4` · join(", ") |
| Data | `font-size:12px; color:#6B7280; white-space:nowrap` · format pt-BR via `toLocaleDateString('pt-BR')` |
| Ação "Ver" | `background:none; border:1px solid #E5E7EB; border-radius:6px; padding:5px 10px; font-size:12px; color:#374151` |
| Checkbox row | `width:14px; height:14px; accent-color:#7C3AED` |
| Click row → | `viewLead(l.id)` ou `showLeadModal(l)` · **ABRE MODAL** · não navega |
| v2 status | **DIVERGENT** · v2 row tem WhatsApp inline + Avatar + Edit + Delete + Active toggle (agora) + Agendar (agora) · legacy só tem botão "Ver" simples |

### 12. Botão "Carregar mais leads"
| Aspecto | Valor literal |
|---|---|
| Container | `padding:16px 0; text-align:center` |
| Botão | `background:#fff; border:1px solid #e5e7eb; padding:8px 20px; border-radius:8px; font-size:13px; color:#6b7280; font-weight:500` |
| Display | `none` se nenhum lead restante |
| Texto dinâmico | "Carregar mais N leads" (mostra contagem restante) |
| Page size | 50 (constante `LeadsFilter.PAGE_SIZE`) |
| Persistência | salva offset em `sessionStorage('lc_page_fullface')` |
| v2 status | **WRONG** · v2 usa paginação Anterior/Próxima por página · não load more |

### 13. Lead Card (Kanban view)
| Classe | CSS literal |
|---|---|
| `.lead-card` | `background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:8px 10px; margin-bottom:6px; cursor:grab; transition:.15s; user-select:none` |
| `.lead-card:hover` | `box-shadow:0 4px 12px rgba(0,0,0,0.08); border-color:#d1d5db` |
| `.lead-card:active` | `cursor:grabbing; transform:scale(0.98)` |
| `[data-temperature="hot"]` | `border-left:3px solid #f87171` |
| `[data-temperature="warm"]` | `border-left:3px solid #fcd34d` |
| `[data-temperature="cold"]` | `border-left:3px solid #93c5fd` |
| `.lc-header` | `display:flex; align-items:center; gap:8px; margin-bottom:4px` |
| `.lc-avatar` | `width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:700; color:#fff; flex-shrink:0` |
| `.lc-name` | `font-size:12px; font-weight:600; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis` |
| `.lc-badge` | `display:inline-flex; gap:4px; font-size:10px; font-weight:600; padding:2px 7px; border-radius:20px` |
| `.lc-badge-dot` | `width:6px; height:6px; border-radius:50%` |
| `.lc-tag` | `font-size:10px; font-weight:500; padding:1px 6px; border-radius:4px; border:1px solid; max-width:90px; overflow:hidden; text-overflow:ellipsis` |
| `.lc-tag-more` | bg `#f3f4f6` · color `#6b7280` · cursor `pointer` |
| `.lc-action-btn` | `padding:3px 5px; cursor:pointer; color:#9ca3af; border-radius:4px` |
| `.lc-action-whatsapp` | `color:#22c55e !important` · hover bg `#f0fdf4` color `#16a34a` |
| v2 status | **MISSING** · v2 sem componente lead-card próprio · usa LeadRow da tabela |

### 14. Kanban (board · columns)
| Classe | CSS literal |
|---|---|
| `.kanban-board` | `display:flex; gap:12px; padding:4px 0 16px; min-height:500px; align-items:flex-start; min-width:max-content` |
| `.kanban-column` | `min-width:240px; max-width:320px; flex-shrink:0; background:#f9fafb; border-radius:10px; border:1px solid #e5e7eb; display:flex; flex-direction:column` |
| `.kanban-column-header` | `padding:10px 12px 8px; border-bottom:1px solid #e5e7eb; display:flex; align-items:center; gap:7px` |
| `.kanban-column-color` | `width:10px; height:10px; border-radius:3px` (cor da fase) |
| `.kanban-column-label` | `font-size:12px; font-weight:600; color:#374151; flex:1` |
| `.kanban-column-count` | `font-size:11px; font-weight:700; color:#6b7280; background:#e5e7eb; border-radius:10px; padding:1px 7px; min-width:20px; text-align:center` |
| `.kanban-column-body` | `padding:8px; flex:1; min-height:80px` |
| `.kanban-column-empty` | `text-align:center; color:#d1d5db; font-size:11px; padding:24px 8px` |
| `.kanban-column.drag-over .kanban-column-body` | bg `#eff6ff`; outline `2px dashed #93c5fd; outline-offset:-4px` |
| `.kanban-scroll-area::-webkit-scrollbar` | `height:6px` |
| `.kanban-scroll-btn` | `position:fixed; top:50vh; width:36px; height:36px; bg:#fff; border:1px solid #e5e7eb; border-radius:50%; box-shadow:0 2px 12px rgba(0,0,0,0.15); z-index:50` |
| v2 status | **MISSING inline** · v2 redireciona para `/crm/kanban/seven-days` ou `/crm/kanban` separados · não tem board inline na página de leads |

### 15. Modal de detalhe (lead-modal.js) · 10 TABS
| Classe | CSS literal |
|---|---|
| `.modal-overlay` | `position:fixed; inset:0; bg:rgba(0,0,0,0.55); backdrop-filter:blur(3px); z-index:9000; display:flex; padding:16px; opacity:0; transition:.2s` |
| `.modal-overlay.open` | `opacity:1` |
| `.modal-box` | `bg:#fff; border-radius:18px; box-shadow:0 24px 80px rgba(0,0,0,.25); width:100%; max-height:96vh; overflow:hidden; display:flex; flex-direction:column; transform:translateY(12px); transition:.2s` |
| `.modal-xl .modal-box` | `max-width:1080px` (lead-modal usa XL) |
| `.modal-header` | `display:flex; padding:20px 24px; border-bottom:1px solid #E5E7EB` |
| `.modal-title` | `font-size:15px; font-weight:700; color:#111` |
| `.modal-subtitle` | `font-size:12px; color:#9CA3AF; margin-top:2px` |
| `.modal-close` | `width:32px; height:32px; bg:transparent; color:#9CA3AF; border-radius:8px` |
| `.modal-body` | `padding:20px 24px; overflow-y:auto; flex:1` |
| `.modal-with-sidebar` | `display:flex; height:100%; overflow:hidden` |
| `.modal-sidebar` | `width:172px; bg:#FAFAFA; border-right:1px solid #F3F4F6; padding:14px 10px; display:flex; flex-direction:column; gap:2px` |
| `.modal-sidebar-btn` | `width:100%; display:flex; gap:9px; padding:9px 12px; border-radius:8px; font-size:13px; font-weight:500; color:#6B7280` |
| `.modal-sidebar-btn.active` | `background:#F5F3FF; color:#7C3AED; font-weight:600` |
| `.modal-content` | `flex:1; overflow-y:auto; padding:24px 28px` |
| **10 tabs (sidebar vertical)** | `Geral · Clínico · Anamnese · Evolução · Financeiro · Linha do Tempo · Documentos · Orçamentos · Interações · Protocolos` (com ícones SVG individuais) |
| v2 status | **WRONG ARQUITETURA** · v2 abre como rota `/leads/[id]` · 5 tabs horizontais (Info · Conversa · Histórico · Tags & Pipeline · Ações) · perde 6 tabs do legacy |

### 16. Modais de segurança (delete/toggle/schedule)
| Classe | CSS literal |
|---|---|
| `.lt-modal-overlay` | `position:fixed; inset:0; bg:rgba(0,0,0,0.4); z-index:1000; display:flex; animation:ip-fade-in 0.15s ease` |
| `.lt-modal` | `bg:#fff; border-radius:14px; padding:24px; width:380px; max-width:94vw; box-shadow:0 20px 60px rgba(0,0,0,0.2)` |
| `.lt-modal-wide` | `width:520px` |
| `.lt-modal-title` | `font-size:15px; font-weight:700; color:#111827; margin-bottom:12px` |
| `.lt-modal-danger` | `color:#ef4444` |
| `.lt-modal-lead-info` | `display:flex; align-items:center; gap:6px; font-size:12px; color:#6b7280; background:#f9fafb; border-radius:8px; padding:8px 12px; margin-bottom:16px` |
| `.lt-modal-body` | `font-size:13px; color:#374151; line-height:1.6; margin-bottom:16px` |
| `.lt-modal-confirm-name` | `display:inline-block; font-weight:700; color:#111827; bg:#f3f4f6; border-radius:6px; padding:2px 8px; font-size:13px` |
| `.lt-modal-grid` | `display:grid; grid-template-columns:1fr 1fr; gap:12px` |
| `.lt-modal-field` | `display:flex; flex-direction:column; gap:4px` |
| `.lt-modal-field-full` | `grid-column:1 / -1` |
| `.lt-modal-label` | `font-size:11px; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.04em` |
| `.lt-modal-input` | `padding:8px 10px; border:1px solid #e5e7eb; border-radius:8px; font-size:12px; color:#111827; bg:#fff; transition:.12s` |
| `.lt-modal-input:focus` | `outline:none; border-color:#6366f1` |
| `.lt-modal-input-danger:focus` | `border-color:#ef4444` |
| `.lt-modal-btns` | `display:flex; justify-content:flex-end; gap:8px; margin-top:16px` |
| `.lt-modal-btn-cancel` | `padding:8px 16px; border-radius:8px; border:1px solid #e5e7eb; background:#fff; color:#374151; font-size:13px; font-weight:600` |
| `.lt-modal-btn-confirm` | `padding:8px 20px; border-radius:8px; border:none; color:#fff; font-size:13px; font-weight:600` |
| `.lt-modal-btn-delete` | bg `#ef4444; color:#fff; padding:8px 20px; border-radius:8px; font-size:13px; font-weight:600` |
| `.lt-toggle` | `position:relative; display:inline-block; width:34px; height:20px; cursor:pointer` (toggle switch HTML) |
| v2 status | **DIVERGENT** · v2 usa b2b classes (`b2b-modal`, `b2b-overlay`) · cores diferentes · estrutura similar mas style system totalmente outro |

### 17. Lead Detail Modal · Sub-elementos relevantes (extras do .lt-temp-badge etc)
| Classe | CSS literal |
|---|---|
| `.lt-temp-badge` | `display:inline-flex; gap:4px; font-size:10px; font-weight:600; padding:2px 8px; border-radius:20px; border:1px solid; cursor:pointer` |
| `.lt-temp-badge:hover` | `box-shadow:0 2px 8px rgba(0,0,0,0.1)` |
| `.lt-tag-add-btn` | `width:18px; height:18px; border-radius:4px; border:1px dashed #d1d5db; bg:none; color:#9ca3af; cursor:pointer` |
| `.lt-tag-add-btn:hover` | `border-color:#6366f1; color:#6366f1; bg:#eff6ff` |

---

## TABELA 2 · Regras + Validações

### Filtros · Período
| Tipo | Regra | Default | Bloqueia se? |
|---|---|---|---|
| Todos | Sem filtro de data | ✓ padrão | — |
| Hoje | `created_at` no dia atual (timezone local) | — | — |
| Semana | últimos 7 dias | — | — |
| Mês | últimos 30 dias | — | — |
| Período custom | `dateFrom` + `dateTo` · só dispara `_load()` ao clicar **Aplicar** | — | sem `from` ou `to` → não filtra; tudo permitido (sem validação) |

### Filtros · Busca / Temperatura / Tags / Queixas
| Campo | Tipo | Default | Comportamento |
|---|---|---|---|
| Busca | text input · matcher `nome OR phone` (case-insensitive lowercase trim) | "" | oninput → `_load()` imediato (no debounce visível em legacy) |
| Temperatura | select 4 opções | "" (todas) | onchange → `_load()` |
| Tags | select dinâmico · preenchido via `_loadTagsFilter()` | "" | onchange → busca IDs de leads com a tag → filter |
| Queixas | popover multi-select · checkboxes · slug-based | `[]` (todas) | toggleQueixa → `_load()` |

### Ordenação (sort)
| Campo | Default direction | Toggleable |
|---|---|---|
| `name` | asc | click → asc/desc toggle |
| `temperature` | asc | toggle |
| `date` | desc | toggle |
| Outras colunas | não ordenáveis | — |
| Indicador visual | header clicado fica `color:#111` · outros `#6B7280` | — |

### Seleção (bulk)
| Item | Regra |
|---|---|
| Select all checkbox | header · `accent-color:#7C3AED` · marca/desmarca todos os `_filteredAll` |
| Row checkbox | individual · adiciona/remove de `_selectedIds: Set<id>` |
| Persistência | `_selectedIds` é Set local · reset quando view muda |
| Bulk bar | `_updateBulkBar()` quando seleção muda |
| **filtroExclude legacy** | Phases excluídas SEMPRE no filtro Full Face: `['agendado','reagendado','compareceu','perdido','paciente','orcamento']` (apenas leads "fresh" aparecem) — leads convertidos saem da lista |

### Paginação
| Regra | Valor |
|---|---|
| Page size | 50 (legacy) · pode ler `LeadsFilter.PAGE_SIZE` |
| Tipo | "Carregar mais N leads" (load more · não pages) |
| Persistência | offset em `sessionStorage('lc_page_fullface')` |
| Restore | quando navega de volta · usa savedPage se > pageSize |

### Click na linha (abre detalhe)
| Regra | Comportamento |
|---|---|
| Click em area da row | abre modal `viewLead(l.id)` ou `showLeadModal(l)` |
| Click em `button`/`input`/`select`/`a` dentro da row | NÃO abre modal (early return) |
| Modal abre fullscreen-ish (modal-xl 1080px) | sidebar 172px + content flex:1 |

### Modal de detalhe · 10 tabs · regra por tab
| Tab | Renderização | Restrição |
|---|---|---|
| Geral | async · ComplaintsPanel embed | sempre disponível |
| Clínico | sync · campos clínicos (anamnese subset) | — |
| Anamnese | sync · formulário 7 textareas · digital section + botão "Gerar link de anamnese" + "Enviar anamnese" | edição local salva em `lead.customFields.anamnese[key]` |
| Evolução | async · appointments DESC + WOW SOAP + WOW Prescrição (se `window.ProntuarioWow`) | requer appointments do lead |
| Financeiro | sync · WOW gráfico financeiro + budget badge refresh + comanda detail | — |
| Linha do Tempo | async · localStorage `clinicai_appointments` + WOW luxury timeline | requer appointments |
| Documentos | async · `_lmLoadDocumentos()` + botão "Solicitar documento" | — |
| Orçamentos | async · lista status badges + CRUD inline (saveBudget/removeBudget) | — |
| Interações | sync · histórico touchpoints | — |
| Protocolos | sync · default (3M/6M/1A) + custom (CRUD) | adicionar/remover protocolos custom |

### Modal Schedule (Agendar a partir do lead)
| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| Profissional | select | sim | required · vem de `AgendaAccessService.getAll()` |
| Procedimento | text | sim | erro "Informe o procedimento." |
| Data | date | sim | default hoje · erro "Selecione uma data." |
| Hora início | time | sim | default próxima hora cheia · erro "Informe a hora de inicio." |
| Duração | select (30/45/60/90/120 min) | sim | calcula endTime = start + duracao |
| Observações | textarea | não | — |
| Submit | RPC `appt_upsert(p_data: payload)` | — | `status='agendado'` · `origem='sdr_table'` · UUID via `crypto.randomUUID()` |

### Modal Toggle Ativo
| Estado | Texto modal | Confirmação |
|---|---|---|
| Ativar | "Ativar lead [name]? Ele voltará a aparecer nas views ativas." | botão verde "Confirmar" |
| Desativar | "Desativar lead [name]? Ele ficará oculto nas views ativas." | botão laranja "Confirmar" |
| Cancelar | revert checkbox state | — |
| RPC | `leads.update({is_active: bool}).eq('id', leadId)` | — |

### Modal Delete
| Regra | Valor |
|---|---|
| Texto | "Esta acao e **permanente e irreversivel**. Para confirmar, digite o nome do lead abaixo: [leadName]" |
| Input | text · onchange compara `=== leadName.trim()` exato |
| Botão Deletar | desabilitado até match exato · cor `.lt-modal-btn-delete` (#ef4444) |
| RPC | `leads.update({deleted_at: now()}).eq('id', leadId)` (soft delete) |

### Modal Novo Paciente / Lead · 3 etapas
**Etapa 1 · Dados Pessoais**
| Campo | Tipo | Obrigatório | Validação | Mensagem erro |
|---|---|---|---|---|
| Nome | text | sim | trim length > 0 | "Nome é obrigatório" |
| Sobrenome | text | sim | trim length > 0 | "Sobrenome é obrigatório" |
| Sexo Biológico | toggle (F/M) | sim | um dos 2 selecionado | "Selecione o sexo biológico" (borders red) |
| CPF | text masked 000.000.000-00 | sim | length=14 com máscara · 11 dígitos sem | "CPF é obrigatório" · check duplicidade async `npCheckDuplicateDoc()` |
| WhatsApp/Telefone | text masked (11) 99999-9999 | sim | length 14-15 com máscara | "Telefone é obrigatório" |
| Email | email | não | regex email se preenchido | — |
| Data nascimento | date | não | — | — |
| RG | text masked 00.000.000-0 | não | check duplicidade async se preenchido | "CPF/RG já cadastrado — Lead: [nome]" |
| Profissão | text | não | — | — |
| Status inicial | select | sim | uma das 4 opções | — |

**Etapa 2 · Endereço e Origem**
| Campo | Tipo | Obrigatório |
|---|---|---|
| CEP | text masked 00000-000 | não |
| Rua | text | não |
| Número | text | não |
| Complemento | text | não |
| Bairro | text | não |
| Cidade | text | não |
| Estado | select 27 UFs | não |
| Canal de origem | select (Instagram/Facebook/TikTok/Google/Indicação/WhatsApp/Site/Evento/Presencial/Manual/Outro) | **sim** |
| Indicado por (Parceiro VPI) | select dinâmico via `VPIService.loadPartners()` | não |
| Campanha / UTM | text | não |

**Etapa 3 · Dados Clínicos**
| Campo | Tipo | Obrigatório | Validação |
|---|---|---|---|
| Procedimento de interesse | select via API `/procedures` ou text custom | não | — |
| Valor estimado | number | não | — |
| Duração da consulta | select (30/45/60/90/120/180 min) | não | — |
| Lead Score 0-100 | number | não | min 0 max 100 |
| Prioridade | select (Normal/Alta/VIP) | não | — |
| Queixa principal | textarea | não | — |
| Expectativas | textarea | não | — |
| Observações internas | textarea | não | — |

**Submit · etapa 3**: chama `saveNewPatient()` → grava em `leads` table · dispara `SdrService.initLeadPipelines(leadId)` fire-and-forget · fecha modal · NÃO reload (apenas refresh local).

### Botão Importar Planilha (Full Face exclusivo)
| Regra | Valor |
|---|---|
| Visível | apenas `cfg.key === 'fullface'` |
| Modal | `sheetsImportModal` overlay z-index 9999 |
| Input | URL Apps Script (validação: `trim()` não vazio) |
| Submit | `SheetsImportService.importFullFace({ url })` → result `{ ok, imported, skipped, error }` |
| Feedback | status colored (loading blue · success green · error red) |
| Auto-close | 1800ms após success |

### Exportar (CSV / PDF)
| Tipo | Comportamento |
|---|---|
| CSV | client-side · BOM UTF-8 · headers Nome/Telefone/Email/Funnel/Fase/Temperatura/Tags/Queixas/Score/Última resposta |
| PDF | client-side (`exportLeads('pdf')` handler) |
| Filename | `leads_${YYYY-MM-DD}.csv` |
| Escopo | `finalRows` (apenas filtrados visíveis · não enumera todos) |

### Side effects internos (sem provider real)
| Evento | Side effect |
|---|---|
| Novo lead criado | `SdrService.initLeadPipelines(leadId)` fire-and-forget (cria pipeline default) |
| Lead agendado (modal schedule) | RPC `appt_upsert` cria appointment · NÃO muda `lead.phase` direto no front (backend trigger) |
| Tag adicionada | popover · `SdrService.setTags(leadId, tags)` |
| Temperatura mudada | popover badge · `leads.update({temperature})` |
| Toggle ativo | `leads.update({is_active})` |
| Soft delete | `leads.update({deleted_at})` · não remove fisicamente |

### Phase canon (Full Face específico)
| Phase | Aparece em Full Face? | Por quê |
|---|---|---|
| lead | ✓ sim | ativo no funil |
| novo | ✓ sim (alias de lead) | mesma fase em Full Face |
| agendado | ✗ NÃO | filtro `excludePhases` legacy |
| reagendado | ✗ NÃO | excluído |
| compareceu | ✗ NÃO | excluído |
| perdido | ✗ NÃO | excluído |
| paciente | ✗ NÃO | excluído (conversão) |
| orcamento | ✗ NÃO | excluído (conversão) |
| Resultado | Full Face mostra apenas leads "frescos" pra trabalhar · convertidos saem da lista | — |

⚠️ **Importante para v2:** Canon Phase 1C atual em v2 usa só 4 phases (`lead/agendado/paciente/orcamento`). Legacy filtrava por exclude de 6 phases (incluindo `reagendado/compareceu/perdido` derrogados). v2 já não tem essas phases · filtro simplifica para `excludePhases: ['agendado','paciente','orcamento']` OR `phase='lead'` only.

### Permissões aparentes
| Ação | Restrição visível no legacy |
|---|---|
| Ver leads | sem RBAC granular front (qualquer auth) |
| Criar/editar/deletar | sem RBAC front · backend valida RLS |

### Empty states (microcopy exato)
| Cenário | Texto legacy |
|---|---|
| Tabela sem dados | `"Nenhum lead encontrado."` (colspan 7 · padding 40px · color #9CA3AF) |
| Tabela carregando | `"Carregando leads..."` |
| Kanban coluna vazia | `"Nenhum lead nesta coluna"` |
| Orçamentos modal | `"Sem orçamentos"` |
| Anamnese modal | placeholders por textarea (Alergias / Medicamentos / etc.) |

---

## Cores canônicas (paleta legacy Full Face)

| Token | Valor |
|---|---|
| Roxo principal (accent-purple) | `#7C3AED` |
| Roxo dark (hover) | `#5B21B6` |
| Roxo light bg | `#F5F3FF` |
| Verde sucesso | `#16a34a` |
| Verde light bg | `#f0fdf4` |
| Vermelho danger | `#ef4444` |
| Vermelho light bg | `#fef2f2` |
| Amarelo morno | `#f59e0b` |
| Amarelo light bg | `#fffbeb` |
| Azul frio | `#60a5fa` (também `#93c5fd` em badges) |
| Azul light bg | `#eff6ff` |
| Quente cor texto | `#ef4444` / `#f87171` |
| Texto primary | `#111827` / `#111` |
| Texto secondary | `#6B7280` |
| Texto muted | `#9CA3AF` |
| Border default | `#E5E7EB` |
| Background card | `#fff` |
| Background page | `#fafafa` / `#FAFAFA` |
| Background hover row | `#FAFAFA` |
| Background table head | `#F9FAFB` |

---

## PATCH RESTART FROM FULLFACE SPEC

Executado em 2026-05-18 sobre o branch `crm/functional-1x1-leads-first-audit`.

### Revertido do 2A (blockers)

| Item | Motivo |
|---|---|
| `ToggleActiveModal` (90 linhas) function definition | Tratava `deleted_at` como estado Ativo/Inativo · WRONG canon |
| `confirmToggleActive` state + handler | Idem |
| Import `restoreLeadAction` | Não usar como toggle ativo |
| `ActiveBadge` envolto em `<button>` clickable | Idem · revertido para `<span>` readonly com tooltip explicando lifecycle_status canônico |
| `onAgendar={() => router.push('/crm/agenda/novo?leadId=...')}` no LeadRow callsite | Schedule redirect como paridade = WRONG · trocado por `setScheduleLead(lead)` que abre modal stub |
| Comentário "v2 não tem coluna is_active · usa deleted_at como canal de desativação" | Documentava uso errado · removido |

### Mantido do 2A (microcopy 1×1 legacy)

| Item | Por quê |
|---|---|
| Title `<>Leads</>` em `(authed)/leads/page.tsx` | Mais próximo do legacy ("Leads") · próximo prompt ajustará para "Leads Full Face" |
| Lede "Gerencie e acompanhe seus leads por fase." | 1×1 legacy |
| Description em `crm/leads/page.tsx` | Idem |
| Placeholder "Buscar por nome ou telefone..." em LeadFiltersPanel | 1×1 legacy |
| Texto DeleteModal "permanente e irreversível" | 1×1 legacy |

### Implementado neste prompt (PATCH RESTART)

| Item | Implementação | Spec ref |
|---|---|---|
| **Click row → modal** (não navega) | `clickRow()` agora chama `onOpenDetail()` que abre `LeadDetailModalStub` em vez de `router.push('/leads/[id]')` | componente 11 + 15 |
| **Botão Edit (lápis) → modal** | `onClick={onOpenDetail}` em vez de `router.push` (consistência com row click) | componente 11 |
| **Botão Agendar → modal** | `onClick={onAgendar}` chama `setScheduleLead(lead)` que abre `ScheduleFromLeadModalStub` | componente 16 (Schedule Modal) |
| **LeadDetailModalStub** (10 tabs · sidebar vertical 172px) | Tabs: Geral · Clínico · Anamnese · Evolução · Financeiro · Linha do Tempo · Documentos · Orçamentos · Interações · Protocolos · ordem literal legacy · ESC fecha · `role="dialog"` · `aria-modal="true"` | componente 15 |
| **Tab Geral conteúdo real** | Identificação (Nome/Tel/Email/CPF) + Pipeline (Funnel/Fase/Lifecycle/Temperatura/Score) com `DetailSection` + `DetailField` helpers | componente 15 |
| **9 outras tabs · empty state honesto** | "Conteúdo será portado do legacy no próximo prompt" | componente 15 |
| **ScheduleFromLeadModalStub** | Title "Agendar — {leadName}" · 6 campos visuais (Profissional/Procedimento/Data/Hora/Duração/Observações · disabled) · botão fallback "Continuar no agendamento completo →" que abre `/crm/agenda/novo?leadId=` (NÃO como paridade · como fallback explícito) | componente 16 |
| **Botão "Importar Planilha"** | Visual legacy literal (verde border `#16a34a` · ícone planilha SVG) · disabled · tooltip "Próximo prompt" | componente 3 |
| **Botão "Novo Lead"** | Gradient roxo `linear-gradient(135deg, #7C3AED, #5B21B6)` · box-shadow `0 4px 12px rgba(124,58,237,0.30)` · paridade legacy | componente 5 |
| **ActiveBadge readonly + tooltip** | `<span title="Ativo/Inativo será ligado via lifecycle_status canônico. Não usa exclusão."` · `cursor: help` | regra Toggle Ativo |
| **isActive derivado de `lifecycleStatus`** | `(lead.lifecycleStatus ?? 'ativo') === 'ativo'` (canon correto) · NÃO `!deletedAt` | regra Toggle Ativo |
| **`selectable` mantido como `!deletedAt`** | Bulk select bloqueia soft-deleted rows · canon · NÃO confunde com Ativo/Inativo | regra bulk |

### Status por componente (17 componentes spec · status atualizado)

| # | Componente | Status |
|---|---|---|
| 1 | Container raiz | **PARTIAL** · estrutura b2b dark · spec light theme não convertido (P1 próximo prompt theme) |
| 2 | Header (page-title) | **PARTIAL** · PageHero usado · título alinhado |
| 3 | Botão Importar Planilha | **PARTIAL** · visual literal · disabled · service não portado |
| 4 | Botão Exportar + dropdown | **PARTIAL** · botão presente · dropdown CSV/PDF MISSING (próximo prompt) |
| 5 | Botão Novo Lead | **MATCH** · gradient roxo legacy aplicado |
| 6 | Toggle view (Tabela/7Dias/Evolução) | **PARTIAL** · b2b champagne em vez de `sdr-pipeline-toggle` cores |
| 7 | Count badges | **PARTIAL** · KpiBadge horizontal · Quente/Morno/Frio MATCH cores · ícone Thermometer (não chama) |
| 8 | Filtros linha 1 (Período + Busca) | **PARTIAL** · tabs no LeadFiltersPanel · search placeholder MATCH |
| 9 | Filtros linha 2 estratégico | **PARTIAL** · ChipGroup em vez de fundo roxo claro inline |
| 10 | Tabela 7 colunas | **DIVERGENT** · v2 usa grid 8 cols · legacy 7 cols tabela HTML · estrutura diferente |
| 11 | Tabela linha · Click row → MODAL | **MATCH ESTRUTURAL** · agora abre modal (não navega) |
| 12 | Botão Carregar mais leads | **MISSING** · v2 usa paginação Anterior/Próxima · não convertido pra load more |
| 13 | Lead Card Kanban | **MISSING** · view Kanban redireciona pra `/crm/kanban` separado |
| 14 | Kanban columns | **MISSING** · idem |
| 15 | **Modal de detalhe 10 tabs** | **MATCH ESTRUTURAL** · `LeadDetailModalStub` · sidebar 172px · 10 tabs ordem legacy · Geral preenchido · 9 stubs |
| 16 | **Modais de segurança lt-modal-*** | **PARTIAL** · DeleteModal MATCH · `ScheduleFromLeadModalStub` presente (disabled fields + fallback button) · ToggleActiveModal removido |
| 17 | Subelementos detalhe (lt-temp-badge etc) | **MISSING** · não portados |

### O que falta no Round Leads (próximos prompts)

**Próximo prompt (sugerido):**
1. Theme conversion da página `/crm/leads` para light theme purple `#7C3AED` · OU decisão de manter b2b dark com aviso explícito
2. Action canônica `setLeadLifecycleStatusAction(leadId, status)` + UI ToggleActive clicável com 4 estados (ativo/perdido/recuperacao/arquivado)
3. Schedule Modal stub → modal funcional (carrega profissionais via prop · submete via `createAppointmentAction`)
4. Lead Detail Modal · portar 4 tabs prioritárias: Linha do Tempo (appointments) · Financeiro (orcamentos+pagamentos) · Anamnese (form 7 textareas) · Orçamentos (CRUD inline)
5. Tabela: load more em vez de paginação · 50 page size · sessionStorage offset

**Prompt seguinte:**
6. Restantes 6 tabs do detalhe (Clínico · Evolução · Documentos · Interações · Protocolos · Geral expandido com ComplaintsPanel)
7. NewLeadModal expansão para 25+ campos (3 etapas legacy)
8. Filtros linha 2 estratégico (fundo roxo claro inline)
9. Botão Importar Planilha real (porta `SheetsImportService`)
10. Exportar dropdown CSV/PDF

### Arquivos modificados (acumulado: 2A + RESTART)

| Arquivo | Status |
|---|---|
| `apps/lara/src/app/(authed)/leads/page.tsx` | Microcopy 2A (mantida) |
| `apps/lara/src/app/crm/leads/page.tsx` | Microcopy 2A (mantida) |
| `apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx` | Placeholder 2A (mantida) |
| `apps/lara/src/app/(authed)/leads/LeadsClient.tsx` | DeleteModal microcopy 2A + RESTART (LeadDetailModalStub + ScheduleFromLeadModalStub + ActiveBadge readonly + Importar Planilha + Novo Lead gradient + Click row → modal + Botão Agendar → modal) |

### Decisões arquiteturais ainda pendentes (NÃO implementar sem GO)

1. **Theme conversion light vs dark** — todo o LeadsClient (2400+ lines) usa b2b dark vars · converter pra light é prompt dedicado
2. **Full Face específico vs genérico** — pré-filtrar `funnel='fullface'` em `/crm/leads` · OU criar `/crm/leads/fullface` + `/crm/leads/procedimentos` separados (legacy 1×1) · OU manter genérico com filtro UI
3. **Load more vs paginação** — converter requer mudar `loadLeadsPageData` server fn · não trivial
4. **Lead detail modal vs rota** — rota `/leads/[id]` MANTIDA pra deep-link · modal é o comportamento primário (decidido neste prompt)
5. **lifecycle_status canônico** — adicionar transitions `ativo ↔ perdido ↔ recuperacao ↔ arquivado` via UI (action precisa ser canônica e auditada via `phase_history`)
