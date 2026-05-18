# Round 6 · Prompt 1 · Controlled Release / Canary · Local Plan

**Status:** LOCAL ONLY · ZERO commit · ZERO canary write executed · ZERO deploy.
**Outcome:** `NO_CODE_PATCH_REQUIRED` · sistema pronto para canary execução
em Prompt 2 (com GO explícito · ainda **sem** writes reais sem
autorização). Este Prompt 1 entrega plano + matriz + probes + safety.

Rounds 1-5 lacrados. Round 6 transforma o ciclo de paridade em **release
controlado**: validar em produção que as telas/fluxos R1-R5 funcionam
sob auth real sem regressão, sem provider externo, sem worker
automático, e com rollback/cleanup claro.

## Release readiness baseline (read-only · todas verdes)

| Probe | Resultado |
|---|---|
| Worker 71 (`wa_outbox_worker_tick`) | `active=false` ✓ |
| `wa_outbox` totals | cancelled=50, failed=9, sent=66 (baseline R1-R5 preserved) ✓ |
| Invalid phases (compareceu/perdido/reagendado em `leads.phase`) | 0 ✓ |
| R2/R3 objects (`appointment_procedure_items`, `appointment_payments`, `appointment_financial_summary`, `appointment_post_actions`) | todos presentes ✓ |
| **Anon grants em R2/R3/view** | **ZERO** ✓ (R5 mig 198 + 196 + 197 canon completo) |
| Main HEAD | `f2749ea` (R5 closeout · 6 commits desde R4 merge) |
| CI status main | success ✓ |
| Easypanel deploy main | success ✓ |
| Produção URL | https://lara.miriandpaula.com.br |

## Route readiness HTTP smoke (todas verdes)

| Rota | HTTP | Comportamento |
|---|---|---|
| `/login` | 200 | renderiza |
| `/crm` | 200 (redirect) | gate auth |
| `/crm/agenda` | 200 (redirect) | gate auth |
| `/crm/agenda/novo` | 200 (redirect) | gate auth |
| `/crm/post-acoes` | 200 (redirect) | gate auth · R4 deployed |
| `/crm/mesa-operacional` | 200 (redirect) | gate auth |
| `/crm/dashboard` | 200 (redirect) | gate auth |
| `/crm/recuperacao` | 200 (redirect) | gate auth |
| `/crm/leads` | 200 (redirect) | gate auth |
| `/crm/pacientes` | 200 (redirect) | gate auth |
| `/` | 200 (redirect) | gate auth |

Zero 500. Zero crash. Auth gate consistente.

## NO_CODE_PATCH_REQUIRED (Agent 4 audit)

UI/UX surfaces auditadas via grep. Empty states + null fallbacks já
existem em todos os pontos potencialmente vazios:

| Surface | Empty state present | Null guard | Status |
|---|---|---|---|
| `/crm/post-acoes` queue | "Nenhuma pós-ação ..." | n/a | ✓ |
| Patient profile tab Pós-ações | "Nenhuma pós-ação registrada para este paciente" | n/a | ✓ |
| Day alerts strip | `if (relevant.length === 0) return null` | early return | ✓ |
| Appointment detail rich cards | render conditional `if (procedureItems.length > 0)` | early return | ✓ |
| FinalizeWizard financial summary | `if (finSummary && (count > 0))` | conditional | ✓ |
| Topbar Tasks button | linked to `/crm/post-acoes` (existe) | n/a | ✓ |

**Sem patch local necessário** para Prompt 2. Sistema está canary-ready.

## Canary scenario matrix (3 levels · Agent 2 design)

### Level A · READ-ONLY canary (autorizado sem GO adicional)

