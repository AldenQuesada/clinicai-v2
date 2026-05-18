# Round 5 · Prompt 1 · Backfills + Hardening + Full E2E · Local Patch

**Status:** LOCAL ONLY · ZERO commit · ZERO apply · ZERO backfill executed · ZERO deploy.
**Escopo:** auditar dados/RLS/grants/policies dos modelos R1/R2/R3/R4,
preparar 1 migration corretiva de hardening (mig 198), criar suite full
E2E (15 cenários) cobrindo agenda→finalize→post-actions, e documentar
decisão de **NÃO** executar backfill automatico de appointments legacy
para R2/R3.

Round 1 fechou agenda foundation. Round 2 fechou multi-procedure +
multi-payment. Round 3 fechou post_actions queue + finalize wiring.
Round 4 expôs tudo em UI operacional. **Round 5 endurece e valida** —
sem mover schemas além de hardening corretivo + retroativo R2.

## Baseline (read-only · pré-patch)

| Probe | Resultado |
|---|---|
| Worker 71 | `active=false` ✓ |
| `wa_outbox` totals | cancelled=50, failed=9, sent=66 ✓ |
| Invalid phases (compareceu/perdido/reagendado) | 0 ✓ |
| `appointment_procedure_items` | existe + RLS true |
| `appointment_payments` | existe + RLS true |
| `appointment_financial_summary` view | existe + `reloptions={security_invoker=true}` |
| `appointment_post_actions` | existe + RLS true |

## Audit Agent 1 · Backfill (read-only)

### Universe (post-merge R4)

| Categoria | Count | Comentário |
|---|---|---|
| `appointments` total (deleted_at IS NULL) | 76 | small universe |
| Finalizados | 17 | candidatos a derive post-actions |
| Cancelados | 0 | — |
| No-shows | 0 | — |
| Futuros (agendado/aguard/confirmado) | 11 | — |
| Com `value > 0` legacy | 21 | candidatos a appointment_payments |
| Com `payment_method` legacy | 5 | idem |
| Com `procedure_name` legacy | 34 | candidatos a appointment_procedure_items |
| Com `procedure_id` FK | 0 | **legacy data · todo snapshot manual** |
| Com `room_id` (R1) | 11 | restantes 65 vieram pré-R1 ou bloqueados |
| Com `recurrence_interval_days` | 0 | — |

### Cobertura atual R2/R3 (zero!)

| Tabela | Rows distintos appts | Total rows |
|---|---|---|
| `appointment_procedure_items` | **0** | **0** |
| `appointment_payments` | **0** | **0** |
| `appointment_post_actions` | **0** | **0** |

**Decisão: NO_BACKFILL_SAFE_INFERENCE.** Não executar backfill automático.

Razões:
1. **`value` legacy ambíguo** · pode ser bruto OR líquido dependendo da era.
   Backfill como `gross_amount` ou `net_amount`? Sem hint no schema · qualquer
   escolha estará errada em ~50% dos casos.
2. **`payment_method` single string** · não há como splitar em multi-pay
   (entrada+saldo, parcelado). Backfill assumiria 1 payment cobrindo
   `value` total, mas em muitos casos houve múltiplas formas no legacy.
3. **`procedure_name` snapshot text** · cannot reliably reconstruct
   multi-procedure (legacy `_apptProcs[]` foi armazenado só em
   localStorage, nunca persistido em DB v2). Backfill criaria 1 item
   matching `procedure_name`, perdendo informações de
   cortesia/retorno/desconto.
4. **`appointments.payment_status` enum legacy** tem semântica diferente
   (`pendente/parcial/pago/cortesia/isento`) do `derived_payment_status`
   da view 195 (`cortesia/pendente/parcial/pago`). Backfill via deriv
   bater 4 valores em 4 valores parece OK, mas `isento` não tem
   correspondente · loss of information.
5. **Post-actions retroativas seriam incorretas** · enfileirar
   `payment_followup D+3` retroativo poderia mostrar tasks "atrasadas
   há 60 dias" e bagunçar o staff dashboard. Retoque/queixa/VPI dependem
   de input humano no momento do finalize · sem hint legacy confiável.

