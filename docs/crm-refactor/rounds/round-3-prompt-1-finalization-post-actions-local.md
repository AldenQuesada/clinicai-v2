# Round 3 · Prompt 1 · Finalization + Post-Actions · Local Patch

**Status:** LOCAL ONLY · ZERO commit · ZERO apply · ZERO deploy.
**Escopo:** wire FinalizeWizard ao R2 financial summary + criar fila interna
de pós-ações no finalize (Google review D+3, VPI indication, retouch
reminder, complaint logged, payment follow-up) **sem efeito externo
automático**.

Round 1 fechou agenda foundation. Round 2 fechou multi-procedure +
multi-payment + view canônica. Round 3 fecha o ciclo: a finalização lê o
estado R2, alerta operacionalmente sobre saldo, e enfileira tarefas
internas para a secretaria executar manualmente depois.

## Audit consolidado (3 agentes paralelos)

### Legacy (clinic-dashboard) · 15 features no finalize

| Feature | Side effect | Paridade R3? |
|---|---|---|
| Multi-payment merge | localStorage + RPC | sim (já em R2) |
| Cashflow ledger entry | RPC `create_cashflow_entry` | P0 → **DEFERRED** v2.2 |
| Google review D+3 | localStorage `clinic_op_queue` + future WA | internal-only ✓ |
| VPI auto-enroll | RPC `vpi_autoEnroll()` + `vpi_closeIndication()` | internal-only ✓ |
| Retouch suggestion | modal + RPC opcional | internal-only ✓ |
| Complaint logging | RPC `save_complaint` | internal-only ✓ |
| Payment follow-up task | localStorage `clinic_op_tasks` | internal-only ✓ (AUTO) |
| WhatsApp post-atendimento | **RPC `sendWATemplate` IMEDIATO via Evolution** | **SKIP_DEFERRED** |
| Lead phase routing | RPC `change_lead_phase` | já em R2 via `appointment_finalize` |
| TCLE consent | RPC `autoSendForStatus('na_clinica')` | DEFERRED (Round 4+) |
| Idempotency guard | in-memory flag | já em RPC mig 167 ✓ |

### v2 finalize · current state (40% pronto)

| Feature | Existe? | Gap real? |
|---|---|---|
| FinalizeWizard UI | sim (`_actions-bar.tsx`) | **sim** — não lia summary R2 |
| `finalizeAppointmentAction` | sim (linhas 730-838) | **sim** — não enfileirava post-actions |
| `FinalizeAppointmentSchema` | sim · cortesia + override OK | **sim** — faltava `postActions` block |
| `appointment_finalize` RPC (mig 167) | sim · hard gate intacto | não · preservar |
| `appointment_financial_summary` view | sim (mig 195 + cartesian fix) | usar |
| Post-action queue table | **não existe** | **mig 197 nova** |

### Existing tables (v2 + clinic-dashboard cross-repo)

- `inbox_notifications` (mig 847 clinic-dashboard) — pode ser usada para alertas
- `cashflow_entries` (mig 639 clinic-dashboard) — financeiro · DEFERRED
- `retoque_campaigns` (mig 150 clinic-dashboard) — retouch · pode ser wired em R4
- `patient_complaints` (mig 643 clinic-dashboard) — queixas · pode ser wired em R4
- `tasks` (mig 505 clinic-dashboard) — SDR tasks · RLS quebrada · não usar
- `appointment_internal_alerts` (mig 161 v2) — só pre-appointment alerts · não estende

**Decisão arquitetural:** criar tabela dedicada `appointment_post_actions`
(mig 197) com action_type discriminado · evita misturar concerns com
tabelas existentes que têm semântica específica (queixas/retoque ficam em
tabelas próprias se forem wired no Round 4; R3 mantém queue interna isolada
para staff dispatchar).

## Patch local (R3 Prompt 1)

### Migration nova (LOCAL · não aplicada)

`db/migrations/20260800000197_clinicai_v2_appointment_post_actions.sql` + `.down.sql`

