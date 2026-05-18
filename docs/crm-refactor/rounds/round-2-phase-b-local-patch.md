# Round 2 · Phase B · Local Patch (Procedures + Payments)

**Status:** LOCAL ONLY · ZERO commit · ZERO apply · ZERO deploy.
**Escopo:** dual-write multi-procedimento + multi-pagamento sem regredir o
single-procedure legado em `appointments.value` / `appointments.payment_method`.

Round 1 fechou a fundação de agenda (sala/férias/expediente/antecedência ·
migs 188→192 + PR #39 mergeado). Round 2 fecha a paridade financeira da
finalização legacy: `_apptProcs[]` + `_apptPagamentos[]`.

## Artefatos criados nesta fase

### Migrations (LOCAL · não aplicar)

- `db/migrations/20260800000193_clinicai_v2_appointment_procedure_items.sql`
  · Tabela `appointment_procedure_items` (17 colunas, 8 CHECKs, 4 índices,
  RLS, GRANT, trigger updated_at). Paridade 1:1 com `_apptProcs[]`.
- `db/migrations/20260800000194_clinicai_v2_appointment_payments.sql`
  · Tabela `appointment_payments` (13 colunas, 4 CHECKs · whitelist 10
  formas canônicas, 4 índices, RLS, GRANT). Paridade 1:1 com
  `_apptPagamentos[]`.
- `db/migrations/20260800000195_clinicai_v2_appointment_financial_summary.sql`
  · VIEW read-only agregando totals + `derived_payment_status` canônico
  (`cortesia|pendente|parcial|pago`). GRANT SELECT.
- Cada migration tem `_down.sql` correspondente (revert seguro,
  drop em ordem inversa).

### Money helper (`packages/utils/src/money.ts`)

Port do legacy `window.Money` (clinic-dashboard). Centavos como inteiros
internamente · sem float drift em soma de N parcelas. Cobre:

- `toCents` / `fromCents` / `round2` · BR (1.234,56) e US (1,234.56).
- `add`, `sub`, `sum`, `isZero`, `eq`, `lt/lte/gt/gte`, `abs`, `format`.
- Domain helpers `sumGross` / `sumDiscount` / `sumNet` (procedure items),
  `sumPayments` (filtros por status), `balance`, `derivePaymentStatus`.
- Test suite (`money.test.ts`) cobrindo drift (10×0,10 = 1,00),
  conversões BR/US, derivação de status, balance positivo/zero/negativo.
- Re-export em `packages/utils/src/index.ts` (Money + helpers).

### Repositories (`packages/repositories/src/`)

- `appointment-procedure-items.repository.ts` · CRUD (listByAppointment,
  getById, create, update, softDelete, replaceForAppointment).
- `appointment-payments.repository.ts` · CRUD + `getFinancialSummary`
  (lê view 195).
- Re-export em `packages/repositories/src/index.ts` · tipo
  `AppointmentPaymentStatus` da repo renomeado em barrel para
  `AppointmentPaymentRowStatus` (evita conflito com o legacy
  `AppointmentPaymentStatus` em `appointments` via mig 152).
- Wire em `apps/lara/src/lib/repos.ts` → `Repos.appointmentProcedureItems`
  + `Repos.appointmentPayments` (importados no factory `makeRepos`).

### Zod + Server Actions (`apps/lara/src/app/crm/`)

- `_schemas/appointment.schemas.ts`
  - `AppointmentProcedureItemInputSchema` · refines:
    - courtesy → courtesyReason ≥ 3 chars
    - isReturn → returnIntervalDays > 0
    - discount ≤ gross (tolerância 0,01)
    - courtesy → net=0
    - net = gross - discount (tolerância 0,01)
  - `AppointmentPaymentInputSchema` · whitelist 10 formas, status
    `pendente|pago|cancelado`, amount > 0.
  - `CreateAppointmentSchema` e `UpdateAppointmentSchema` ganharam
    `procedureItems[]?` + `payments[]?` opcionais + refines cruzados:
    - block-time não aceita items/payments
    - soma de payments (pago+pendente) ≤ netTotal (+0,01)
    - `paymentStatus='pago'` exige `Σ(payments status=pago) ≥ net`
    - `paymentStatus='cortesia'` exige item com `is_courtesy=true` e
      net=0
- `_actions/appointment.actions.ts`
  - `createAppointmentAction` agora strip-a `procedureItems`/`payments`
    do input passado à `repos.appointments.create()` (legacy não conhece)
    e depois chama `replaceForAppointment` nas repos novas. Best-effort
    sem transação JS · falha do segundo passo não desfaz o appointment
    criado.
  - `updateAppointmentAction` aplica replace-set semântico:
    `undefined` preserva, `[]` limpa, `[items]` substitui (soft-delete +
    insert).

### UI patch (`apps/lara/src/app/crm/agenda/novo/`)

- Novo componente `_components/procedure-items-block.tsx`:
  - Lista de itens com add/remove · campos: catálogo, nome, quantidade,
    unit_price, discount, courtesy + reason, return + interval.
  - Bloco de pagamentos com método (10 opções canônicas), amount,
    installments, due_date, status, notes.
  - Totalizador (gross/discount/net) + cores semânticas para saldo
    (verde quitado, âmbar pendente, vermelho excedente).
  - Aviso `role="alert"` quando soma de pagamentos excede net.
  - Status derivado mostrado live (`cortesia|pendente|parcial|pago`).
- `_form.tsx`:
  - Toggle "Múltiplos procedimentos / pagamentos (paridade legado)"
    em Step 3 · opt-in que esconde/exibe o bloco.
  - Quando ativado e há linhas, submit envia `procedureItems[]` +
    `payments[]` para o server action · single-procedure legado segue
    funcionando (dual-write).
  - Wizard preserva todo o fluxo Step 1→4 original.

### E2E (`apps/lara/e2e/authed/crm-procedures-payments.spec.ts`)

6 cenários alinhados ao plano de paridade:

- **R2.1** · 2 procedimentos → view agrega gross/net + status `pendente`.
- **R2.2** · cortesia sem motivo é rejeitada pelo CHECK; com motivo +
  net=0 OK.
- **R2.3** · `discount_amount > gross_amount` rejeitado.
- **R2.4** · pagamento parcial → `derived_payment_status='parcial'`,
  balance=300 para item de 500 / pago 200.
- **R2.5** · pagamento excedente (150 contra net 100) → status `pago` +
  balance negativo.
- **R2.6** · regressão · single-procedure legado continua funcionando
  via colunas `appointments.value` / `payment_method`.

Skips dinâmicos via `probeTable` / `probeColumn` quando migrações ainda
não foram aplicadas no banco TEST · permite rodar suite parcial antes
de Phase D.

NÃO usa dynamic import de Server Actions (incompatível com Playwright).
Inserts diretos via Supabase JS authed.

## O que esta fase NÃO faz (gates duros)

- **Não aplica migrations** em nenhum banco (production única ou qualquer
  outro). Phase D (controlled apply) cuidará disso com janela.
- **Não commit · não push · não PR.** Fica tudo em `crm/parity-r2-procedures-payments`
  local até Phase E.
- **Não toca worker 71** (`wa_outbox_worker_tick`). OFF preservado.
- **Não dispara WhatsApp** (provider Evolution/Meta zero).
- **Não muta `appointment_finalize`** (RPC mig 167 hard gate intocada).
  O snapshot financeiro de items/payments é ortogonal ao path de finalize
  legacy via `appointments.value`/`payment_status`.
- **Não regride single-procedure.** Toggle multi é opt-in · UI default
  segue caminho legado. Action faz dual-write em ambos modos.

## Critérios para Phase C (audit-check)

- Typecheck dos 3 pacotes (`utils`, `repositories`, `apps/lara`) verde.
- `vitest` em `packages/utils` (`pnpm --filter @clinicai/utils test`)
  com o suite Money 100% pass.
- Greps canônicos:
  - Nenhuma `UPDATE public.leads SET phase` nova fora dos RPCs autorizados.
  - Nenhuma referência a `phase=compareceu|perdido|reagendado` (fases
    zumbis).
  - Nenhum `clinic_id` literal em migrations.
- Doc lista todos os artefatos criados com path absoluto.

## Próximas fases (não iniciar antes de Phase C VEREDITO)

- **C** · audit-check local · grep + typecheck + repo-coverage.
- **D** · one-ref controlled apply (token sbp_ inline, janela controlada).
- **E** · commit + push + PR + CI.
- **F** · merge + deploy + smoke + closeout.
- **Round 3** · NÃO iniciar (instrução explícita do usuário).
