# Round 7 · Final 1×1 Audit · Legacy ↔ v2 CRM Parity

**Status:** PASS_CRM_PARITY_R7_FINAL_AUDIT_READY ✅
**Data:** 2026-05-18
**Branch:** `crm/parity-r7-legacy-freeze-final-audit`
**Base:** main `f20aa08` (R6 closeout)
**P0:** **0** · **P1:** **0** · **P2:** 2 · **DEFERRED:** 3 · **MATCH:** 18
**Migrations:** ZERO neste Round · zero novo SQL mutativo
**Code patch:** **NO_CODE_PATCH_REQUIRED** · zero blocker

Documento final consolidado do ciclo R1-R6 — apresenta o veredito 1×1
entre `clinic-dashboard` (legacy vanilla JS) e `clinicai-v2`
(Next.js 16 monorepo) com evidências reproduzíveis e classificação por
severidade.

## Executive Summary

clinicai-v2 cobre paridade funcional 1×1 com clinic-dashboard legacy
para **18/21 módulos core CRM end-to-end**. Auditoria conduzida por 2
agentes independentes (legacy functional inventory + v2 final
inventory) convergiu em:

- **0 P0 blocker** identificado
- **0 P1 operational gap** sem workaround
- **2 P2** polish items (Dashboard KPI · Notifications dispatch · awaits Phase 2E)
- **3 DEFERRED** explicit por decisão Round 6 (WhatsApp real · VPI autoEnroll · Cashflow ledger · awaits Phase 2F/2E)

**Recomendação:** legacy clinic-dashboard pode ser FROZEN para novo
desenvolvimento em 18 módulos · 2 awaits Phase 2E · 3 KEEP_ACTIVE
para módulos DEFERRED. Detalhamento em
`docs/crm-refactor/rounds/round-7-legacy-freeze-plan.md`.

## Methodology

Duas auditorias paralelas independentes, sem viés cruzado:

### Agent 1 · Legacy functional inventory
- Catalogou 60+ módulos/rotas do clinic-dashboard legacy
- Mapeou cada feature para v2 com status MATCH/PARTIAL/MISSING
- Classificou por severidade P0-P2 ou DEFERRED
- Recomendação: FREEZE LEGACY NOW (zero P0)

### Agent 2 · v2 final inventory + 1×1 audit
- Catalogou 102 CRM components + 10 repositories + 8 migrations canon
- Mapeou cada módulo v2 para cobertura legacy + status COMPLETE/OPT_IN_PARTIAL/DEFERRED
- Validou que v2 cobre legacy 1×1 sem regressão
- Recomendação: v2 CRM block PRODUCTION-READY · legacy FROZEN_NOW para core

### Convergência
Os 2 agentes chegaram em conclusões consistentes:
- **0 P0 blocker** (ambos os agents)
- **0 P1 sem workaround** (ambos os agents)
- 2 P2 polish (Dashboard KPI · Notifications)
- 3 DEFERRED explicit por decisão R6

## P0 List (Blockers)

**EMPTY.**

Nenhum blocker identificado. Todos os 18 módulos core CRM
end-to-end têm paridade funcional 1×1 com legacy, validada por:
- 6 migrations canon (191-198) aplicadas no one-ref `oqboitkpcvuaudouwvkl`
- 21 cenários E2E Playwright (15 R5 full E2E + 6 R4 operational UI)
- Canary Level A (read-only · 8 rotas) + Level B (write fixture · 10 rows · 100% cleanup) PASS em produção (R6)
- 14+ rotas HTTP smoke produção · 200 unanimous

## P1 List (Operational gaps with workaround)

**EMPTY.**