Tabela `appointment_post_actions`:
- id, clinic_id, appointment_id FK CASCADE
- action_type CHECK whitelist (5 valores: google_review, vpi_indication, retouch_reminder, complaint_logged, payment_followup)
- status CHECK enum (pending, done, dismissed, cancelled)
- schedule_at, executed_at, dismissed_at, dismissed_reason
- payload jsonb · notes · created_by · timestamps · deleted_at
- 4 indexes (clinic, appointment, pending-queue por schedule, type+status)
- RLS canon · 4 policies TO authenticated · DELETE gated por is_admin
- REVOKE ALL FROM anon (lição mig 196 internalizada)
- trigger updated_at

CHECK consistency: `executed_at IS NULL OR status='done'` e
`dismissed_at IS NULL OR status='dismissed'`.

### Repository novo

`packages/repositories/src/appointment-post-actions.repository.ts`
- DTOs camelCase via mapRow
- `listByAppointment`, `listPendingByClinic`, `getById`, `create`,
  `createBatch` (bulk insert), `updateStatus`, `softDelete`
- Re-exportado em barrel
- Wire no `apps/lara/src/lib/repos.ts` factory → `repos.appointmentPostActions`

### Schema extension

`apps/lara/src/app/crm/_schemas/appointment.schemas.ts`
- `FinalizePostActionsSchema` · 3 campos opt-in:
  - `googleReviewD3?: boolean`
  - `vpiIndication?: boolean`
  - `complaintNote?: string | null` (max 1000)
- `FinalizeAppointmentSchema` ganha `postActions: FinalizePostActionsSchema.optional()`
- Não toca outros refines (cortesia/clinical override permanecem intactos)

### Action extension

`apps/lara/src/app/crm/_actions/appointment.actions.ts`
- `finalizeAppointmentAction` agora:
  1. Roda RPC `appointment_finalize` (intacto)
  2. Se `subCallOk`, fetch `getFinancialSummary` + `listByAppointment` de items
  3. Auto-enfileira `payment_followup` se `balance_total > 0.01` (D+3)
  4. Auto-enfileira `retouch_reminder` por item.is_return (D+returnIntervalDays)
  5. Opt-in `google_review` (D+3), `vpi_indication`, `complaint_logged` dos checkboxes
  6. `createBatch` em `appointment_post_actions`
  7. Retorna `postActionsCreated` count no payload
- Falha em pós-actions NÃO desfaz o finalize (best-effort consistente com R2)
- Nova action `getAppointmentFinancialSummaryAction` (read-only · wrapper view 195)

### UI extension

`apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx` (FinalizeWizard)
- Adiciona useEffect para fetch summary na abertura do modal
- Renderiza painel "Resumo financeiro" com gross/discount/net/paid/pending/saldo + status derivado
- Alerta vermelho quando `paymentStatus=pago` + balance > 0
- 3 checkboxes opt-in para post-actions (Google review D+3 · VPI indication · queixa texto livre)
- Passa `postActions` no payload de submit
- ZERO mensagem de envio automático prometido na UI

### E2E spec

`apps/lara/e2e/authed/crm-finalize-post-actions.spec.ts` (6 cenários)
- R3.1 saldo quitado · zero payment_followup
- R3.2 saldo pendente · payment_followup criado com schedule_at D+3
- R3.3 CHECK rejeita action_type fora whitelist
- R3.4 CHECK consistency executed_at ↔ status=done
- R3.5 zero `wa_outbox` criado pelo enqueue (queue isolada)
- R3.6 single-procedure legado continua compatível

Sem dynamic import de Server Actions · skip dinâmico via `probeTable`.

## Gates verde

- `pnpm --filter @clinicai/repositories typecheck` · **PASS**
- `pnpm --filter @clinicai/lara typecheck` · **PASS**
- `pnpm --filter @clinicai/lara test` · **70/70 PASS · 4 test files**
- `npx vitest run packages/utils/src/money.test.ts` · **29/29 PASS**
- `pnpm --filter @clinicai/lara build` · **PASS** (warnings pré-existentes)
- Canon grep nos artefatos novos · clean (zero hits)
- Provider/cron/WhatsApp scan nos artefatos novos · clean (única hit em
  doc-comment negativo)

## SQL probes para Prompt 2

### Pre-apply (verificar baseline)