**Recomendação:** appointments finalizados antes de R5 ficam **legacy
read-only**. Staff usa FinalizeWizard apenas para appointments **novos**.
Se um appointment legado precisar de procedimentos/pagamentos
itemizados, staff faz manualmente via UI (edita appointment + opt-in
multi-mode em /crm/agenda/novo flow ou via supabase Studio admin).

## Audit Agent 2 · DB Hardening

### RLS state · todas as tabelas

| Tabela | RLS | Force | Notas |
|---|---|---|---|
| `appointments` | true | false | canon v2 baseline |
| `appointment_procedure_items` | true | false | OK |
| `appointment_payments` | true | false | OK |
| `appointment_financial_summary` (view) | n/a | n/a | `security_invoker=true` ✓ |
| `appointment_post_actions` | true | false | OK |
| `leads` | true | false | OK |
| `patients` | true | false | OK |
| `orcamentos` | true | false | OK |
| `clinic_rooms` | true | false | OK |
| `professional_profiles` | true | false | OK |

`FORCE RLS` não é canon v2 (nenhuma tabela existing usa) · service_role
bypass intencional · não mudar nesta Round.

### Anon grants · **P0 FINDING**

| Tabela | anon_select | anon_writes | Status |
|---|---|---|---|
| `appointment_procedure_items` | **1** | **3** (I/U/D) | ❌ **diverge canon** |
| `appointment_payments` | **1** | **3** (I/U/D) | ❌ **diverge canon** |
| `appointment_financial_summary` | 0 | 0 | ✓ (mig 196 corrigiu) |
| `appointment_post_actions` | 0 | 0 | ✓ (mig 197 embed) |
| `appointments` | 0 | 0 | ✓ canon baseline |
| `leads` | 0 | 0 | ✓ canon |
| `patients` | 0 | 0 | ✓ canon |
| `orcamentos` | 0 | 0 | ✓ canon |
| `clinic_rooms` | 0 | 0 | ✓ canon |
| `professional_profiles` | 0 | 0 | ✓ canon |
| `phase_history` | 0 | 0 | ✓ canon |
| `clinic_procedimentos` | 0 | 0 | ✓ canon |

**Causa**: R2 migrations (193 e 194) criaram as tabelas com
`GRANT TO authenticated; GRANT ALL TO service_role` mas não fizeram
`REVOKE ALL FROM anon` · Supabase default ACL no schema `public` adicionou
anon automaticamente. Mesma lição que mig 196 (view 195) + mig 197
(post_actions com REVOKE embed) — mas R2 ficou pendente.

**Funcionalmente safe** (RLS + `clinic_id = app_clinic_id()` + anon →
NULL → zero rows), mas diverge do canon · **R5 corrige via mig 198**.

### Policies summary

| Tabela | Count | CMDs | All `TO {authenticated}` |
|---|---|---|---|
| `appointment_procedure_items` | 4 | DELETE/INSERT/SELECT/UPDATE | ✓ |
| `appointment_payments` | 4 | DELETE/INSERT/SELECT/UPDATE | ✓ |
| `appointment_post_actions` | 4 | DELETE/INSERT/SELECT/UPDATE | ✓ |

### FK + orphan check

| Check | Result |
|---|---|
| `appointment_procedure_items.appointment_id` FK orphans | **0** ✓ |
| `appointment_payments.appointment_id` FK orphans | **0** ✓ |
| `appointment_post_actions.appointment_id` FK orphans | **0** ✓ |
| `appointment_procedure_items.clinic_id` orphans | **0** ✓ |
| `appointment_payments.clinic_id` orphans | **0** ✓ |
| `appointment_post_actions.clinic_id` orphans | **0** ✓ |

## Audit Agent 3 · Full E2E Design

Suite criada em `apps/lara/e2e/authed/crm-full-e2e-flow.spec.ts` ·
15 cenários:

| # | Spec | Tipo | Dependency |
|---|---|---|---|
| R5.1 | single-procedure legado funciona | regression | appointments |
| R5.2 | multi-procedure + multi-payment inserts | happy path | R2 |
| R5.3 + R5.5 | view 195 sem cartesian · parcial derived | view canon | R2 + view |
| R5.4 | saldo quitado · derived=pago | view canon | R2 + view |
| R5.6 | cortesia · derived=cortesia | view canon | R2 + view |
| R5.7 | CHECK rejeita discount > gross | constraint | mig 193 |
| R5.8 | CHECK rejeita courtesy sem motivo | constraint | mig 193 |
| R5.9 | CHECK rejeita payment_method fora whitelist | constraint | mig 194 |
| R5.10 | CHECK rejeita action_type fora whitelist | constraint | mig 197 |
| R5.11 | CHECK executed_at exige status=done | constraint | mig 197 |
| R5.12 | zero wa_outbox criado pelo fluxo | safety | wa_outbox |
| R5.13 | zero anon grants R2/R3 tables | hardening | exec_sql RPC |
| R5.14 | invalid_phases=0 (canon Phase 1C) | canon | leads |
| R5.15 | `/crm/post-acoes` route deployed (smoke) | route | R4 |

Cleanup obrigatório via tag `is_e2e_r5` em `subject_name` · `afterAll`
soft-deleta items/payments/post_actions + hard-delete appts.

## Patch local

### Migration nova (LOCAL · NÃO aplicada)

`db/migrations/20260800000198_clinicai_v2_r2_tables_revoke_anon.sql` + `.down.sql`

Corretiva retroativa para R2 tables. Conteúdo:
```sql
REVOKE ALL ON public.appointment_procedure_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_procedure_items TO authenticated;
GRANT ALL ON public.appointment_procedure_items TO service_role;

REVOKE ALL ON public.appointment_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_payments TO authenticated;
GRANT ALL ON public.appointment_payments TO service_role;
```

Idempotente · safe re-apply. Down keeps zero anon (rollback intentional
NÃO restaura · canon v2).

Mig 198 NÃO toca:
- estrutura das tabelas (mig 193/194 intactas)
- RLS policies (já corretas)
- mig 195 view, mig 196, mig 197 (já corrigidos)
- `appointment_finalize` / hard gate / `appointment_attend`
- cron / worker 71 / wa_outbox / edge / env

### E2E spec novo

`apps/lara/e2e/authed/crm-full-e2e-flow.spec.ts` · 15 cenários
(detalhe na Audit Agent 3 section acima).

### Sem patch app/repos

Nenhuma mudança necessária em código TS. Repos R4 (`findByIds`,
`listByClinic`, `listByAppointmentIds`) cobrem todas as queries do
E2E novo. Actions R4 (`markPostActionDoneAction` etc) já enforçam
validações necessárias.

## Gates verde

- `pnpm --filter @clinicai/repositories typecheck` · **PASS**
- `pnpm --filter @clinicai/lara typecheck` · **PASS**
- `pnpm --filter @clinicai/lara test` · **70/70 PASS · 4 test files**
- `npx vitest run packages/utils/src/money.test.ts` · **29/29 PASS**
- `pnpm --filter @clinicai/lara build` · **PASS** (warnings pré-existentes)
- Canon grep nos artefatos novos · **clean**
- Provider/cron/WhatsApp/wa_outbox scan em artefatos novos · **clean**
- `git diff --check` · clean

## SQL probes para Prompt 2

### Pre-apply (verificar baseline)

```sql
-- 1. Worker 71 OFF
SELECT 'pre_worker_71' AS section, jobid, active, jobname
FROM cron.job WHERE jobid = 71;

-- 2. wa_outbox baseline
SELECT 'pre_wa_outbox' AS section, status, count(*) AS total
FROM public.wa_outbox GROUP BY status ORDER BY status;

-- 3. Invalid phases = 0
SELECT 'pre_invalid_phases' AS section, count(*) AS n
FROM public.leads
WHERE phase IN ('compareceu','perdido','reagendado');

-- 4. R2/R3/R4 objects existem (R5 não cria nem dropa nada além de grants)
SELECT
  'pre_objects' AS section,
  to_regclass('public.appointment_procedure_items')::text AS items,
  to_regclass('public.appointment_payments')::text AS payments,
  to_regclass('public.appointment_financial_summary')::text AS view_obj,
  to_regclass('public.appointment_post_actions')::text AS post_actions;

-- 5. Anon grants atuais (deve mostrar appointment_procedure_items + appointment_payments
--    com 7 privs cada antes do apply)
SELECT
  'pre_anon_r2' AS section,
  table_name,
  count(*) AS anon_priv_count
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND grantee = 'anon'
  AND table_name IN ('appointment_procedure_items','appointment_payments')
GROUP BY table_name
ORDER BY table_name;
-- esperado: 7 e 7 antes do apply
```