| # | Cenário | Pré-condição | Passos | Expected | Probes | Cleanup | GO necessário |
|---|---|---|---|---|---|---|---|
| A.1 | Login + topbar | user auth válido | Acessar `/login`, autenticar, validar topbar carrega | Topbar mostra avatar + Tasks button + nav · Bell polling | n/a | n/a | ❌ não |
| A.2 | Agenda calendar | autenticado | `/crm/agenda` · validar week view + KPIs + day alerts strip (se houver pending) | KPIs visíveis · alerts strip null OU pills com counts | `appointment_post_actions` SELECT pending | n/a | ❌ não |
| A.3 | Staff dashboard | autenticado | `/crm/post-acoes` · filtros (status/tipo) · ver fila pending | Empty state OU tabela com badges + cores · status derivado per row | `appointment_post_actions` SELECT | n/a | ❌ não |
| A.4 | Patient profile tabs | autenticado | `/crm/pacientes/[id]` · clicar tab "Pós-ações" | Empty OU tabela cross-appointments do paciente | `appointment_post_actions` JOIN appointments | n/a | ❌ não |
| A.5 | Appointment detail rich | autenticado · appt fixture | `/crm/agenda/[id]` para appt com R2/R3 rows | Cards Procedimentos + Pagamentos + Pós-ações inline | R2/R3 SELECT | n/a | ❌ não |
| A.6 | Mesa operacional | autenticado | `/crm/mesa-operacional` · 7 buckets | Buckets carregam · KPIs corretos | `crm_operational_view` | n/a | ❌ não |
| A.7 | Recuperação | autenticado | `/crm/recuperacao` · 3 buckets | Workflow buckets carregam | `commercial_recovery_workflow_view` | n/a | ❌ não |

### Level B · WRITE FIXTURE canary (precisa GO Prompt 2)

| # | Cenário | Pré-condição | Passos | Expected | Probes | Cleanup |
|---|---|---|---|---|---|---|
| B.1 | Criar appointment canary | autenticado | Criar appt `status=bloqueado` + `subject_name='R6_CANARY_<scenario>'` (sem XOR subject) | row criada · zero side effect | `appointments` SELECT/COUNT | hard delete por subject_name LIKE 'R6_CANARY_%' |
| B.2 | Adicionar items + payments | B.1 OK | INSERT em `appointment_procedure_items` + `appointment_payments` para o appt B.1 | rows criadas · CHECK constraints OK | `appointment_procedure_items.appointment_id` filter | soft-delete via `deleted_at = now()` |
| B.3 | Validar view 195 | B.2 OK | SELECT `appointment_financial_summary` para o appt | gross/net/paid/derived_payment_status corretos | view SELECT | n/a (view) |
| B.4 | Enqueue post-action manual | B.1 OK | INSERT `appointment_post_actions` (action_type='google_review', status='pending') para o appt | row criada · zero wa_outbox delta | `appointment_post_actions` SELECT + `wa_outbox` baseline check | soft-delete `deleted_at = now()` |
| B.5 | Mark done via action | B.4 OK | Server action `markPostActionDoneAction({id})` | status → done · executed_at populated | `appointment_post_actions` SELECT | already done · soft-delete depois |
| B.6 | Dismiss via action | B.4 alt | Server action `dismissPostActionAction({id, reason})` | status → dismissed · dismissed_reason populated | idem | idem |
| B.7 | Cancel via action | B.4 alt | Server action `cancelPostActionAction({id})` | status → cancelled | idem | idem |

**Restrição B**: Prompt 2 só executa Level B se GO `CRM_PARITY_R6_PROMPT_2_*` for explícito. Cleanup obrigatório via tag `R6_CANARY_` em `subject_name`.

### Level C · REAL ASSISTED canary (precisa GO explícito do usuário)

| # | Cenário | Pré-condição | Risco | Cleanup |
|---|---|---|---|---|
| C.1 | Staff real cria appt para paciente real | autorização do usuário · paciente combinado | gera row real persistente | manual via UI ou Supabase Studio |
| C.2 | Staff real finaliza appt | C.1 + hard gate satisfeito | gera post-actions reais · NUNCA dispatch externo | post-actions ficam pending para dispatch manual |
| C.3 | Staff real dispatch manual post-action | C.2 + autorização final | **possível side effect operacional** (mensagem WhatsApp manual fora do sistema) | n/a · ação humana |