```sql
-- 1. Worker 71 OFF
SELECT 'pre_worker_71' AS section, jobid, active, jobname
FROM cron.job
WHERE jobid = 71;

-- 2. wa_outbox baseline
SELECT 'pre_wa_outbox' AS section, status, count(*) AS total
FROM public.wa_outbox
GROUP BY status
ORDER BY status;

-- 3. Invalid phases
SELECT 'pre_invalid_phases' AS section, count(*) AS invalid_phase_count
FROM public.leads
WHERE phase IN ('compareceu','perdido','reagendado');

-- 4. mig 197 ainda não aplicada
SELECT 'pre_mig197_object' AS section,
  to_regclass('public.appointment_post_actions')::text AS table_ref;
-- esperado: NULL

-- 5. Dependencies (set_updated_at, app_clinic_id, is_admin) presentes
SELECT 'pre_deps' AS section, proname
FROM pg_proc
WHERE proname IN ('set_updated_at','app_clinic_id','is_admin')
  AND pronamespace='public'::regnamespace
ORDER BY proname;
```

### Post-apply (verificar mig 197 + safety)

```sql
-- 1. Tabela existe
SELECT 'post_197_table' AS section,
  to_regclass('public.appointment_post_actions')::text AS table_ref;

-- 2. RLS habilitado
SELECT 'post_197_rls' AS section, relname, relrowsecurity
FROM pg_class
WHERE oid = 'public.appointment_post_actions'::regclass;

-- 3. 4 policies TO authenticated
SELECT 'post_197_policies' AS section, policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname='public' AND tablename='appointment_post_actions'
ORDER BY policyname;

-- 4. 3 CHECK constraints
SELECT 'post_197_constraints' AS section, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid='public.appointment_post_actions'::regclass
  AND contype='c'
ORDER BY conname;
-- esperado: chk_appt_post_action_type_whitelist, chk_appt_post_action_status_enum, chk_appt_post_action_executed_consistency

-- 5. 4 + pkey indexes
SELECT 'post_197_indexes' AS section, indexname
FROM pg_indexes
WHERE schemaname='public' AND tablename='appointment_post_actions'
ORDER BY indexname;

-- 6. Zero anon grants (canon v2)
SELECT 'post_197_grants' AS section, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='appointment_post_actions'
ORDER BY grantee, privilege_type;
-- esperado: anon NÃO aparece · authenticated/postgres/service_role têm 7 privs

-- 7. Trigger updated_at
SELECT 'post_197_trigger' AS section, tgname
FROM pg_trigger
WHERE tgrelid='public.appointment_post_actions'::regclass
  AND NOT tgisinternal;

-- 8. Worker 71 unchanged
SELECT 'post_197_worker_71' AS section, jobid, active, jobname
FROM cron.job
WHERE jobid = 71;

-- 9. wa_outbox unchanged (delta 0)
SELECT 'post_197_wa_outbox' AS section, status, count(*) AS total
FROM public.wa_outbox
GROUP BY status
ORDER BY status;

-- 10. Invalid phases unchanged (0)
SELECT 'post_197_invalid_phases' AS section, count(*) AS invalid_phase_count
FROM public.leads
WHERE phase IN ('compareceu','perdido','reagendado');
```

### Smoke transaction (BEGIN/ROLLBACK · não persistir)

```sql
BEGIN;

-- Criar appointment bloqueado (XOR sem lead/patient)
INSERT INTO public.appointments
  (clinic_id, subject_name, scheduled_date, start_time, end_time,
   status, payment_status, origem)
SELECT id, 'PROBE R3 D6 smoke',
       (current_date + 60)::date, '14:00'::time, '15:00'::time,
       'bloqueado', 'pendente', 'manual'
FROM public.clinics ORDER BY created_at LIMIT 1;

-- Enfileirar uma post-action de cada tipo
INSERT INTO public.appointment_post_actions
  (clinic_id, appointment_id, action_type, status, schedule_at, payload)
SELECT a.clinic_id, a.id, 'google_review', 'pending', now() + interval '3 days', '{"source":"probe"}'::jsonb
FROM public.appointments a WHERE a.subject_name = 'PROBE R3 D6 smoke'
UNION ALL
SELECT a.clinic_id, a.id, 'payment_followup', 'pending', now() + interval '3 days', '{"balance":300}'::jsonb
FROM public.appointments a WHERE a.subject_name = 'PROBE R3 D6 smoke';

-- Validar 2 rows
SELECT 'd6_smoke_count' AS section, count(*) AS post_actions_count
FROM public.appointment_post_actions
WHERE appointment_id IN (
  SELECT id FROM public.appointments WHERE subject_name = 'PROBE R3 D6 smoke'
);
-- esperado: 2

ROLLBACK;

-- Confirmar leak check
SELECT 'd6_leak_check' AS section,
  (SELECT count(*) FROM public.appointment_post_actions
    WHERE payload->>'source' = 'probe') AS leaked;
-- esperado: 0
```

