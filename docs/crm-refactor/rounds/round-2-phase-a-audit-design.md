# Round 2 · Phase A · Audit + Design

> CRM_PARITY_R2_PROCEDURES_PAYMENTS_BEGIN · 2026-05-18 · branch `main` HEAD `aba8e1b` · **zero patch · zero migration · zero commit**

## Verdict

**`PASS_CRM_PARITY_R2_PHASE_A_AUDIT_READY`**

Audit + data-model proposal entregues. Banco one-ref intacto. Nenhuma migration criada/aplicada. Aguarda GO de Phase B para implementar.

## A0 · Precheck

| Item | Valor |
|------|-------|
| Repo | clinicai-v2 |
| Branch | `main` |
| HEAD | `aba8e1b` (closeout R1 commit) |
| Working tree | limpo (só untracked: test-results + docs antigos · não-funcionais) |
| Round 1 status | PASS_CRM_PARITY_R1_COMPLETE (fechado) |

## A1 · LEGACY_PROCEDURES_PAYMENTS_MATRIX

Fonte: `clinic-dashboard/js/agenda-modal.js` (community 0 do graphify) · 50+ funções no domínio.

| Feature | Arquivo / função | Comportamento | Regra |
|---------|------------------|---------------|-------|
| Multi-procedure state | `_apptProcs[]` array client-side | `{nome, valor, cortesia, cortesiaMotivo, retornoTipo, retornoIntervalo, fases}` por item | array em memória + persiste no localStorage e supabase quando salva |
| Adicionar procedimento | `apptAddProc()` L815 | Lê select/input · captura `data-sessoes/intervalo/fases` do catálogo · push em `_apptProcs` | Auto-sugere recurrence se totalDerivado>1 |
| Remover procedimento | `apptRemoveProc(i)` L897 | splice por index | – |
| Atualizar item | `apptProcUpdate()` L1014 | edita propriedade | – |
| Alerta multi-proc curto | `_checkMultiProcAlert()` L910 | bloqueia se 2+ procs em 1h sem dialog confirmar duração | dialog 1h/1h30/2h |
| Total com desconto | `_updateApptTotalWithDiscount()` L1113 + `apptCalcDesconto()` L1107 | aplica desconto sobre soma de valores | – |
| Valor total a pagar | `_apptValorTotalPagar()` L1212 | retorna o total já com desconto/cortesia descontados | usa `Money.sum/sub` se disponível |
| Pagamentos array | `_apptPagamentos[]` client-side | objeto por pagamento (forma, valor, parcelas, etc.) | – |
| Render pagamentos | `apptRenderPagamentos()` L1360 | UI dinâmica linha por linha | – |
| Update pagamento individual | `apptUpdatePagamento()` L1269 | edit linha | – |
| Total pagamentos = total | `apptUpdatePagamentosTotal()` L1403 + `apptSyncPagamentoTotal()` L809 | exibe `Alocado X / Y` · verde se igual, vermelho se diff | tolerância via `Money.isZero` |
| Reset pagamentos | `apptResetPagamentos()` L1226 | limpa array | – |
| Formas com parcelas | `_apptFormaTemParcelas()` L1198 | retorna boolean p/ crédito/parcelado/boleto/entrada_saldo | – |
| Cortesia per-item | `_apptProcs[i].cortesia + cortesiaMotivo` | flag + motivo string | obrigatório se cortesia=true |
| Retorno per-item | `_apptProcs[i].retornoTipo + retornoIntervalo` | enum `avulso\|retorno` + dias | retorno >0 quando tipo=retorno |
| Fases jsonb per-item | `_apptProcs[i].fases` | array `[{intervalo_dias, ...}]` | usado em recurrence |
| Save appointment | `saveAppt()` L1610 | persist `_apptProcs[]` + `_apptPagamentos[]` em localStorage + supabase | – |
| Finalize side effects | `confirmFinalize()` em `agenda-smart.finalize.js` | cashflow + WA pós · NÃO R2 | fora de R2 |
| `Money` helper | `window.Money` (legacy global) | `sum / sub / format / isZero` | precisa port pra TS |

## A2 · CRM_V2_CURRENT_CAPABILITIES

