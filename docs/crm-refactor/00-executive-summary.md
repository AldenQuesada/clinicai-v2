# 00 · Executive Summary

> Auditoria macro do CRM CLINIIC AI v2. Estado em 2026-05-10. READ-ONLY.

---

## 1 · Verdict

**`CRM_REFACTOR_AUDIT_READY`** · com 1 ressalva URGENTE (Q11 do doc 11).

A auditoria está completa. O CRM já passou por um refactor sólido em 2026-04-28 (migs 60-65) que estabeleceu schema canônico, RPCs com matriz, audit imutável, RLS multi-tenant. O contrato-alvo do prompt é a **próxima evolução**, não estado atual.

**Antes de qualquer mig nova:** rodar probe da Q11 (mig 103 referencia coluna `lifecycle_status` fantasma).

---

## 2 · Situação atual

- **Banco:** 5 tabelas canônicas (`leads`, `appointments`, `patients`, `orcamentos`, `phase_history`) com migs 60-65 da v2. 9 RPCs canônicas. `_lead_phase_transition_allowed` matriz blindada. Audit em `phase_history` funcional. **`lifecycle_status` enum não existe** (apesar de referenciado em mig 103 com BUG).
- **Phases atuais:** 7 (`lead/agendado/reagendado/compareceu/paciente/orcamento/perdido`). Alvo: 4 (`lead/agendado/paciente/orcamento`).
- **Lifecycle:** existe `is_in_recovery boolean` + `lost_*` colunas. NÃO existe enum `lifecycle_status` com 4 valores.
- **Backend Lara v2:** ZERO mutations diretas em CRM fora de Repositories (✅). Server Actions tipadas com Zod. 22 actions em `crm/_actions/` + 10 legadas em `(authed)/leads/actions.ts`. Mira app reusa `OrcamentoRepository` para B2B.
- **Frontend Lara v2:** 13 páginas CRM mapeadas. Drag-drop só na agenda. **Leads kanban NÃO portado** · ainda em clinic-dashboard legacy. localStorage limpo de uso operacional em v2.
- **Legacy clinic-dashboard:** ativo em produção paralela · escreve no MESMO banco · usa localStorage como fonte de verdade · faz UPDATE direto em leads/appointments sem RPC. Risco P0 contínuo.
- **`crm_operational_view`:** NÃO existe. Conceito de "mesa operacional" não nomeado.
- **`crm_event_catalog`:** NÃO existe. 35 eventos operacionais sem catálogo central.

---

## 3 · Maior risco identificado

**R-001 · Mig 103 bug `lifecycle_status` fantasma:** CHECK `chk_leads_lost_consistency` referencia coluna que não existe. UPDATE em leads pode falhar com erro 42703 em runtime. **Probe imediato necessário.**

**R-002 · ADR-001 vs contrato:** modelo excludente atual (soft-delete `deleted_at` em lead→paciente) conflita com regra do contrato ("deleted_at só exclusão real"). Decisão arquitetural obrigatória antes de Fase 1.

---

## 4 · Maior divergência atual → alvo

| Aspecto | Hoje | Alvo |
|---|---|---|
| Phases | 7 | 4 |
| Lifecycle | `is_in_recovery boolean` + `lost_*` | Enum 4 valores (`ativo/perdido/recuperacao/arquivado`) |
| Perdido | Phase + lifecycle ambíguo | Lifecycle só |
| Compareceu/Reagendado | Phases | Removidos · só appointment.status |
| Read model | Ausente | `crm_operational_view` canônica |
| Catálogo eventos | Ausente | `crm_event_catalog` (34 eventos) |
| Mesa operacional | Implícita / inferida | Derivada em view |
| Kanban leads | clinic-dashboard legacy | Next.js v2 |
| Arquivado | Não existe | Lifecycle válido |

---

## 5 · Recomendação central

**Não é refactor "do zero".** A base é sólida (migs 60-65). O alvo é uma **evolução em 11 fases**, com 1 ressalva técnica e 11 decisões humanas pendentes.

**Ordem sugerida de ataque:**

1. **URGENTE · Probe da mig 103.** Resolver R-001 (10 minutos · 1 probe SQL).
2. **Decisões humanas Q1-Q8** (doc 11). Q1 (modelo excludente) é a mais crítica.
3. **Fase 1 · banco** (lifecycle_status enum + colunas + backfill).
4. **Fase 2 · RPCs** (`lead_recovery_activate`, `lead_archive`, matriz appointment, refactor `lead_lost`).
5. **Fase 3 · view canônica** (`crm_operational_view`).
6. **Fase 4 · catálogo eventos** (`crm_event_catalog`).
7. **Fases 5-6 · frontend v2** (mesas + kanban leads + actions).
8. **Fase 7 · decommission legacy** (CUIDADO · cutover validado).
9. **Fases 8-11 · validações, hardening, analytics, docs.**