### Post-apply (verificar mig 198 efeito + zero regressão)

```sql
-- 1. Anon grants ZERO em R2/R3/view (canon completo)
SELECT
  'post_anon_zero' AS section,
  table_name,
  count(*) AS anon_priv_count
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND grantee = 'anon'
  AND table_name IN (
    'appointment_procedure_items',
    'appointment_payments',
    'appointment_financial_summary',
    'appointment_post_actions'
  )
GROUP BY table_name
ORDER BY table_name;
-- esperado: zero rows retornados

-- 2. Authenticated/service_role mantidos (grants preservados)
SELECT
  'post_auth_grants' AS section,
  table_name,
  grantee,
  count(*) AS priv_count
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('appointment_procedure_items','appointment_payments')
  AND grantee IN ('authenticated','service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
-- esperado: 7 privs per (table, grantee)

-- 3. RLS unchanged
SELECT 'post_rls' AS section, relname, relrowsecurity
FROM pg_class
WHERE oid IN (
  'public.appointment_procedure_items'::regclass,
  'public.appointment_payments'::regclass
);
-- esperado: relrowsecurity = true em ambas

-- 4. Policies unchanged (mig 198 só toca grants)
SELECT 'post_policies' AS section,
  tablename, count(*) AS n
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('appointment_procedure_items','appointment_payments')
GROUP BY tablename;
-- esperado: 4 cada

-- 5. Worker 71 unchanged
SELECT 'post_worker_71' AS section, jobid, active, jobname
FROM cron.job WHERE jobid = 71;
-- esperado: active=false (unchanged)

-- 6. wa_outbox delta 0
SELECT 'post_wa_outbox' AS section, status, count(*) AS total
FROM public.wa_outbox GROUP BY status ORDER BY status;
-- esperado: 50/9/66 idêntico ao baseline
```

### Sem smoke transaction (mig 198 é só REVOKE/GRANT)

Mig 198 não cria/altera estruturas · não há smoke insert necessário.
Verificar via probe pós-apply é suficiente.

## Rollback path (se Prompt 2 falhar)

Mig 198 tem `.down.sql` que re-aplica o REVOKE (intencional · canon não
restaura anon). Caso necessário rollback "real" (restaurar anon ACL
default Supabase), executar manualmente:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_procedure_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_payments TO anon;
```
Mas isso **diverge do canon v2** · não recomendado.

## Riscos / O que ficou fora

### Conhecidos · documentados

1. **NO_BACKFILL_SAFE_INFERENCE** documentado. 76 appointments legacy
   ficam read-only com schemas R0/R1; novos appointments usam R2/R3 via
   FinalizeWizard.
2. **Mig 198 é hardening · não muda comportamento** observável (RLS já
   garantia zero leak). Apenas alinha canon.
3. **E2E spec usa `is_e2e_r5` tag** para cleanup · se cleanup falhar,
   fixtures podem persistir e poluir staging. afterAll faz best-effort.
4. **R5.13 (anon grants check)** depende de RPC `exec_sql` que pode
   não estar exposto · skipa se indisponível · validação via probe SQL
   direto cobre.

### Fora de escopo (Round 6+)

- **Backfill manual de appointments legacy** · staff faz caso a caso.
- **Real provider** dispatch (Google Review API, VPI autoEnroll RPC,
  WhatsApp Evolution/Meta) · Round 7+.
- **Worker/cron** automático dispatchando fila · Round 7+.
- **Cashflow ledger** (`cashflow_entries`) wire · Round 6+.
- **TCLE / payment consent** auto-send.
- **Retouch/complaint** wire em tabelas dedicadas (legacy `retoque_campaigns`
  mig 150, `patient_complaints` mig 643) · Round 6+.
- **Bulk actions** multi-select no staff dashboard.
- **Full UI E2E coverage** (Playwright contra browser autenticado com
  seed completo de fixtures) · Round 6+.
- **FORCE RLS** em todas tabelas · debate arquitetural pendente.

## Próximas fases

- **Prompt 2** · apply controlado de mig 198 + run E2E full + probes
  pós-apply + commit + push + PR + CI watch.
- **Prompt 3** · merge + deploy + smoke final + closeout.
- **Round 6** · NÃO iniciar (instrução explícita).