| Feature | Existe? | Onde | Status |
|---------|---------|------|--------|
| `appointments.procedure_id` FK | ✅ sim | mig 182 | single only · gap multi |
| `appointments.procedure_name` snapshot | ✅ sim | mig 62 | single only |
| `appointments.value` (numeric agregado) | ✅ sim | mig 62 | single total · sem breakdown |
| `appointments.payment_method` text | ✅ sim | mig 62 | single · sem multi-pay |
| `appointments.payment_status` enum | ✅ sim (mig 152) | `pendente/parcial/pago/cortesia/isento` | bom |
| Cortesia distinct from isento | ✅ sim | mig 152 + Zod refine schemas:353-378 | bom · per-appointment (não per-item) |
| Motivo cortesia | ✅ parcial | Zod refine + obs prepend `[Cortesia] ...` | per-appointment · prepend em obs |
| Múltiplos procedimentos | ❌ ausente | – | gap real P0 |
| Per-item value / discount / courtesy | ❌ ausente | – | gap real P0 |
| Per-item return + interval | ❌ ausente | – | gap real P0 |
| `orcamentos.items jsonb` | ✅ sim | mig 63 · `[{name, qty, unit_price, subtotal, procedure_code?}]` + CHECK | template canônico de items |
| `orcamentos.subtotal/discount/total` | ✅ sim | mig 63 · CHECK `total=subtotal-discount` tolerância 0.01 | template financeiro |
| `appointment_payments` table | ❌ ausente | – | gap real P0 |
| Multi-pagamento (parcelas, multi-forma) | ❌ ausente | – | gap real P0 |
| Money helper TS | ❌ ausente | `packages/utils` sem export `Money` | gap real P0 (legacy tem `window.Money`) |
| 10 formas de pagamento UI | ✅ sim (R1) | `_form.tsx:208-220` `PAYMENT_METHOD_OPTIONS` | falso positivo · mantida |
| `consultType` enum (consulta/avaliacao/retorno/procedimento) | ✅ sim | `_form.tsx:242-248` | falso positivo · mantida |
| Conflict detail com nomes | ✅ sim (R1) | `_form.tsx:967-981` + ConflictDetailEntry | falso positivo · mantida |
| FinalizeWizard (R1) | ✅ sim · 3 outcomes | `_actions-bar.tsx` + RPC `appointment_finalize` | NÃO mexer no hard gate |

## A3 · DB_MODEL_GAP_MATRIX

Migrations relevantes existentes:

| Mig | Conteúdo | R2 usa? |
|-----|----------|---------|
| 62 | `appointments` schema base (value/payment_method/payment_status/procedure_id/procedure_name/room_idx) | sim · single legacy preserva |
| 63 | `orcamentos` table com items jsonb + subtotal/discount/total + CHECKs | sim · template para R2 (mesmo padrão de CHECK em items) |
| 82 | `orcamento_followup` | fora R2 |
| 137 | orcamento_followup non-sdr guard | fora R2 |
| 151 | `appointment_finalize` RPC com p_orcamento_items jsonb | sim · interface compatível |
| 152 | `appointments.payment_status` enum + CHECK cortesia | sim · enum preservado |
| 167 | hard gate clínico | NÃO mexer |
| 182 | `procedure_id` FK | sim · single preserva |
| 187 | lead_to_orcamento canon | NÃO mexer |
| 188-190 (R1) | ferias/sala_id/room_id | preservar |
| 191-192 (R1) | canon hotfix | preservar |

| Entidade | Existe hoje? | Gap | Mig nova? | Risco |
|----------|--------------|-----|-----------|-------|
| `appointment_procedure_items` | ❌ | tabela inexistente · R2 cria | sim | baixo · nova tabela isolada |
| `appointment_payments` | ❌ | idem | sim | baixo |
| View `appointment_financial_summary` | ❌ | agregado read-only · útil para UI/relatórios | opcional | nenhum |
| RLS clinic_id per row | n/a (tabela nova) | precisa policies | sim · nas migrations | baixo |
| CHECK shape items | ✅ orcamentos tem template | porta para appointment items | sim | nenhum |

## A4 · FALSE_POSITIVE_REGISTER_R2