**Cronograma estimado: 10 semanas** em ritmo passo a passo.

---

## 6 · Critérios de sucesso desta fase (Fase 0)

| Critério | Status |
|---|---|
| git status inicial registrado | ✅ |
| 0 código funcional alterado | ✅ |
| 0 migration criada | ✅ |
| 0 banco remoto alterado | ✅ |
| Todos os termos legados buscados | ✅ |
| RPCs canônicas localizadas/marcadas | ✅ (9 vivas + 8 ausentes do alvo) |
| Frontend CRM mapeado | ✅ (13 rotas + 30 componentes + 9 hooks) |
| `crm_operational_view` marcada (não existe) | ✅ |
| `phase_history` localizada | ✅ |
| `public.perdidos` mapeada como espelho | ✅ |
| Frontend com lógica operacional identificado | ✅ (clinic-dashboard legacy) |
| Riscos P0/P1 listados | ✅ (3 P0, 7 P1, doc 09) |
| Roadmap faseado produzido | ✅ (11 fases, doc 10) |
| Perguntas humanas registradas | ✅ (11 perguntas, doc 11) |

**Auditoria completa.**

---

## 7 · Próxima fase recomendada

**Fase 0.5 · Resolver Q11 + decisões humanas Q1-Q8.**

Antes de qualquer codigo/migration, Alden precisa:
1. Aprovar probe SQL da Q11 (mig 103).
2. Responder Q1 (modelo excludente) — bloqueia Fase 1.
3. Confirmar heurística Q2 (backfill).
4. Aprovar sugestões Q3-Q8 (ou ajustar).

Decisões Q9-Q11 podem ser feitas depois.

**Tempo estimado dessa Fase 0.5: 2-4 horas de revisão + decisão.**

---

## 8 · Documentação produzida nesta fase

| Doc | Conteúdo | Linhas aprox |
|---|---|---|
| `00-executive-summary.md` | Este resumo | 130 |
| `01-repository-inventory.md` | Inventário backend (repos, actions, services, legacy JS) | 280 |
| `02-database-inventory.md` | Tabelas, RPCs, triggers, views, RLS, timeline migrations | 340 |
| `03-current-state-machine.md` | State machine atual + matriz + DIFFs contra alvo | 270 |
| `04-target-state-machine.md` | Contrato-alvo enterprise (4 phases + lifecycle + view) | 340 |
| `05-journey-map.md` | 40 jornadas operacionais com travas e gaps | 300 |
| `06-alerts-notifications-messages.md` | Catálogo de 35 eventos + crons + canais | 230 |
| `07-frontend-map.md` | Páginas, componentes, hooks, drag-drop, mesa operacional, legacy | 250 |
| `08-legacy-audit.md` | Termos proibidos, mutations diretas, localStorage, deleted_at | 270 |
| `09-risk-register.md` | 23 riscos com severidade e mitigação | 260 |
| `10-refactor-roadmap.md` | 11 fases com critérios + cronograma sugerido | 240 |
| `11-open-questions.md` | 11 perguntas humanas com recomendações | 220 |
| **Total** | | **~3.130 linhas de doc** |

---

## 9 · Ponto positivo notável

A base de v1 (refactor 2026-04-28 · migs 60-65) entregou **arquitetura sólida**:

- ✅ 5 tabelas canônicas com CHECKs robustos
- ✅ Modelo excludente UUID-preservante
- ✅ 9 RPCs com matriz blindada
- ✅ `phase_history` audit imutável (insert-only via RLS)
- ✅ Multi-tenant via JWT (ADR-028)
- ✅ Sem triggers reversos B2B/VPI
- ✅ RLS strong em todas as 4 tabelas com WITH CHECK
- ✅ Zero mutations diretas em apps/lara fora de repos
- ✅ Server Actions tipadas com Zod
- ✅ Pattern Repository → Server Action → UI consistente

A próxima evolução é **incremento**, não rewrite. Refactor v2 vai adicionar:
- `lifecycle_status` (ortogonal)
- `crm_operational_view` (read model canônico)
- `crm_event_catalog` + log (governança de eventos)
- UI mesas operacionais novas
- Cutover do legacy

Toda a base de RPCs e RLS continua sendo reusada. **Custo do refactor é proporcional aos gaps, não ao tamanho do CRM.**
