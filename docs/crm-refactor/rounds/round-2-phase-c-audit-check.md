# Round 2 · Phase C · Audit Check + Phase D SQL Probes

**Status:** LOCAL AUDIT · ZERO commit · ZERO apply · ZERO deploy.
**Branch:** `crm/parity-r2-procedures-payments` (de `main` em `aba8e1b`).

Esta fase auditou todos os artefatos da Phase B. Achou e **corrigiu localmente**
1 P0 (view sem `security_invoker = true`) e 1 nit canon (`TO authenticated`
faltando em policies). Tudo continua local · sem commit · sem apply.

## Achados consolidados

| # | Severidade | Onde | Achado | Ação |
|---|---|---|---|---|
| 1 | P0 | mig 195 (view) | View criada sem `WITH (security_invoker = true)` · sob owner padrão, view bypassa RLS das tabelas-base · risco de leak cross-clinic. | **Patched** · view agora declara `WITH (security_invoker = true)` (padrão canon documentado em mig 39 e usado em todas as views v2). |
| 2 | P1 | migs 193 + 194 | Policies sem `TO authenticated` · funcionalmente seguras (GRANT só pra `authenticated`/`service_role` + USING `app_clinic_id()`), mas divergem do canon de mig 63. | **Patched** · todas as 8 policies (4×2) agora `FOR ... TO authenticated`. |
| 3 | Note | schemas Zod | `quantity: z.number().int().positive()` é mais restrito que DB (`numeric(10,2)`). Não bloqueia casos atuais (legacy só usa quantity inteiro); documentado. | Sem mudança · Phase D probe vai validar comportamento. |
| 4 | Note | edit mode UI | Prefill de items/payments existentes em modo edit fica em B2 Phase 2 (documentado em `round-2-phase-b-local-patch.md`). Toggle multi inicia OFF mesmo com items pré-existentes. | Sem mudança · documentado como pendente. |
| 5 | Note | replaceForAppointment | Soft-delete + insert sem transação JS (best-effort). Risco: appointment criado + items falhando deixa estado parcial. Documentado no comment. | Phase D probe inclui rollback test. |
| 6 | Info | `EPS` const em money.ts | Constante `EPS = 0.005` declarada mas não referenciada. | Sem ação · keep para forward-compat. |

## Pre-apply probes (rodar ANTES da Phase D apply)

```sql
-- 1. Confirma que tabelas 193/194 ainda não existem (ou são compatíveis se
--    foram aplicadas parcialmente em outra janela).
SELECT
  to_regclass('public.appointment_procedure_items') AS items_table,
  to_regclass('public.appointment_payments')       AS payments_table,
  to_regclass('public.appointment_financial_summary') AS view_obj;
-- esperado: todas NULL pré-apply

-- 2. Verifica que `set_updated_at()` existe (dependência de 193/194).
SELECT proname, pronamespace::regnamespace
FROM pg_proc
WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace;
-- esperado: 1 row

-- 3. Verifica que `app_clinic_id()` e `is_admin()` existem (dependências RLS).
SELECT proname FROM pg_proc
WHERE proname IN ('app_clinic_id', 'is_admin')
  AND pronamespace = 'public'::regnamespace
ORDER BY proname;
-- esperado: ambos rows

-- 4. Verifica `clinic_procedimentos(id)` (FK target de mig 193).
SELECT to_regclass('public.clinic_procedimentos') AS proc_table;
-- esperado: não-NULL

-- 5. Worker 71 OFF preservado.
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('wa_outbox_worker_tick', 'cron.job_71')
ORDER BY jobname;
-- esperado: active = false em wa_outbox_worker_tick · INTOCADO em D apply

-- 6. wa_outbox baseline · COUNT pré-apply
SELECT count(*) AS outbox_count_pre FROM public.wa_outbox WHERE created_at >= now() - interval '24 hours';

-- 7. Invalid phases · sanity check Phase 1C
SELECT count(*) AS invalid_phase_rows
FROM public.leads
WHERE phase NOT IN ('lead', 'agendado', 'paciente', 'orcamento');
-- esperado: 0
```

## Post-apply probes (rodar APÓS Phase D apply, antes de declarar SUCCESS)