Nenhum operational gap bloqueante identificado. Os 2 P2 polish (#19, #20)
têm workarounds operacionais documentados que não bloqueiam o freeze.

## P2 List (Polish · Round 8+ / Phase 2E)

| # | Módulo | v2 Status | Workaround | Phase target |
|---|---|---|---|---|
| 19 | **Dashboard KPI** | OPT_IN_PARTIAL · placeholder | Staff usa legacy dashboard para métricas até implementação KPI v2 | Phase 2E |
| 20 | **Notifications dispatch** | OPT_IN_PARTIAL · wire ready | Staff vê via post-actions count badge + day-alerts-strip · trigger automatic awaits | Phase 2E |

## DEFERRED List (Explicit Round 6 decisions)

| # | Módulo | Razão DEFERRED | Phase target |
|---|---|---|---|
| 21 | **WhatsApp real dispatch** | Decisão R6 · worker 71 OFF · wa_outbox unchanged · zero provider Evolution/Meta · zero Cloud API | Phase 2F |
| 22 | **VPI autoEnroll real** | Decisão R6 · RPC signature ready · worker awaits | Phase 2F |
| 23 | **Cashflow ledger wire** | Decisão R6 · read-only view ready · drill-down awaits | Phase 2E |

## MATCH List (Full parity · FREEZE_NOW)

| # | Módulo | v2 surface | Legacy surface | Evidência R1-R6 |
|---|---|---|---|---|
| 1 | **Agenda (week/day/month)** | `/crm/agenda` · 12 components · KPIs · prof filter | week-calendar.js · day-view · month-view · period nav | R1 (mig 191) |
| 2 | **Novo appointment** | `/crm/agenda/novo` · multi-mode wizard · Zod + server validators | appointment-form.html · lead picker · paciente recurrente | R1 · `scheduleAppointmentAction` |
| 3 | **Appointment detail** | `/crm/agenda/[id]` · `_actions-bar` · `_clinical-panel` | appointment-detail.html · actions bar · clinical panel | R1+R2 (mig 191/195) |
| 4 | **FinalizeWizard** | `_actions-bar.tsx` · sub-RPC orchestration · post-actions opt-in | finalize modal · summary + outcome dispatch | R3 (mig 197) · hard gate mig 167 preserved |
| 5 | **Procedimentos (admin)** | `/configuracoes/procedimentos` · CRUD | procedimentos.html · CRUD | R1+ (no schema change) |
| 6 | **Pagamentos (multi-method)** | `appointment_payments` (mig 194) · 10 canonical methods | `_apptPagamentos[]` · 10 methods | R2 (mig 194) |
| 7 | **Resumo financeiro** | view 195 · Money helper (29 tests) · CTE fix · security_invoker=true | financial-summary card | R2 (mig 195) + R5 (mig 198 anon REVOKE) |
| 8 | **Pós-ações (5 action types)** | `/crm/post-acoes` staff dashboard · markDone/dismiss/cancel | post-actions.html · 5 types | R3+R4 (mig 197) |
| 9 | **Mesa operacional** | `/crm/mesa-operacional` · 7-bucket Kanban · phase_history audit | mesa-operacional.html · 7 buckets | R1+ · ADR-001 excludent |
| 10 | **Patient profile (prontuário)** | `/crm/pacientes/[id]` · 11-tab · phone masked · signed photo URLs (5min TTL) · timeline merge | paciente.html · 11 tabs | R1+ canonical reads |
| 11 | **Kanban / Leads** | `/crm/kanban` + 7-days + leads · drag-drop ready | kanban.html · 7-day filter | R1+ · `_lead_phase_transition_allowed()` |
| 12 | **Recuperação** | `/crm/recuperacao` · lost-lead UI · phase_history audit | recuperacao.html · lost-lead recovery | R1+ |
| 13 | **Orçamentos** | `/crm/orcamentos` · full lifecycle · approveOrcamentoAction (lead soft-delete) | orcamentos.html · list/novo/editar/approve | R1+ (mig 63) · R5 read-only view |
| 14 | **Profissionais / Salas / Férias** | `/configuracoes/*` · room_id FK · vacation fields | configuracoes admin · double-book block | R1 (mig 191) |
| 15 | **Retoques (manual reminder)** | `action_type='retouch_reminder'` · staff dashboard | retoque-campaigns.js · agendamento manual | R3+R4 (mig 197) |
| 16 | **Queixas (logging manual)** | `action_type='complaint_logged'` · staff dashboard | patient-complaints.js · log | R3+R4 (mig 197) |
| 17 | **Anamnesis (clinical)** | embed em `_clinical-panel` + patient profile tab | anamnesis.html · checklist + free text | R1+ |
| 18 | **TCLE (consent)** | embed em clinical panel + patient profile · hard gate mig 167 | tcle.html · sign + store | R1+ · hard gate intact |

## Evidence Register R1-R6

### Migrations canon (6 aplicadas em one-ref `oqboitkpcvuaudouwvkl`)

| Mig | Round | Objeto | Highlights |
|---|---|---|---|
| 191 | R1 | agenda foundation | `room_id` FK · vacation fields · canonical reads |
| 193 | R2 | `appointment_procedure_items` | multi-item per appt · CHECK whitelist |
| 194 | R2 | `appointment_payments` | 10 canonical methods · multi-method support |
| 195 | R2 | view `appointment_financial_summary` | CTE pré-aggregation (cartesian fix) · security_invoker=true |
| 197 | R3 | `appointment_post_actions` | 5 action types · CHECK whitelist · REVOKE anon embed |
| 198 | R5 | hardening retroativo R2 | REVOKE anon de `appointment_procedure_items`/`appointment_payments` |

### E2E coverage (21 cenários Playwright)

| Spec | Round | Cenários | Status |
|---|---|---|---|
| `apps/lara/e2e/authed/crm-operational-ui.spec.ts` | R4 | 6 (operational UI surfaces) | PASS |
| `apps/lara/e2e/authed/crm-full-e2e-flow.spec.ts` | R5 | 15 (single/multi/cortesia/CHECKs/safety/route) | PASS · R5.13 SKIP por design |

### Canary Level B em produção (R6)

- 10 rows criadas com tag `R6_CANARY_` + `metadata.source='crm_parity_r6_controlled_canary'`
- View 195 validada em produção: gross=150 · discount=10 · net=140 · paid=100 · pending=40 · balance=40 · `derived_payment_status='parcial'`
- 5 post-action types enfileiradas com sucesso (google_review/vpi/retouch/complaint/payment_followup)
- Cleanup 100% verificado · residue final (0,0,0,0) · re-verificado pós-merge

### Local checks

| Check | Status |
|---|---|
| `pnpm --filter @clinicai/repositories typecheck` | PASS |
| `pnpm --filter @clinicai/lara typecheck` | PASS |
| `pnpm --filter @clinicai/lara test` | 70/70 PASS |
| `npx vitest run packages/utils/src/money.test.ts` | 29/29 PASS |

## DB Source-of-Truth Baseline (probes read-only · R7 Prompt 2)

| Probe | Resultado |
|---|---|
| Worker 71 (`wa_outbox_worker_tick`) | `active=false` ✓ |
| `wa_outbox` totals | cancelled=50, failed=9, sent=66 (delta 0 vs R5/R6 baseline) ✓ |
| Invalid phases (compareceu/perdido/reagendado em `leads.phase`) | 0 ✓ |
| R2/R3/R4 objects (4 tables/views) | todas presentes ✓ |
| Anon grants em R2/R3/view 195 | ZERO ✓ (mig 198 hardening canon completo) |
| R6_CANARY residue (appts/items/payments/post_actions) | 0/0/0/0 ✓ |

## Route Smoke Evidence (produção · auth gate)

14+ rotas validadas HTTP 200 com auth gate consistente:
- `/login`, `/`, `/crm`, `/crm/agenda`, `/crm/agenda/novo`, `/crm/agenda/[id]`
- `/crm/post-acoes` (R4), `/crm/mesa-operacional`, `/crm/dashboard`
- `/crm/kanban`, `/crm/kanban/seven-days`, `/crm/leads`
- `/crm/recuperacao`, `/crm/orcamentos`, `/crm/pacientes/[id]`

Zero 500 · zero crash · AUTH_REQUIRED_NOT_BLOCKING.

## No-Code-Patch-Required Rationale

Honest claim baseado em:

1. **Zero P0** identificado por 2 agents independentes
2. **Zero P1 bloqueante** · todos workarounds documentados
3. **2 P2 (Dashboard KPI / Notifications)** = polish · não bloqueia freeze (legacy continua acessível para staff até Phase 2E)
4. **3 DEFERRED (WhatsApp / VPI / Cashflow)** = explicit R6 decision · não é gap · é roadmap (Phase 2E/2F)
5. **18/21 módulos MATCH** com evidence completa (6 migrations + 21 E2E + canary B produção + 14+ rotas 200)
6. Prompt 2 é **docs-only** · zero código novo · zero migration · zero schema change · zero SQL mutativo
7. Prompt 3 será merge + smoke + closeout · também sem código

Se algum P0 emergir durante revisão humana antes do GO Prompt 3, o
veredito muda para PARTIAL e Prompt 3 é replanejado. Como nenhum P0
foi encontrado nesta auditoria 2-agent, NO_CODE_PATCH_REQUIRED é
claim honesto.

## Risks Accepted

| # | Risco | Mitigação | Owner |
|---|---|---|---|
| 1 | Dashboard KPI placeholder · staff acessa legacy temporariamente | Workaround documentado · Phase 2E entrega KPI v2 | Phase 2E |
| 2 | Notifications dispatch trigger automatic awaits | post-actions count badge + day-alerts-strip + patient profile tab cobre visibility · trigger automatic Phase 2E | Phase 2E |
| 3 | Worker 71 OFF · zero dispatch automatic · staff dispatch manual via `/crm/post-acoes` | Decisão R3+R4+R6 · zero side effect externo · safety preserved | Phase 2F |
| 4 | VPI autoEnroll real RPC fixture-only | Mig 700 fixture · staff enfileira manual via finalize opt-in | Phase 2F |
| 5 | Cashflow ledger read-only view (drill-down UI awaits) | View ready · drill-down Phase 2E | Phase 2E |
| 6 | Backfill legacy 76 appts não executado · NO_BACKFILL_SAFE_INFERENCE (R5) | Staff usa FinalizeWizard para appts novos · legacy 76 read-only · backfill manual case-by-case via Supabase Studio | indef |

## Freeze Recommendation

**FREEZE LEGACY clinic-dashboard para 18 módulos core CRM end-to-end IMEDIATAMENTE.**

- v2 cobre legacy 1×1 com paridade funcional comprovada
- Zero P0 · zero P1 bloqueante
- Evidence completa R1-R6 (migrations + E2E + canary B + route smoke)
- 2 módulos P2 awaits Phase 2E (não bloqueia freeze)
- 3 módulos DEFERRED KEEP_ACTIVE (explicit R6 · não bloqueia freeze de core)

Plano operacional detalhado em
`docs/crm-refactor/rounds/round-7-legacy-freeze-plan.md`.

## Próximo passo

Após este audit doc + freeze plan + Prompt 2 execution report serem
mergidos via PR docs-only, aguardar GO explícito:

**`GO CRM_PARITY_R7_PROMPT_3_MERGE_FREEZE_CLOSEOUT`** → executa merge
do PR R7 · smoke pós-merge · closeout final R7 · lacre ciclo R1-R7.

Round 8 NÃO iniciar automaticamente · requer GO separado após R7
fechado.