### Constraint violation smoke

```sql
BEGIN;

-- action_type fora whitelist · CHECK rejeita
DO $$
BEGIN
  BEGIN
    INSERT INTO public.appointment_post_actions
      (clinic_id, appointment_id, action_type, status)
    VALUES (
      (SELECT id FROM public.clinics LIMIT 1),
      (SELECT id FROM public.appointments LIMIT 1),
      'invalid_action_xyz', 'pending'
    );
    RAISE NOTICE 'UNEXPECTED · action_type inválido aceito';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK · action_type rejeitado';
  END;
END $$;

-- status fora enum · CHECK rejeita
DO $$
BEGIN
  BEGIN
    INSERT INTO public.appointment_post_actions
      (clinic_id, appointment_id, action_type, status)
    VALUES (
      (SELECT id FROM public.clinics LIMIT 1),
      (SELECT id FROM public.appointments LIMIT 1),
      'google_review', 'INVALID_STATUS'
    );
    RAISE NOTICE 'UNEXPECTED · status aceito';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK · status rejeitado';
  END;
END $$;

-- executed_at + status=pending · CHECK consistency rejeita
DO $$
BEGIN
  BEGIN
    INSERT INTO public.appointment_post_actions
      (clinic_id, appointment_id, action_type, status, executed_at)
    VALUES (
      (SELECT id FROM public.clinics LIMIT 1),
      (SELECT id FROM public.appointments LIMIT 1),
      'google_review', 'pending', now()
    );
    RAISE NOTICE 'UNEXPECTED · executed_at+pending aceito';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK · executed_at+pending rejeitado';
  END;
END $$;

ROLLBACK;
```

## Riscos / O que ficou fora

### Conhecidos · documentados

1. **Dual-write best-effort** · falha de `createBatch` pós-finalize NÃO
   desfaz o finalize. Se enqueue falha, log warning + retornar
   `postActionsCreated < expected`. Idempotência manual via staff dashboard.
2. **Sem worker automático** · cada row em `appointment_post_actions` é
   visualizada na fila de secretaria · staff dispatcha manualmente
   (clicar "executei" ou "dispensar"). Nenhum job/cron lê esta tabela
   em R3.
3. **Sem provider externo** · UI deixa claro "zero mensagem real é
   enviada automaticamente". Quando Round 4+ ligar provider, esta tabela
   é a fonte.
4. **Hard gate mig 167 intacto** · não touched. Override admin
   continua o único bypass.

### Fora de escopo (Round 4+)

- Cashflow ledger (`cashflow_entries`) wire — DEFERRED v2.2
- Real Google review API integration
- VPI auto-enroll RPC (legacy `vpi_autoEnroll` está em clinic-dashboard,
  v2 não tem equivalente · enqueue só sinaliza · staff manual ou Round 4)
- TCLE/payment consent auto-send
- Worker/cron para dispatchar a fila automaticamente
- Retouch follow-up integrado com `retoque_campaigns` (mig 150 do legacy)
- Complaint logging integrado com `patient_complaints` (mig 643 legacy)

## Próximas fases

- **Prompt 2** · controlled apply de mig 197 · probes pré/pós · smoke
  rollback transaction · constraint violation smoke · commits granulares
  · push branch · PR · CI.
- **Prompt 3** · merge + deploy + smoke final + closeout.
- **Round 4** · NÃO iniciar (instrução explícita).
