# Round 2 · Final Closeout · Procedures + Payments

**Status:** PASS_CRM_PARITY_R2_COMPLETE ✅
**Data:** 2026-05-18
**PR:** [#40](https://github.com/AldenQuesada/clinicai-v2/pull/40)
**Merge commit:** `1d3e73a` (mergedAt 2026-05-18T19:01:50Z)
**Main HEAD:** `1d3e73a`
**Branch preservada:** `crm/parity-r2-procedures-payments` (não deletada, para auditoria)

Round 2 fecha a paridade financeira da finalização legacy (`_apptProcs[]` +
`_apptPagamentos[]`) que Round 1 deixou em aberto. Round 1 entregou a
fundação de agenda (sala/férias/expediente/antecedência · migs 188-192);
Round 2 entrega multi-procedimento, multi-pagamento, derivação canônica de
payment_status, Money helper TS, repositórios, schemas Zod e UI opt-in.

## Migrations aplicadas no one-ref `oqboitkpcvuaudouwvkl`

| Mig | Objeto | Highlights |
|---|---|---|
| 193 | `appointment_procedure_items` | 8 CHECKs (quantity > 0, net = gross − discount tol 0.01, courtesy → net=0 + reason ≥ 3, return → interval > 0, etc), 4 indexes WHERE deleted_at IS NULL, RLS + 4 policies TO authenticated (DELETE gated por is_admin) |
| 194 | `appointment_payments` | 4 CHECKs (amount > 0, installments NULL ou > 0, status enum, payment_method whitelist 10 valores canon), 4 indexes, RLS idêntico |
| 195 | view `appointment_financial_summary` | `WITH (security_invoker = true)` + CTE pré-aggregation (items_agg + payments_agg) para evitar produto cartesiano · derived_payment_status canônico |
| 196 | REVOKE ALL FROM anon na view | Canon v2 mirror de `crm_operational_view`, `v_ai_budget_today`, `wa_*_audit_view` (zero anon em views) |

## CI / Deploy

| Job | Status | Tempo |
|---|---|---|
| `typecheck + lint + build` (main · run 26054247620) | **success** | 3m02s |
| `Playwright (chromium)` (PR) | **success** | 1m50s (validado no PR · não roda em main por design) |
| `Easypanel auto-deploy` (main · run 26054247679) | **success** | 14s |

Produção: https://lara.miriandpaula.com.br (Easypanel deploy registrou success).

## DB probes pós-merge

| Probe | Resultado |
|---|---|
| Worker 71 (`wa_outbox_worker_tick`, `jobid=71`) | `active=false` ✓ |
| `wa_outbox` totals | cancelled=50 · failed=9 · sent=66 (idêntico ao baseline pré-apply) |
| Invalid phases (`compareceu`/`perdido`/`reagendado` em `leads.phase`) | 0 ✓ |
| Objects existentes | `appointment_procedure_items`, `appointment_payments`, `appointment_financial_summary` ✓ |
| RLS (193 + 194) | both `relrowsecurity=true` ✓ |
| View grants | authenticated, postgres, service_role · **anon ZERO** ✓ |
| View `reloptions` | `{security_invoker=true}` ✓ |

## App smoke (read-only · produção)

| Rota | HTTP | Comportamento |
|---|---|---|
| `/login` | 200 | renderiza login page |
| `/crm` | 200 (redirect) | gate auth → `/login?redirect=/crm` |
| `/crm/agenda` | 200 (redirect) | gate auth → `/login?redirect=/crm/agenda` |
| `/crm/agenda/novo` | 200 (redirect) | gate auth → `/login?redirect=/crm/agenda/novo` |
| `/` | 200 (redirect) | gate auth → `/login` |

Zero 500, zero crash, auth gate intacto. AUTH_REQUIRED_NOT_BLOCKING — gate
funcional, deploy saudável. Smoke autenticado (interação com toggle multi,
add procedures, add payments, view totalizador derivado) **fora do escopo
de Phase D smoke** (rolaria no spec E2E em staging isolado em iteração
futura).

## O que foi entregue

### DB

- **`appointment_procedure_items`** · linha-por-procedimento por
  agendamento. 17 colunas. Quantity numeric(10,2) (suporta fractional se
  necessário; UI atual gateia em int). FK `appointment_id` CASCADE para
  appointments e `procedure_id` SET NULL para clinic_procedimentos. RLS
  per-clinic via `app_clinic_id()`. Soft-delete via `deleted_at`.
- **`appointment_payments`** · linha-por-pagamento. 13 colunas. Whitelist
  10 formas canon (`pix`, `dinheiro`, `debito`, `credito`, `parcelado`,
  `entrada_saldo`, `boleto`, `link`, `cortesia`, `convenio`). Status
  `pendente`/`pago`/`cancelado`. RLS + soft-delete idêntico.
- **View `appointment_financial_summary`** · read-only. Agrega items +
  payments por appointment com pré-aggregation CTE. Calcula gross_total,
  discount_total, net_total, paid_total, pending_total, cancelled_total,
  balance_total, procedure_items_count, courtesy_items_count,
  payments_count, derived_payment_status, computed_at. `security_invoker
  = true` enforces RLS per-caller.
- **Anon canon** · zero grants em todas as views CRM_PARITY_R2.

### Packages

- **`@clinicai/utils` Money helper** (`packages/utils/src/money.ts`) ·
  port do `window.Money` legacy. Centavos int internos. API:
  `toCents/fromCents/round2/add/sub/sum/isZero/eq/lt/lte/gt/gte/abs/
  format` + domain helpers `sumGross/sumDiscount/sumNet/sumPayments/
  balance/derivePaymentStatus`. Suite vitest 29 testes (drift 10×0.1=1.0
  PASS, BR/US format, canon derivePaymentStatus, balance edge cases).
- **`@clinicai/repositories`** ·
  - `AppointmentProcedureItemsRepository` · CRUD + replaceForAppointment
    (soft-delete + insert).
  - `AppointmentPaymentsRepository` · CRUD + replaceForAppointment +
    getFinancialSummary (reads view 195).
  - Tipos DTOs camelCase via mapRow. Status enum renomeado em barrel
    para `AppointmentPaymentRowStatus` (evita colisão com tipo
    appointment-level legacy mig 152).

### apps/lara

- **Wire em `lib/repos.ts`** · `Repos.appointmentProcedureItems` +
  `Repos.appointmentPayments` no `makeRepos` factory.
- **Schemas Zod** (`_schemas/appointment.schemas.ts`) ·
  `AppointmentProcedureItemInputSchema` (refines: courtesy→reason ≥ 3,
  return→interval > 0, discount ≤ gross+0.01, net = gross−discount tol
  0.01) + `AppointmentPaymentInputSchema` (whitelist 10 valores,
  amount > 0). Cross-field refines em Create/Update (Σ pagamentos ≤ net
  + 0.01, paymentStatus=pago exige Σpago ≥ net, cortesia exige item
  courtesy + net=0).
- **Actions** (`_actions/appointment.actions.ts`) ·
  `createAppointmentAction` strip R2 fields antes do legacy insert +
  best-effort replaceForAppointment para items/payments;
  `updateAppointmentAction` replace-set semântico (`undefined` preserva,
  `[]` limpa, `[items]` substitui).
- **UI opt-in** (`agenda/novo/_form.tsx`) · toggle "Múltiplos
  procedimentos / pagamentos (paridade legado)" em Step 3 · default
  OFF · single-procedure legacy preservado.
- **`ProcedureItemsBlock`** (`agenda/novo/_components/procedure-items-
  block.tsx`) · lista de procedimentos com add/remove (catálogo, nome,
  quantidade, unit_price, discount, cortesia + motivo, retorno +
  intervalo) + bloco multi-pagamento + totalizador com cores semânticas
  (verde quitado, âmbar pendente, vermelho excedente) + role="alert" no
  overpayment + derived_payment_status live.

### Tests + Docs

- **E2E spec** (`apps/lara/e2e/authed/crm-procedures-payments.spec.ts`)
  · 6 cenários Playwright (R2.1 2 procedimentos · R2.2 cortesia exige
  motivo · R2.3 discount>gross rejeitado · R2.4 parcial · R2.5
  excedente · R2.6 single-procedure regression). Sem dynamic import de
  Server Actions. Skip dinâmico via `probeTable` quando migs não
  aplicadas. Auth gate via `TEST_SUPABASE_*` envs.
- **Docs** consolidados em `docs/crm-refactor/`:
  - `deep-1x1-audit-2026-05-18/` · 10 docs base do audit profundo
    legacy×v2 que originou o plano Round 2.
  - `CRM_DEEP_RULES_VALIDATIONS_GRAPH_AUDIT_2026-05-18.{html,md}` ·
    consolidado das regras + validações.
  - `rounds/round-2-phase-a-audit-design.md` · Phase A audit-design.
  - `rounds/round-2-phase-b-local-patch.md` · Phase B local patch.
  - `rounds/round-2-phase-c-audit-check.md` · Phase C audit-check.
  - `rounds/round-2-phase-d-one-ref-apply-smoke.md` · Phase D
    one-ref apply + smoke (cartesian bug fixado in-flight, anon
    grants achado documentado e corrigido via mig 196).
  - `rounds/round-2-final-closeout.md` · este doc.

## Smoke transaction validation (Phase D · ROLLBACK)

Cenário: 2 items (gross 100 + 50, discount 0 + 10) + 2 payments (pago 100,
pendente 40) · view retornou:

| Field | Expected | Got |
|---|---|---|
| gross_total | 150 | **150.00** ✓ |
| discount_total | 10 | **10.00** ✓ |
| net_total | 140 | **140.00** ✓ |
| paid_total | 100 | **100.00** ✓ |
| pending_total | 40 | **40.00** ✓ |
| balance_total | 40 | **40.00** ✓ |
| procedure_items_count | 2 | **2** ✓ |
| payments_count | 2 | **2** ✓ |
| derived_payment_status | parcial | **parcial** ✓ |

Constraints rejeitaram em massa em 4 INSERTs inválidos (discount>gross,
courtesy sem motivo, payment_method fora whitelist, amount<=0). ROLLBACK
confirmado · zero rows persistidas.

## Achados in-flight (corrigidos durante Phase C/D)

1. **Mig 195 sem `security_invoker = true`** (P0, fixado em Phase C
   audit-check). Sem o flag, view bypassa RLS das tabelas-base por
   ownership. Aplicado o canon "GOLD" documentado em mig 39.
2. **Mig 193/194 policies sem `TO authenticated`** (P1, fixado em Phase
   C). Funcionalmente equivalente (GRANTs limitam acesso), mas diverge
   do canon mig 63. Alinhado para defensa explícita.
3. **Cartesian bug na view 195** (P0, fixado in-flight em Phase D6).
   Primeiro smoke retornou valores 2× inflados porque LEFT JOIN direto
   de items + payments criava produto cartesiano. Fix com CTE pré-
   aggregation (`items_agg` + `payments_agg`) antes do JOIN.
4. **Anon grants default ACL na view 195** (P0, fixado via mig 196
   corretiva em Prompt 2). Supabase default ACL adicionou anon nas
   privilegios. Mig 196 fez REVOKE ALL FROM anon + GRANT SELECT canon
   para `authenticated`/`service_role`. Funcional já era seguro
   (`security_invoker` + RLS + view non-materialized), mas a divergência
   do canon foi corrigida.

## Safety confirmations

- ✅ Zero migration reaplicada além de 193/194/195/196 (e re-apply da
  195 com fix CTE foi o **mesmo arquivo** autorizado)
- ✅ Zero db push · zero migration repair
- ✅ Zero WhatsApp real · zero provider Evolution/Meta
- ✅ Worker 71 OFF preservado
- ✅ wa_outbox delta 0
- ✅ Zero cron novo · zero alteração em `cron.job`
- ✅ Zero env/secrets em arquivo
- ✅ `appointment_finalize` / hard gate mig 167 / `appointment_attend` /
  `lead_to_paciente` / `lead_to_orcamento` todos intocados
- ✅ Canon Phase 1C preservado · invalid_phases=0
- ✅ Zero Round 3

## Fora de escopo (Round 3+)

- **Edit-mode prefill** de items/payments existentes (B2 future)
- **Cashflow / post-actions** (Round 3+)
- **Backfill items/payments** para appointments existentes
- **Finalize avançado** com items multi-cortesia (Round 3+)

## Próximo round

Round 3 SÓ após autorização explícita: `GO CRM_PARITY_R3_FINALIZATION_POST_ACTIONS_BEGIN`.

Não iniciar automaticamente.