| Gap candidato | Realidade | Verdict |
|---------------|-----------|---------|
| 10 formas de pagamento | `PAYMENT_METHOD_OPTIONS` _form.tsx:208-220 já tem 10 | ✅ MANTER · não recriar |
| payment_status distinto de method | mig 152 já separa | ✅ MANTER |
| Total/subtotal em orçamento | mig 63 já tem · com CHECK | ✅ MANTER · usar como template |
| Cortesia distinta de isento | mig 152 + Zod já distinguem | ✅ MANTER · estender para per-item |
| Motivo cortesia | Zod refine já exige 3+ chars per-appointment | ✅ MANTER · estender per-item |
| `consultType` enum | já tem retorno/procedimento | ✅ MANTER |
| Conflict names | já renderiza | ✅ MANTER |
| roomId + ferias + sala_id | R1 entregou | ✅ MANTER |
| `appointment_finalize` aceita orcamento_items | RPC já aceita jsonb (mig 151) | ✅ MANTER · usar same shape |

## A5 · R2_GAP_PRIORITY

### P0 · paridade mínima R2 (precisa entregar nesta rodada)

| # | Gap | Evidência | Fix proposto |
|---|-----|-----------|---------------|
| R2-P0-1 | Tabela `appointment_procedure_items` | legacy `_apptProcs[]` virou jsonb · v2 vazio | Mig nova com FK appointment_id + clinic_id + RLS |
| R2-P0-2 | Per-item: price/discount/courtesy/return | legacy tem · v2 não | Colunas em appointment_procedure_items |
| R2-P0-3 | Tabela `appointment_payments` | legacy `_apptPagamentos[]` · v2 vazio | Mig nova com FK appointment_id + clinic_id |
| R2-P0-4 | Multi-pagamento (linhas) | legacy permite N pagamentos com formas distintas | 1 row por pagamento |
| R2-P0-5 | Soma payments = total | legacy `apptUpdatePagamentosTotal` valida | View ou trigger ou Zod refine + RPC validation |
| R2-P0-6 | Money helper TS | legacy `window.Money` · v2 nada | `packages/utils/src/money.ts` com `sum/sub/format/isZero/eq` |
| R2-P0-7 | payment_status derivado | hoje appointments.payment_status é só uma coluna · com multi-pay precisa derivar | View ou trigger que compute baseado em soma payments vs total |
| R2-P0-8 | Compat single existente | appointments legacy (procedure_id/value único) ainda devem funcionar | Não dropar campos legacy · novos campos opcionais · backfill em Round 5 |

### P1 · funcionalidades importantes mas adiáveis

| # | Gap | Resposta |
|---|-----|----------|
| R2-P1-1 | Parcelas avançadas (boleto/entrada-saldo data venc) | suportar campo `installments_count + first_due_date` em payments, sem parser complexo |
| R2-P1-2 | Convênio nome/auth | campo `metadata jsonb` em payments |
| R2-P1-3 | Multi-proc warning 1h slot | port da função legacy `_checkMultiProcAlert` para form v2 |
| R2-P1-4 | Auto-fill duração quando proc selecionado | port de defaults do catálogo |

### P2 · fora desta rodada

| # | Gap | Motivo de exclusão |
|---|-----|---------------------|
| R2-P2-1 | Cashflow integration | Round 3 (Finalization + post-actions) |
| R2-P2-2 | WA pós-atendimento | Round 3 |
| R2-P2-3 | Google review automation | Round 3 |
| R2-P2-4 | VPI auto-enroll | Round 3 |
| R2-P2-5 | clinic_op_tasks payment follow-up | Round 3 |
| R2-P2-6 | Retoques suggestion | Round 3 |
| R2-P2-7 | Per-item phases jsonb (recurrence avançada) | Round 3 ou 4 |

## A6 · R2_DATA_MODEL_PROPOSAL

### Tabela 1 · `public.appointment_procedure_items`

