# Round 6 · Prompt 2 · Controlled Canary Execution Report

**Status:** PASS_CRM_PARITY_R6_PROMPT_2_CONTROLLED_CANARY_EXECUTED ✅
**Data:** 2026-05-18
**Branch:** `crm/parity-r6-controlled-release-canary` (de main `f2749ea`)
**Migrations:** ZERO novas · ZERO aplicadas neste Prompt
**Level A (read-only):** PASS · 8 rotas HTTP smoke 200
**Level B (write fixture):** PASS · 10 rows criadas + validadas + 100% cleanup
**Level C (real assisted):** NÃO EXECUTADO (requer GO explícito separado)

## Level A · Read-only canary (HTTP smoke produção)

| Rota | HTTP | Comportamento |
|---|---|---|
| `/login` | 200 | renderiza login |
| `/crm` | 200 | redirect auth gate `/login?redirect=/crm` |
| `/crm/agenda` | 200 | redirect auth gate |
| `/crm/agenda/novo` | 200 | redirect auth gate |
| `/crm/post-acoes` | 200 | redirect auth gate · R4 route deployed |
| `/crm/mesa-operacional` | 200 | redirect auth gate |
| `/crm/dashboard` | 200 | redirect auth gate |
| `/` | 200 | redirect `/login` |

Zero 500 · zero crash · auth gate consistente em todas as 8 rotas.

**CI Playwright suite NOT_RUN_LOCALLY** (env não disponível) · validação
contínua via CI runs históricos (R4/R5 specs PASS no PR merge times).

## Level B · Write fixture canary

### Inserções (HTTP 201)

| Tabela | Rows criados | Marcador |
|---|---|---|
| `appointments` | 1 | `subject_name = 'R6_CANARY_smoke_appt'` · status `bloqueado` (sem XOR subject) |
| `appointment_procedure_items` | 2 | `procedure_name LIKE 'R6_CANARY_%'` + `metadata.source = 'crm_parity_r6_controlled_canary'` |
| `appointment_payments` | 2 | `metadata.source = 'crm_parity_r6_controlled_canary'` |
| `appointment_post_actions` | 5 | 1 de cada action_type · `payload.source = 'crm_parity_r6_controlled_canary'` |
| **Total** | **10** | Todos com `is_canary_r6=true` no payload/metadata |

### Validação view 195 · derived_payment_status canon

Cenário: appt com 2 items (gross 100 + 50, discount 0 + 10) + 2 payments
(pago 100, pendente 40) → resultado esperado: `parcial`.

| Field | Expected | Got |
|---|---|---|
| `gross_total` | 150 | **150.00** ✓ |
| `discount_total` | 10 | **10.00** ✓ |
| `net_total` | 140 | **140.00** ✓ |
| `paid_total` | 100 | **100.00** ✓ |
| `pending_total` | 40 | **40.00** ✓ |
| `balance_total` | 40 | **40.00** ✓ |
| `procedure_items_count` | 2 | **2** ✓ |
| `payments_count` | 2 | **2** ✓ |
| `derived_payment_status` | parcial | **parcial** ✓ |

View 195 com `security_invoker=true` + CTE pré-aggregation (R2 cartesian
fix) confirmado funcional em produção.

### Post-actions queue · 5 action_types

Todas 5 inseridas com sucesso · CHECK whitelist respeitada:

- `google_review` (schedule_at = D+3)
- `vpi_indication` (schedule_at = NULL)
- `retouch_reminder` (schedule_at = D+30 · intervalDays=30 no payload)
- `complaint_logged` (schedule_at = NULL)
- `payment_followup` (schedule_at = D+3 · balance=40 no payload)

## Safety probes (pre · mid · post)

| Probe | Pre-canary | Mid-canary (após inserts) | Post-cleanup |
|---|---|---|---|
| Worker 71 `active` | false | false | false ✓ |
| `wa_outbox` cancelled | 50 | 50 | 50 ✓ |
| `wa_outbox` failed | 9 | 9 | 9 ✓ |
| `wa_outbox` sent | 66 | 66 | 66 ✓ |
| Invalid phases | 0 | 0 | 0 ✓ |
| R2/R3 objects | presentes | presentes | presentes ✓ |
| R6_CANARY appts | 0 | 1 | **0** ✓ |
| R6_CANARY items | 0 | 2 | **0** ✓ |
| R6_CANARY payments | 0 | 2 | **0** ✓ |
| R6_CANARY post_actions | 0 | 5 | **0** ✓ |

**ZERO wa_outbox delta · zero side effect externo · 100% cleanup.**

## Cleanup execution

SQL idempotente preparado em Prompt 1 · executado em ordem de
dependências (post_actions → payments → items → appointments) com FK
CASCADE como defense-in-depth. Filtros explícitos por
`payload->>'source'` / `metadata->>'source'` / `subject_name LIKE
'R6_CANARY_%'`.

Resultado final: **`canary_cleanup_verification` retornou (0,0,0,0)** ·
zero residue.

## Level C · NÃO EXECUTADO

Real assisted canary com paciente real requer GO explícito separado do
usuário com paciente e janela combinados. Não foi executado neste
Prompt 2 · não será executado em Prompt 3 (closeout).

## Local checks

| Check | Resultado |
|---|---|
| `git diff --check` | clean |
| `pnpm --filter @clinicai/repositories typecheck` | **PASS** |
| `pnpm --filter @clinicai/lara typecheck` | **PASS** |
| `pnpm --filter @clinicai/lara test` | **70/70 PASS · 4 test files** |
| `npx vitest run packages/utils/src/money.test.ts` | **29/29 PASS** |

## Riscos · documentados

1. **Cleanup falhou parcialmente** · NÃO ocorreu · all-or-nothing
   verification = (0,0,0,0). Se ocorresse, FK CASCADE removeria
   children quando o appointment for deletado · cleanup SQL é
   idempotente · pode ser re-rodado.
2. **wa_outbox write acidental** · NÃO ocorreu · delta 0 pre/mid/post.
3. **Worker 71 reativação acidental** · NÃO ocorreu · `active=false`
   pre/mid/post.
4. **Auth fixture cache (R3 fix)** · não tocado · canary roda via SQL
   direto via Management API, não via auth fixture E2E.

## Safety summary

- ✅ Zero migration aplicada · zero SQL mutativo fora canary insert + cleanup
- ✅ Zero WhatsApp real · zero provider Evolution/Meta / Cloud API
- ✅ Worker 71 OFF preservado · wa_outbox delta 0
- ✅ Invalid phases (compareceu/perdido/reagendado) = 0
- ✅ Zero cron novo · zero env/secrets em arquivo
- ✅ `appointment_finalize` RPC / hard gate mig 167 / `appointment_attend`
  / `lead_to_paciente` / `lead_to_orcamento` intocados
- ✅ Canon Phase 1C preservado
- ✅ **Zero anon grants em R2/R3/view** (R5 hardening preservado)
- ✅ **Level C NÃO executado** (requer GO explícito separado)
- ✅ **Zero residue R6_CANARY** após cleanup (100% verificado)
- ✅ Round 7 NÃO iniciado

## Próximas fases

- **Prompt 3** · closeout · merge PR (se houver mudança código) · doc
  final · smoke pós-merge. Como neste Prompt 2 não há patch de código
  (apenas docs), Prompt 3 será essencialmente: review PR + merge +
  smoke + closeout doc.
- **Round 7** · NÃO iniciar.
