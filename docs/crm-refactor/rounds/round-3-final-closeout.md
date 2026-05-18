# Round 3 · Final Closeout · Finalization + Post-Actions

**Status:** PASS_CRM_PARITY_R3_COMPLETE ✅
**Data:** 2026-05-18
**PR:** [#41](https://github.com/AldenQuesada/clinicai-v2/pull/41)
**Merge commit:** `efc3f26` (mergedAt 2026-05-18T19:58:26Z)
**Main HEAD (após closeout doc):** registrado abaixo
**Branch preservada:** `crm/parity-r3-finalization-post-actions` (não deletada, para auditoria)

Round 3 fecha o ciclo de paridade legacy: a finalização do agendamento agora
lê o estado financeiro completo (gross/discount/net/paid/pending/saldo
derived_payment_status via view 195 da R2), alerta operacionalmente quando
saldo > 0 e status=pago, e enfileira pós-ações internas (Google review D+3,
VPI indication, retouch reminder, complaint logged, payment follow-up) que
a secretaria dispatcha manualmente depois. **Zero envio externo
automático** — toda integração real com WhatsApp/Google/VPI fica para
Round 4+.

## Migration aplicada no one-ref `oqboitkpcvuaudouwvkl`

| Mig | Objeto | Highlights |
|---|---|---|
| 197 | `appointment_post_actions` | 5 action_type whitelist (google_review, vpi_indication, retouch_reminder, complaint_logged, payment_followup) + 4 status enum (pending/done/dismissed/cancelled) + 3 CHECKs (whitelist + enum + executed/dismissed consistency) + 4 indexes (clinic, appointment, pending+schedule, type+status) + RLS canon · 4 policies `TO authenticated` · DELETE gated por `is_admin()` + REVOKE ALL FROM anon (canon v2 mirror mig 196) + trigger `set_updated_at` |

## CI / Deploy

| Job | Status | Tempo |
|---|---|---|
| `typecheck + lint + build` (main · run 26057101271) | **success** | ~3m |
| `Playwright (chromium)` (PR · run 26056573781) | **success** | 1m30s |
| `Easypanel auto-deploy` (main · run 26057101237) | **success** | 13s |

Produção: https://lara.miriandpaula.com.br

## DB probes pós-merge

| Probe | Resultado |
|---|---|
| Worker 71 (`wa_outbox_worker_tick`, `jobid=71`) | `active=false` ✓ |
| `wa_outbox` totals | cancelled=50, failed=9, sent=66 (idêntico ao baseline pré-apply) ✓ |
| Invalid phases (compareceu/perdido/reagendado em `leads.phase`) | 0 ✓ |
| Objects existentes (R3 + R2) | `appointment_post_actions`, `appointment_financial_summary`, `appointment_procedure_items`, `appointment_payments` ✓ |
| RLS mig 197 | `relrowsecurity=true` ✓ |
| Policies mig 197 | 4 (DELETE/INSERT/SELECT/UPDATE) all `TO {authenticated}` ✓ |
| Grants mig 197 | authenticated, postgres, service_role · **ZERO anon** ✓ |
| CHECK constraints mig 197 | `chk_appt_post_action_type_whitelist` + `chk_appt_post_action_status_enum` + `chk_appt_post_action_executed_consistency` ✓ |

## App smoke (read-only · produção)

| Rota | HTTP | Comportamento |
|---|---|---|
| `/login` | 200 | renderiza login page |
| `/crm` | 200 (redirect) | gate auth → `/login?redirect=/crm` |
| `/crm/agenda` | 200 (redirect) | gate auth → `/login?redirect=/crm/agenda` |
| `/crm/agenda/novo` | 200 (redirect) | gate auth → `/login?redirect=/crm/agenda/novo` |
| `/` | 200 (redirect) | gate auth → `/login` |

Zero 500, zero crash, auth gate intacto. AUTH_REQUIRED_NOT_BLOCKING.
Smoke autenticado (FinalizeWizard com summary + post-actions checkboxes,
verify que post_actions são criadas mas zero efeito externo dispara) fica
para QA manual em browser ou staging E2E isolado.

## O que foi entregue

### DB

- **`appointment_post_actions`** (mig 197) · fila interna de pós-ações
  no finalize. Paridade legacy `clinic_op_queue` + `clinic_op_tasks`
  (localStorage no clinic-dashboard) sem efeito externo. Staff
  dispatcha manualmente · zero worker · zero provider.

### Packages

- **`AppointmentPostActionsRepository`** (`packages/repositories/src/appointment-post-actions.repository.ts`)
  - DTOs camelCase via mapRow.
  - Métodos: `listByAppointment`, `listPendingByClinic` (com filtros
    `actionType` + `limit`), `getById`, `create`, `createBatch` (bulk
    insert), `updateStatus` (executed_at/dismissed_at com CHECK
    consistency), `softDelete`.
  - Tipos exportados: `AppointmentPostActionDTO`, `AppointmentPostActionType`,
    `AppointmentPostActionStatus`, `CreateAppointmentPostActionInput`,
    `UpdateAppointmentPostActionStatusInput`.
  - Re-exportado em barrel `packages/repositories/src/index.ts`.

### apps/lara

- **Wire em `lib/repos.ts`** · `Repos.appointmentPostActions` no
  `makeRepos` factory.
- **`FinalizePostActionsSchema`** (`_schemas/appointment.schemas.ts`) ·
  3 campos opt-in: `googleReviewD3?`, `vpiIndication?`, `complaintNote?`.
- **`FinalizeAppointmentSchema.postActions`** opcional.
- **`finalizeAppointmentAction`** estendido:
  - Pós sub-call ok, fetch `getFinancialSummary` (view 195) +
    `listByAppointment` de items (mig 193).
  - Auto-enfileira `payment_followup` quando balance > 0.01 (D+3).
  - Auto-enfileira `retouch_reminder` por item is_return=true
    (D+returnIntervalDays).
  - Opt-in `google_review` (D+3) / `vpi_indication` / `complaint_logged`
    dos checkboxes.
  - `createBatch` best-effort · falha NÃO desfaz finalize.
  - Retorna `postActionsCreated` count.
- **`getAppointmentFinancialSummaryAction`** · read-only wrapper
  da view 195 usado pelo FinalizeWizard antes de submit.
- **FinalizeWizard** (`agenda/[id]/_actions-bar.tsx`):
  - useEffect fetch summary na abertura.
  - Painel "Resumo financeiro" (gross/discount/net/paid/pending/saldo
    + status derivado) com cores semânticas (verde quitado, âmbar
    pendente, vermelho excedente).
  - Alerta vermelho quando `paymentStatus=pago` + balance > 0.
  - 3 checkboxes opt-in (Google review D+3, VPI, queixa texto livre).
  - Footer informativo "zero mensagem real é enviada automaticamente".

### Tests + Docs

- **E2E spec** (`apps/lara/e2e/authed/crm-finalize-post-actions.spec.ts`)
  · 6 cenários Playwright (R3.1 saldo quitado · R3.2 saldo pendente
  cria payment_followup · R3.3 action_type fora whitelist rejeitado ·
  R3.4 CHECK consistency executed_at ↔ status=done · R3.5 zero
  wa_outbox criado pelo enqueue · R3.6 single-procedure legado
  continua compatível). Sem dynamic import de Server Actions · skip
  dinâmico via probeTable quando migrations não aplicadas.
- **Auth fixture fix** (`apps/lara/e2e/_fixtures/auth.ts`) · cache de
  session em memória para evitar Supabase Auth rate limit per-IP.
  Corrige falha que surgiu no primeiro CI run quando o R3 expandiu o
  suite. Beneficia toda a suite (R0/R1/R2/R3+).
- **Doc Prompt 1** (`docs/crm-refactor/rounds/round-3-prompt-1-finalization-post-actions-local.md`)
  · audit 3 agentes paralelos (legacy/v2/existing-tables) + patch
  local + SQL probes Prompt 2 + riscos + fora de escopo Round 4+.
- **Doc closeout** · este arquivo.

## Smoke transaction validation (Prompt 2 · ROLLBACK)

Cenário: 1 appointment fixture (status=bloqueado · sem XOR subject) +
5 post-actions (1 de cada action_type · 3 com schedule_at · 2 sem) ·
view retornou:

| Field | Got |
|---|---|
| total rows | 5 ✓ |
| google_review count | 1 ✓ |
| vpi_indication count | 1 ✓ |
| retouch_reminder count | 1 ✓ |
| complaint_logged count | 1 ✓ |
| payment_followup count | 1 ✓ |
| pending count | 5 ✓ |
| scheduled count | 3 ✓ |

4 CHECK violations rejeitadas em massa (action_type fora whitelist,
status fora enum, executed_at+pending, dismissed_at+pending). ROLLBACK
confirmado · zero rows persistidas.

## Achados in-flight (corrigidos durante Prompt 2)

### 1. Auth fixture Supabase rate limit (P0 · FIXADO)

**Sintoma**: primeira corrida do CI da PR #41 falhou em 6 testes não-R3
com `Request rate limit reached` ao chamar `supabase.auth.signInWithPassword()`.
Específicos quebrados: `orcamento-bulk-export.spec.ts`,
`crm-procedures-payments.spec.ts` (R3 single regression), `lead-create.spec.ts`.

**Causa raiz**: `getAuthedSupabase()` e `loginAs()` chamavam
`signInWithPassword` em CADA invocação. Suite crescente (R3 adicionou
~12 chamadas extras pela combinação `getSeed()` + `getAuthedSupabase()`
direto em cada test) acumulou e bateu o limit per-IP do Supabase Auth.

**Fix**: `getOrLogin` centralizada · cache em memória ao nível do
processo Playwright. Primeira chamada faz login real · subsequentes
reusam o token. Em erro, `_cachedAuthPromise` é resetado para permitir
retry. Beneficia TODA a suite, não só R3.

**Resultado**: CI re-rodou e passou (Playwright 1m30s · typecheck/lint/build
2m48s).

## Safety confirmations

- ✅ Zero migration reaplicada
- ✅ Zero db push · zero migration repair
- ✅ Zero deploy manual produção (Easypanel auto-deploy)
- ✅ Zero WhatsApp real · zero provider Evolution/Meta / Cloud API
- ✅ Worker 71 OFF preservado (`wa_outbox_worker_tick` `active=false`)
- ✅ wa_outbox delta 0 (cancelled=50, failed=9, sent=66 pré/pós idênticos)
- ✅ Zero cron novo
- ✅ Zero env/secrets em arquivo
- ✅ `appointment_finalize` RPC contract preservado (3 outcomes: paciente, orcamento, paciente_orcamento)
- ✅ Hard gate mig 167 preservado · clinical override admin único bypass
- ✅ `appointment_attend` / `lead_to_paciente` / `lead_to_orcamento` intocados
- ✅ Canon Phase 1C preservado · invalid_phases=0
- ✅ Zero Round 4 iniciado

## Fora de escopo (Round 4+)

- **Envio real WhatsApp** · fila criada mas zero dispatch automático.
- **Cashflow ledger** (`cashflow_entries` wire em finalize) — DEFERRED v2.2.
- **Google Review API** real · integração com Google Business API.
- **VPI autoEnroll** real (legacy RPC `vpi_autoEnroll()` está em
  clinic-dashboard · v2 não tem equivalente · queue só sinaliza staff).
- **TCLE auto-send** consent doc real · LegalDocumentsService.
- **Backfill items/payments/post_actions** para appointments existentes.
- **Staff dashboard da fila** · UI dedicada para secretaria dispatchar
  post-actions, marcar `done`/`dismissed`/`cancelled`.
- **Retouch wire** em `retoque_campaigns` (mig 150 legacy) · criação
  via RPC com next_retouch_date auto.
- **Complaint wire** em `patient_complaints` (mig 643 legacy) · em vez
  de só guardar texto livre em `appointment_post_actions.notes`.
- **Worker/cron automático** dispatchando a fila sem intervenção
  manual.

## Round 3 final summary

**Entregue:**
- 1 migration (197 `appointment_post_actions` + down)
- 1 repository (`AppointmentPostActionsRepository`) + factory wire
- 1 schema extension (`FinalizePostActionsSchema` + opt-in em
  `FinalizeAppointmentSchema`)
- 1 action extension (`finalizeAppointmentAction` com auto-enqueue
  payment_followup/retouch_reminder + opt-in google/VPI/complaint)
- 1 nova action (`getAppointmentFinancialSummaryAction`)
- UI extension no FinalizeWizard (resumo financeiro + alerta saldo +
  3 checkboxes opt-in)
- 1 E2E spec skeleton (6 cenários)
- 1 fix de fixture E2E (cache auth)
- 2 docs (Prompt 1 + closeout)

## Próximo round

**Round 4 SÓ após autorização explícita: `GO CRM_PARITY_R4_OPERATIONAL_UI_SURFACES_BEGIN`.**

Não iniciar automaticamente.