```sql
CREATE TABLE public.appointment_procedure_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  clinic_id           uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  procedure_id        uuid NULL REFERENCES public.clinic_procedimentos(id) ON DELETE SET NULL,
  procedure_name      text NOT NULL,                          -- snapshot textual
  quantity            numeric(8,2) NOT NULL DEFAULT 1,
  unit_price          numeric(12,2) NOT NULL DEFAULT 0,
  gross_amount        numeric(12,2) NOT NULL DEFAULT 0,       -- quantity * unit_price
  discount_amount     numeric(12,2) NOT NULL DEFAULT 0,
  net_amount          numeric(12,2) NOT NULL DEFAULT 0,       -- gross_amount - discount_amount
  is_courtesy         boolean NOT NULL DEFAULT false,
  courtesy_reason     text NULL,
  is_return           boolean NOT NULL DEFAULT false,
  return_interval_days int NULL,
  sort_order          int NOT NULL DEFAULT 0,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz NULL,

  CONSTRAINT chk_appt_proc_item_amounts_positive
    CHECK (quantity >= 0 AND unit_price >= 0 AND gross_amount >= 0
           AND discount_amount >= 0 AND net_amount >= 0),
  CONSTRAINT chk_appt_proc_item_discount_le_gross
    CHECK (discount_amount <= gross_amount + 0.01),
  CONSTRAINT chk_appt_proc_item_net_consistency
    CHECK (abs(net_amount - (gross_amount - discount_amount)) < 0.01),
  CONSTRAINT chk_appt_proc_item_courtesy_zero
    CHECK ((NOT is_courtesy) OR (net_amount = 0)),
  CONSTRAINT chk_appt_proc_item_courtesy_reason
    CHECK ((NOT is_courtesy) OR (courtesy_reason IS NOT NULL AND length(trim(courtesy_reason)) >= 3)),
  CONSTRAINT chk_appt_proc_item_return_interval
    CHECK ((NOT is_return) OR (return_interval_days IS NOT NULL AND return_interval_days > 0))
);

CREATE INDEX idx_appt_proc_items_appt ON public.appointment_procedure_items(appointment_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_appt_proc_items_clinic ON public.appointment_procedure_items(clinic_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_appt_proc_items_procedure ON public.appointment_procedure_items(procedure_id) WHERE procedure_id IS NOT NULL AND deleted_at IS NULL;
```

RLS:
```sql
ALTER TABLE public.appointment_procedure_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY proc_items_select ON public.appointment_procedure_items
  FOR SELECT USING (clinic_id = public.app_clinic_id());

CREATE POLICY proc_items_insert ON public.appointment_procedure_items
  FOR INSERT WITH CHECK (clinic_id = public.app_clinic_id());

CREATE POLICY proc_items_update ON public.appointment_procedure_items
  FOR UPDATE USING (clinic_id = public.app_clinic_id());

CREATE POLICY proc_items_delete ON public.appointment_procedure_items
  FOR DELETE USING (clinic_id = public.app_clinic_id() AND public.app_role() IN ('owner','admin'));
```

### Tabela 2 · `public.appointment_payments`

```sql
CREATE TABLE public.appointment_payments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id      uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  clinic_id           uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  payment_method      text NOT NULL,                          -- pix/dinheiro/debito/credito/parcelado/entrada_saldo/boleto/link/cortesia/convenio
  amount              numeric(12,2) NOT NULL DEFAULT 0,
  installments_count  int NULL,                                -- nullable · só se forma com parcelas
  first_due_date      date NULL,                               -- para boleto/parcelado
  paid_at             timestamptz NULL,
  status              text NOT NULL DEFAULT 'pendente',        -- pendente/pago/cancelado
  notes               text NULL,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,      -- convenio_nome, convenio_auth, link_url, troco, recebido...
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz NULL,

  CONSTRAINT chk_appt_payment_amount_positive
    CHECK (amount >= 0),
  CONSTRAINT chk_appt_payment_method
    CHECK (payment_method IN ('pix','dinheiro','debito','credito','parcelado','entrada_saldo','boleto','link','cortesia','convenio')),
  CONSTRAINT chk_appt_payment_status
    CHECK (status IN ('pendente','pago','cancelado')),
  CONSTRAINT chk_appt_payment_installments
    CHECK (installments_count IS NULL OR installments_count >= 1)
);

CREATE INDEX idx_appt_payments_appt ON public.appointment_payments(appointment_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_appt_payments_clinic ON public.appointment_payments(clinic_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_appt_payments_status_pending ON public.appointment_payments(clinic_id, status) WHERE status='pendente' AND deleted_at IS NULL;
```

RLS análoga.

### View read-only · `public.appointment_financial_summary` (opcional · R2 ou R3)