```sql
-- 1. Tabelas existem
SELECT
  to_regclass('public.appointment_procedure_items') AS items_table,
  to_regclass('public.appointment_payments')       AS payments_table,
  to_regclass('public.appointment_financial_summary') AS view_obj;
-- esperado: todas não-NULL

-- 2. Constraints (193) · contagem
SELECT count(*) AS chk_count
FROM information_schema.table_constraints
WHERE table_schema='public'
  AND table_name='appointment_procedure_items'
  AND constraint_type='CHECK';
-- esperado: 8 (quantity, amounts_non_negative, net_consistency,
--             discount_le_gross, courtesy_zero, courtesy_reason,
--             return_interval, procedure_name_length)

-- 3. Constraints (194) · contagem
SELECT count(*) AS chk_count
FROM information_schema.table_constraints
WHERE table_schema='public'
  AND table_name='appointment_payments'
  AND constraint_type='CHECK';
-- esperado: 4 (amount, installments, status, method_whitelist)

-- 4. RLS enabled
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname IN ('appointment_procedure_items', 'appointment_payments');
-- esperado: relrowsecurity = true em ambas

-- 5. Policies (193 + 194)
SELECT tablename, polname, cmd
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('appointment_procedure_items', 'appointment_payments')
ORDER BY tablename, polname;
-- esperado: 8 rows (4 cada · select/insert/update/delete)

-- 6. View options · CRÍTICO: security_invoker on
SELECT n.nspname, c.relname, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'appointment_financial_summary' AND n.nspname='public';
-- esperado: reloptions contém 'security_invoker=true'

-- 7. Indexes (193)
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='appointment_procedure_items'
ORDER BY indexname;
-- esperado: 4 idx_appt_proc_items_* + pk

-- 8. Indexes (194)
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='appointment_payments'
ORDER BY indexname;
-- esperado: 4 idx_appt_payments_* + pk

-- 9. Trigger updated_at
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgname IN ('appointment_procedure_items_updated_at', 'appointment_payments_updated_at')
  AND NOT tgisinternal;
-- esperado: 2 rows

-- 10. Insert + rollback smoke (cria 1 appointment + 2 items + 2 payments,
--     valida view, dá ROLLBACK).
BEGIN;
WITH appt AS (
  INSERT INTO public.appointments (clinic_id, subject_name, scheduled_date,
    start_time, end_time, status, payment_status, origem)
  VALUES (
    (SELECT id FROM public.clinics ORDER BY created_at LIMIT 1),
    'PROBE R2', current_date + 30, '14:00', '15:00',
    'agendado', 'pendente', 'manual'
  )
  RETURNING id, clinic_id
)
INSERT INTO public.appointment_procedure_items
  (clinic_id, appointment_id, procedure_name, quantity, unit_price,
   gross_amount, discount_amount, net_amount, sort_order)
SELECT clinic_id, id, 'Botox testa', 1, 1200, 1200, 0, 1200, 0 FROM appt
UNION ALL
SELECT clinic_id, id, 'Botox glabela', 1, 800, 800, 100, 700, 1 FROM appt
RETURNING appointment_id;
-- Espera: 2 rows inseridas
-- (Em um BEGIN block: SELECT * FROM appointment_financial_summary
--  WHERE appointment_id = <id capturado>)
ROLLBACK;
-- esperado: ROLLBACK · sem efeito persistente

-- 11. Derived status canon (smoke, sem mutação)
--    Roda contra appointment existente conhecido sem items/payments:
SELECT appointment_id, derived_payment_status, net_total, paid_total
FROM public.appointment_financial_summary
LIMIT 5;
-- esperado: derived_payment_status ∈ {cortesia, pendente, parcial, pago}

-- 12. Worker 71 unchanged
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('wa_outbox_worker_tick', 'cron.job_71');
-- esperado: idêntico ao pre-apply (active = false)

-- 13. wa_outbox unchanged (delta baseline)
SELECT count(*) AS outbox_count_post FROM public.wa_outbox WHERE created_at >= now() - interval '24 hours';
-- esperado: count_post = count_pre + 0 (zero novos rows da migration)
```

## Rollback path (se Phase D falhar)

Migrations têm `.down.sql` correspondente:
- 195.down → `DROP VIEW`
- 194.down → `DROP TABLE CASCADE`
- 193.down → `DROP TABLE CASCADE`

Ordem inversa: aplicar 195.down → 194.down → 193.down.

`appointments` legacy (procedure_id, procedure_name, value, payment_method,
payment_status) intactos · rollback não perde nada do single-procedure path.

## Próximas fases

- **D** · one-ref controlled apply (token sbp_ inline · janela controlada · roda pre-apply probes ANTES + post-apply probes DEPOIS).
- **E** · commits + push + PR + CI.
- **F** · merge + deploy + smoke + closeout.
- **Round 3** · NÃO iniciar (instrução explícita).