**Restrição C**: NUNCA executar em Prompt 1 ou 2. Requer GO explícito separado do usuário (`GO CRM_PARITY_R6_ASSISTED_CANARY_<scenario>_BEGIN` com paciente e janela combinados).

## R6 canary data safety plan (Agent 3)

### Tag convention
- Fixture name: `subject_name = 'R6_CANARY_<purpose>_<timestamp>'`
- Payload metadata: `{"source": "r6_canary", "scenario": "B.X"}` em `appointment_post_actions.payload`
- E2E spec tag mantém `is_e2e_*` pattern do R3/R5

### Cleanup strategy

**Preferred**: transaction-bounded smoke quando possível.
```sql
BEGIN;
-- INSERT canary fixtures
-- ... validate via view ...
ROLLBACK;
-- zero leakage
```

**When ROLLBACK not feasible** (cross-statement Management API behavior):
- Soft-delete via `UPDATE ... SET deleted_at = now() WHERE subject_name LIKE 'R6_CANARY_%'`
- RLS preserva isolamento clinic_id
- Hard-delete em appointments só após verificar zero items/payments/post_actions ativos linkados (FK CASCADE limpa)

### Zero side effect guarantee

- **wa_outbox**: nenhum INSERT durante canary · baseline 50/9/66 preserved
- **Worker 71**: nunca ativar
- **Cron**: zero alteração
- **Provider**: zero HTTP call externo
- **Cloud API**: zero env touch
- **leads.phase / lifecycle_status**: nunca tocar fora dos RPCs canônicos
- **appointment_finalize** RPC: não chamar com paciente real até C.X

## E2E / smoke harness (Agent 5)

**Decisão**: reaproveitar specs existentes em vez de criar novo arquivo.

- `apps/lara/e2e/authed/crm-operational-ui.spec.ts` (R4) · cobre Level A
  navegação · 6 cenários read-only.
- `apps/lara/e2e/authed/crm-full-e2e-flow.spec.ts` (R5) · cobre Level B
  write-via-fixtures · 14 cenários ativos (R5.13 skipped por design).

Ambos rodam em CI Playwright contra produção (skip-on-404 + probeTable
graceful). Total coverage Level A + B = **20 cenários ativos**. Nenhum
spec novo R6 é necessário.

Prompt 2 pode opcionalmente rodar manualmente:
```bash
pnpm --filter @clinicai/lara exec playwright test \
  apps/lara/e2e/authed/crm-operational-ui.spec.ts \
  apps/lara/e2e/authed/crm-full-e2e-flow.spec.ts \
  --project=chromium
```

## SQL probes para Prompt 2 (Agent 6)

### Pre-canary baseline

```sql
-- 1. Worker 71 OFF
SELECT 'pre_canary_worker_71' AS section, jobid, active, jobname
FROM cron.job WHERE jobid = 71;
-- esperado: active=false

-- 2. wa_outbox baseline (snapshot pra delta check)
SELECT 'pre_canary_wa_outbox' AS section, status, count(*) AS total
FROM public.wa_outbox GROUP BY status ORDER BY status;
-- esperado: 50/9/66

-- 3. Invalid phases
SELECT 'pre_canary_invalid_phases' AS section, count(*) AS n
FROM public.leads
WHERE phase IN ('compareceu','perdido','reagendado');
-- esperado: 0

-- 4. R2/R3/R4 row counts atual (pre-canary baseline)
SELECT 'pre_canary_r2r3_counts' AS section,
  (SELECT count(*) FROM public.appointments WHERE deleted_at IS NULL) AS appts,
  (SELECT count(*) FROM public.appointment_procedure_items WHERE deleted_at IS NULL) AS items,
  (SELECT count(*) FROM public.appointment_payments WHERE deleted_at IS NULL) AS payments,
  (SELECT count(*) FROM public.appointment_post_actions WHERE deleted_at IS NULL) AS post_actions;

-- 5. Zero R6_CANARY fixtures pre-execution (proteção contra leftover)
SELECT 'pre_canary_orphan_check' AS section, count(*) AS leftover_canary
FROM public.appointments
WHERE subject_name LIKE 'R6_CANARY_%' AND deleted_at IS NULL;
-- esperado: 0
```

