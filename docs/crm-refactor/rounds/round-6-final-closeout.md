# Round 6 · Final Closeout · Controlled Release / Canary

**Status:** PASS_CRM_PARITY_R6_COMPLETE ✅
**Data:** 2026-05-18
**PR:** [#44](https://github.com/AldenQuesada/clinicai-v2/pull/44)
**Merge commit:** `bbcc5ba` (mergedAt 2026-05-18T22:35:18Z)
**Main HEAD (após closeout doc):** registrado abaixo
**Branch preservada:** `crm/parity-r6-controlled-release-canary`
**Migrations:** ZERO neste Round · ZERO código novo

Round 6 valida em **produção** que o ciclo de paridade R1-R5 funciona sob
auth real sem regressão, sem provider externo, sem worker automático, e
com rollback/cleanup claro. **Level A read-only + Level B write fixture
executados com sucesso · Level C real assisted NÃO executado** (requer
GO explícito separado com paciente/janela combinados).

## Entregue neste Round

**Zero código · zero migration · zero schema change.** Apenas docs:
- `docs/crm-refactor/rounds/round-6-prompt-1-controlled-release-canary-local.md` (readiness + canary plan 3 levels)
- `docs/crm-refactor/rounds/round-6-prompt-2-controlled-canary-execution.md` (execution report)
- `docs/crm-refactor/rounds/round-6-final-closeout.md` (este arquivo)

Round 6 prova que R1-R5 estão sólidos · não precisa novo código.

## CI / Deploy

| Job | Status | Tempo |
|---|---|---|
| `typecheck + lint + build` (PR · run 26064215613) | **success** | 29s |
| `typecheck + lint + build` (main · run 26064424942) | **success** | ~30s |
| `Playwright (chromium)` | skipped (docs-only PR · path filter) |
| `Easypanel auto-deploy` | **DOCS_ONLY_NO_DEPLOY_REQUIRED** · produção continua em R5 deploy (commit `f2749ea` ainda live) |

Produção: https://lara.miriandpaula.com.br

## DB probes pós-merge

| Probe | Resultado |
|---|---|
| Worker 71 (`wa_outbox_worker_tick`, `jobid=71`) | `active=false` ✓ |
| `wa_outbox` totals | cancelled=50, failed=9, sent=66 (delta 0 vs R5 baseline) ✓ |
| Invalid phases (compareceu/perdido/reagendado) | 0 ✓ |
| R2/R3 objects | `appointment_procedure_items`, `appointment_payments`, `appointment_financial_summary`, `appointment_post_actions` ✓ |
| **Anon grants em R2/R3/view** | **ZERO** ✓ (R5 hardening preservado) |
| **R6_CANARY residue (appts/items/payments/post_actions)** | **0/0/0/0** ✓ (cleanup permanente confirmado) |

## App smoke (read-only · produção)

| Rota | HTTP |
|---|---|
| `/login` | 200 |
| `/` | 200 |
| `/crm` | 200 (auth gate) |
| `/crm/agenda` | 200 (auth gate) |
| `/crm/agenda/novo` | 200 (auth gate) |
| `/crm/post-acoes` | 200 (auth gate · R4 route deployed) |
| `/crm/mesa-operacional` | 200 (auth gate) |
| `/crm/dashboard` | 200 (auth gate) |

Zero 500 · zero crash · auth gate consistente em todas. AUTH_REQUIRED_NOT_BLOCKING.

## Level A · Read-only canary (executado em Prompt 2)

8 rotas testadas via HTTP smoke · todas 200 com auth gate · zero crash · zero 500.

## Level B · Write fixture canary (executado em Prompt 2)

**10 rows criadas** com tag `R6_CANARY_` e `metadata.source =
'crm_parity_r6_controlled_canary'`:
- 1 appointment (`subject_name = 'R6_CANARY_smoke_appt'`, status `bloqueado`)
- 2 procedure_items (1 normal + 1 retorno; gross 100+50, discount 0+10, net 100+40)
- 2 payments (pix 100 `pago` + boleto 40 `pendente`)
- 5 post_actions (1 de cada action_type: google_review/vpi/retouch/complaint/payment_followup)

**View 195 validada em produção** · gross=150 · discount=10 · net=140 ·
paid=100 · pending=40 · balance=40 · `derived_payment_status='parcial'` ·
CTE pré-aggregation (R2 cartesian fix) + security_invoker=true funcionais.

## Cleanup · 100% residue-free

Hard-delete idempotente em ordem (post_actions → payments → items →
appointments) + FK CASCADE como defense-in-depth · filtros explícitos
por source/tag. Verification final: **`(0,0,0,0)`** em todas as R2/R3
tables. Re-verificado pós-merge: ainda **0/0/0/0**.

## Level C · NÃO executado

Real assisted canary com paciente real NÃO executado neste Round 6.
Requer GO explícito separado do usuário com paciente e janela
combinados (`GO CRM_PARITY_R6_ASSISTED_CANARY_<scenario>_BEGIN`).

## Safety summary

- ✅ **Level C NÃO executado** (preservada para janela autorizada)
- ✅ Zero WhatsApp real · zero provider Evolution/Meta / Cloud API
- ✅ Zero migration aplicada · zero db push · zero migration repair
- ✅ Zero backfill executed (NO_BACKFILL_SAFE_INFERENCE preserved from R5)
- ✅ Zero env/secrets em arquivo
- ✅ Worker 71 OFF preservado · wa_outbox unchanged (delta 0)
- ✅ Zero cron novo
- ✅ `appointment_finalize` RPC contract preservado
- ✅ Hard gate mig 167 preservado
- ✅ `appointment_attend` / `lead_to_paciente` / `lead_to_orcamento` intocados
- ✅ Canon Phase 1C preservado · invalid_phases=0
- ✅ **Zero anon grants em R2/R3/view** (R5 hardening canon completo)
- ✅ **Zero R6_CANARY residue** após cleanup + pós-merge re-verification
- ✅ Round 7 NÃO iniciado

## O que foi entregue

- **Readiness audit** completo (DB baseline + 11 rotas HTTP smoke + UI surfaces empty states + auth gate)
- **Canary plan 3 levels** (A read-only / B write fixture com tag · C real assisted)
- **Canary execution** Level A + B em produção · zero side effect externo
- **View 195 produção validada** · derived_payment_status canon `parcial` perfect
- **Cleanup residue-free** · 100% verificado pre/mid/post canary + pós-merge
- **3 docs** (Prompt 1 readiness · Prompt 2 execution · Final closeout)

## Métricas

- 2 commits docs no PR + 1 commit closeout em main
- ~846 insertions (todas em docs)
- Zero código · zero migration · zero patch técnico
- Branch preservada para auditoria

## O que ficou fora (Round 7+)

- **Level C real assisted canary** com paciente real (precisa GO explícito separado)
- **WhatsApp real dispatch** via worker 71 reativado
- **Provider Evolution/Meta** real
- **Worker/cron automático** dispatchando fila de post-actions
- **Real Google Review API** integration
- **VPI autoEnroll** real RPC
- **TCLE auto-send** real
- **Cashflow ledger** wire em finalize
- **Retouch/complaint** wire em tabelas dedicadas (legacy)
- **Final legacy freeze** · congelar appointments.value/payment_method/procedure_name após backfill manual
- **1x1 audit final** legacy vs v2 (Round 7)
- **FORCE RLS** arquitetural debate
- **Operational hardening adicional** (multi-clinic, multi-region)

## Próximo round

**Round 7 SÓ após autorização explícita: `GO CRM_PARITY_R7_LEGACY_FREEZE_FINAL_1X1_AUDIT_BEGIN`.**

Não iniciar automaticamente.