```sql
CREATE VIEW public.appointment_financial_summary AS
SELECT
  a.id AS appointment_id,
  a.clinic_id,
  COALESCE(SUM(pi.net_amount) FILTER (WHERE pi.deleted_at IS NULL), 0) AS items_total,
  COALESCE(SUM(p.amount) FILTER (WHERE p.deleted_at IS NULL AND p.status='pago'), 0) AS paid_total,
  COALESCE(SUM(p.amount) FILTER (WHERE p.deleted_at IS NULL AND p.status='pendente'), 0) AS pending_total,
  COUNT(pi.id) FILTER (WHERE pi.deleted_at IS NULL) AS items_count,
  COUNT(p.id) FILTER (WHERE p.deleted_at IS NULL) AS payments_count
FROM public.appointments a
LEFT JOIN public.appointment_procedure_items pi ON pi.appointment_id = a.id
LEFT JOIN public.appointment_payments p ON p.appointment_id = a.id
GROUP BY a.id, a.clinic_id;
```

### Backward compatibility

- `appointments.procedure_id / procedure_name / value / payment_method / payment_status` **PRESERVADOS** durante R2.
- Appointments single-procedure existentes continuam funcionando · NewAppointmentForm em "modo simples" preenche tanto os campos legacy quanto a tabela items (1 row).
- Backfill `appointments.procedure_name → appointment_procedure_items` fica para Round 5.
- `payment_status` agregado na tabela `appointments` recebe trigger ou view que computa de `appointment_payments` (R3 ou subfase tardia do R2).

### Migration order proposta

1. Mig N+1 · `appointment_procedure_items` + RLS + indexes
2. Mig N+2 · `appointment_payments` + RLS + indexes
3. Mig N+3 (opcional) · view `appointment_financial_summary`

Onde N = última mig aplicada. Atual = 192. Próximas = **193, 194, 195**.

### Rollback risk

- Tabelas novas isoladas · drop simples no down
- Sem alteração em tabelas legacy
- Sem migration repair
- Down rejeita por SAFETY no header se rodado contra prod com dados

## A7 · R2_UI_IMPACT_MATRIX

| Tela | Mudança | Risco | Depende mig? | E2E |
|------|---------|-------|--------------|-----|
| `/crm/agenda/novo` step 3 | Adicionar lista de procedimentos · botão "+ Adicionar procedimento" · render por linha (nome/qty/preço/desconto/cortesia/retorno) · totalizador inline | médio · maior change R2 | sim · 193 | sim |
| `/crm/agenda/novo` step 4 (revisão) | Tabela de items + soma total · mostra subtotal/discount/net | baixo | sim · 193 | sim |
| `/crm/agenda/novo` payment block | Tabela de pagamentos · botão "+ Adicionar pagamento" · soma vs total + diff colorido (verde/vermelho) | médio | sim · 194 | sim |
| `/crm/agenda/[id]/editar` | Carrega items + payments existentes · permite editar se status não-terminal | médio | sim · 193+194 | sim |
| `/crm/agenda/[id]` (detail) | Mostra resumo items + payments | baixo (read-only) | sim · 193+194 | parcial |
| FinalizeWizard | Lê items + payments existentes · valida soma · NÃO altera hard gate · NÃO mexe em appointment_finalize RPC | médio (precisa validação consistente) | sim · pode chamar view financial_summary | sim |
| Compat single | NewAppointmentForm em "modo simples" (1 procedimento) continua salvando para appointments.procedure_id+value E para appointment_procedure_items (1 row) | baixo (dual-write) | sim | sim regressão |

## A8 · R2_TEST_PLAN