### Post-canary verification

```sql
-- 1. Safety unchanged
SELECT 'post_canary_safety' AS section,
  (SELECT active FROM cron.job WHERE jobid=71) AS worker_71_active,
  (SELECT count(*) FROM public.wa_outbox) AS wa_outbox_total,
  (SELECT count(*) FROM public.leads WHERE phase IN ('compareceu','perdido','reagendado')) AS invalid_phases;
-- esperado: false, 125 (unchanged), 0

-- 2. Canary fixtures count (se Level B executado)
SELECT 'post_canary_fixtures' AS section, count(*) AS canary_rows
FROM public.appointments
WHERE subject_name LIKE 'R6_CANARY_%' AND deleted_at IS NULL;
-- esperado conforme Level B execution count

-- 3. Cleanup verification (após cleanup step)
SELECT 'post_canary_cleanup' AS section, count(*) AS leftover
FROM public.appointments
WHERE subject_name LIKE 'R6_CANARY_%' AND deleted_at IS NULL;
-- esperado: 0 (todos soft-deletados ou hard-deletados)
```

### Cleanup SQL (preparada · NÃO executada em Prompt 1)

```sql
-- Soft-delete all R6_CANARY fixtures (idempotente)
UPDATE public.appointment_post_actions
SET deleted_at = now()
WHERE appointment_id IN (
  SELECT id FROM public.appointments WHERE subject_name LIKE 'R6_CANARY_%'
) AND deleted_at IS NULL;

UPDATE public.appointment_payments
SET deleted_at = now()
WHERE appointment_id IN (
  SELECT id FROM public.appointments WHERE subject_name LIKE 'R6_CANARY_%'
) AND deleted_at IS NULL;

UPDATE public.appointment_procedure_items
SET deleted_at = now()
WHERE appointment_id IN (
  SELECT id FROM public.appointments WHERE subject_name LIKE 'R6_CANARY_%'
) AND deleted_at IS NULL;

-- Hard-delete appointments (FK CASCADE limpa children)
DELETE FROM public.appointments
WHERE subject_name LIKE 'R6_CANARY_%';
```

## Riscos · documentados

1. **Level B canary cria rows persistentes**. Mitigação: tag `R6_CANARY_`
   + cleanup SQL preparada · executar imediatamente após verification.
2. **Level C canary com paciente real** depende de GO humano. Mitigação:
   nunca executar sem autorização nominal + janela combinada.
3. **Worker 71 reativação acidental**. Mitigação: probe pré/pós checa
   `cron.job.active = false` · qualquer flip detectado bloqueia
   continuação.
4. **wa_outbox writes acidentais**. Mitigação: count pré/pós · qualquer
   delta > 0 é regressão e exige rollback (revert do que foi inserido).
5. **Auth fixture cache (R3 fix)** mantém uma session per processo.
   Se canary roda em produção real, isso significa o test user mantém
   acesso por toda a suite · risk de contaminação com leftover
   fixtures.

## Fora de escopo (Round 7+)

- **Final legacy freeze** · congelar appointments.value / payment_method
  / procedure_name após backfill manual concluído
- **WhatsApp real dispatch** via worker 71 reativado em janela
  controlada
- **Real Google Review API** integration (substitui post_actions queue
  interna)
- **VPI autoEnroll** real RPC
- **TCLE auto-send** real consent doc
- **Cashflow ledger** wire em finalize
- **FORCE RLS** em todas tabelas (arquitetural debate)
- **Multi-clinic canary** (atualmente single-clinic produção)

## Próximas fases

- **Prompt 2** · executar Level A canary (browser smoke autenticado se
  env disponível · ou CI Playwright suite) + Level B canary com tag
  `R6_CANARY_` + cleanup. **NÃO** executar Level C sem GO explícito.
- **Prompt 3** · closeout · sem novo PR/merge a menos que Prompt 2 crie
  patch corretivo. Doc final closeout.
- **Round 7** · NÃO iniciar.