| # | Type | Scenario | Gate | Requires DB apply? | Skip condition |
|---|------|----------|------|--------------------|----------------|
| T-01 | SQL probe | `appointment_procedure_items` exists + RLS | tabela criada · 4 policies | sim (mig 193) | – |
| T-02 | SQL probe | `appointment_payments` exists + RLS | tabela criada · 4 policies | sim (mig 194) | – |
| T-03 | SQL probe | CHECK constraints válidos | tentar insert violando · espera fail | sim | – |
| T-04 | SQL probe | View `appointment_financial_summary` retorna 0 rows com baseline | view existe · sem rows order para appointments sem items | sim (mig 195) | optional view |
| T-05 | Unit · packages/utils/money | `Money.sum([1.10, 2.20]) == 3.30` (sem rounding) | exact decimal handling | não | – |
| T-06 | Unit · money refines | `Money.eq(0, -0.001) == true` (tolerance) | – | não | – |
| T-07 | Zod · `AppointmentProcedureItemSchema` | aceita item válido, rejeita cortesia sem motivo | – | não | – |
| T-08 | Zod · `AppointmentPaymentSchema` | aceita payment válido, rejeita method fora whitelist | – | não | – |
| T-09 | Repository | `appointmentProcedureItems.list(appointmentId)` retorna items canon-mapeados | – | sim (mig 193) | – |
| T-10 | Server action | `addProcedureItemAction({appointmentId, ...})` insere row | – | sim | – |
| T-11 | E2E `crm-procedures-payments.spec.ts` | criar appt com 2 procs + 1 cortesia + 1 normal | total na view = soma net | sim | env disponível |
| T-12 | E2E | adicionar 2 payments (parcial + complete) · soma == total | – | sim | env |
| T-13 | E2E | soma payments < total → status derivado parcial | – | sim | env |
| T-14 | E2E | tentar adicionar item em appointment finalizado → bloqueado | – | sim | env |
| T-15 | E2E single regression | criar appt single procedure (modo legacy) · não quebra | items table contém 1 row + legacy fields ainda preenchidos | sim | env |
| T-16 | UI smoke | `/crm/agenda/novo` renderiza sem console error | – | depois de deploy | env |
| T-17 | Canon | worker 71 OFF · wa_outbox unchanged · phase canon preservado | – | – | sempre |

## A9 · R2_RELEASE_PLAN

| Phase | Conteúdo | Pode executar sem novo GO? |
|-------|----------|------------------------------|
| **A · audit + design** | este doc | ✅ entregue agora |
| **B · prepare local** | escrever migs 193/194/195 + Money helper + repositories + schemas + actions + UI skeleton · NÃO apply · NÃO commit | ❌ aguarda GO_PHASE_B |
| **C · audit-check local** | canon grep · typecheck · diff-check · review | ❌ aguarda GO_PHASE_C |
| **D · apply one-ref controlado** | apply 193 → probe → 194 → probe → 195 → probe · E2E staged | ❌ aguarda GO_PHASE_D |
| **E · commits + PR + CI** | granular commits · push branch · CI watch · merge se verde | ❌ aguarda GO_PHASE_E |
| **F · merge + deploy + smoke + closeout** | merge PR · pull main · Easypanel auto-deploy · DB probes · smoke · doc final | ❌ aguarda GO_PHASE_F |

Cada phase com seu próprio GO. Não auto-promove.

## A10 · Safety confirmations

- ✅ Zero migration aplicada
- ✅ Zero SQL mutativo rodado
- ✅ Zero commit · Zero push · Zero deploy
- ✅ Zero `supabase db push`
- ✅ Zero migration repair
- ✅ Zero WhatsApp · Zero provider
- ✅ Worker 71 intocado (OFF preservado pós-R1)
- ✅ wa_outbox unchanged (baseline cancelled=50 · failed=9 · sent=66)
- ✅ Zero alteração em `appointment_finalize` (mig 151)
- ✅ Zero alteração em hard gate (mig 167)
- ✅ Zero alteração em migrations históricas
- ✅ Zero env / secrets em arquivo
- ✅ Zero Round 3 work

## Próximo passo

Aguardar `GO CRM_PARITY_R2_PHASE_B_DESIGN_MIGRATIONS_AND_LOCAL_PATCH`.

Quando autorizado, Phase B vai:
1. Escrever `db/migrations/20260800000193_clinicai_v2_appointment_procedure_items.sql + .down.sql`
2. Escrever `db/migrations/20260800000194_clinicai_v2_appointment_payments.sql + .down.sql`
3. (opcional) `db/migrations/20260800000195_clinicai_v2_appointment_financial_summary_view.sql + .down.sql`
4. Criar `packages/utils/src/money.ts` (helper TS)
5. Criar `packages/repositories/src/appointment-procedure-items.repository.ts`
6. Criar `packages/repositories/src/appointment-payments.repository.ts`
7. Estender schemas: `AppointmentProcedureItemSchema`, `AppointmentPaymentSchema`
8. Estender actions: `addProcedureItemAction`, `addPaymentAction`, etc.
9. UI skeleton no NewAppointmentForm (sem dynamic import de Server Action no E2E · lição R1)
10. E2E spec `crm-procedures-payments.spec.ts` (skeleton)

Tudo local · nada aplicado · nada commitado · nada pushed até GO de Phase C+.
