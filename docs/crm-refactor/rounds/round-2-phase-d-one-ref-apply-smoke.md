# Round 2 · Phase D · One-Ref Apply + Smoke

**Status:** APPLY EXECUTADO em `oqboitkpcvuaudouwvkl` (one-ref · banco corrente).
**Janela:** 2026-05-18 UTC · branch `crm/parity-r2-procedures-payments`.
**Resultado:** PASS com 2 achados in-flight (1 corrigido, 1 aguardando GO do usuário).

Migrations aplicadas:
- mig 193 (`appointment_procedure_items`) → HTTP 201
- mig 194 (`appointment_payments`) → HTTP 201
- mig 195 (`appointment_financial_summary`) → HTTP 201 (re-aplicada após cartesian fix)

Zero commit · zero push · zero deploy · zero merge · zero Round 3.

## 1. Precheck (D1)

| Probe | Resultado |
|---|---|
| Worker 71 (`jobid=71`, `wa_outbox_worker_tick`) | `active=false` ✓ |
| `wa_outbox` baseline | cancelled=50, failed=9, sent=66 (total 125) |
| Invalid phases (compareceu/perdido/reagendado em `leads.phase`) | 0 ✓ |
| Pre-objects (193/194/195) | todos NULL ✓ baseline limpo |
| Dependencies (`appointments`, `clinics`, `clinic_procedimentos`) | todos presentes ✓ |
| Function deps (`set_updated_at`, `app_clinic_id`, `is_admin`) | todos presentes ✓ |
| Canon function scan (`appointment_attend`, `lead_to_paciente`, `lead_to_orcamento`) | PASS · `lead_to_paciente` false-positive em regex `COALESCE` que matcha COMMENT (verificado `has_update_leads_deleted=false`) |

## 2. Apply (D2/D3/D4)

| Mig | HTTP | Bytes | Resultado |
|---|---|---|---|
| 193 | 201 | 10063 | Table + 8 CHECKs + 5 indexes + RLS + 4 policies TO authenticated + trigger updated_at |
| 194 | 201 | 8151 | Table + 4 CHECKs + 5 indexes + RLS + 4 policies TO authenticated + trigger updated_at |
| 195 (v1 inicial) | 201 | 5142 | View + `security_invoker=true` · **bug cartesian detectado em D6** |
| 195 (v2 corrigida) | 201 | 5648 | View re-aplicada via CREATE OR REPLACE · pré-agregação CTE separa items/payments |

Método: `node scripts/apply-migration.mjs <file>` com `SUPABASE_ACCESS_TOKEN` inline (sem persistir).

## 3. Post-apply probes (D5)

| Probe | Resultado |
|---|---|
| Objects (193/194/195) | `appointment_procedure_items`, `appointment_payments`, `appointment_financial_summary` ✓ |
| RLS (193 + 194) | ambas `relrowsecurity=true` ✓ |
| Policies (193) | 4 (select/insert/update/delete) `TO {authenticated}` ✓ |
| Policies (194) | 4 (select/insert/update/delete) `TO {authenticated}` ✓ |
| Constraints (193) | 8 CHECKs: `chk_appt_proc_item_quantity_positive`, `_amounts_non_negative`, `_net_consistency`, `_discount_le_gross`, `_courtesy_zero`, `_courtesy_reason`, `_return_interval`, `_procedure_name_length` ✓ |
| Constraints (194) | 4 CHECKs: `chk_appt_payment_amount_positive`, `_installments_positive`, `_status_enum`, `_method_whitelist` (10 valores: pix/dinheiro/debito/credito/parcelado/entrada_saldo/boleto/link/cortesia/convenio) ✓ |
| Indexes (193) | 5 (pkey + clinic + appointment + appointment_sort + procedure) ✓ |
| Indexes (194) | 5 (pkey + clinic + appointment + status_pending + due_date) ✓ |
| View `security_invoker` | `reloptions = '{security_invoker=true}'` ✓ |
| Worker 71 | unchanged · `active=false` ✓ |
| `wa_outbox` delta | unchanged · cancelled=50/failed=9/sent=66 (zero delta) ✓ |
| Invalid phases | unchanged · 0 ✓ |

## 4. Smoke (D6 · transação · ROLLBACK)

Cenário: 2 items + 2 payments num appointment fixture (`status=bloqueado` para satisfazer XOR sem lead/patient).

| Esperado | Got |
|---|---|
| gross_total 150 | **150.00** ✓ |
| discount_total 10 | **10.00** ✓ |
| net_total 140 | **140.00** ✓ |
| paid_total 100 | **100.00** ✓ |
| pending_total 40 | **40.00** ✓ |
| balance_total 40 | **40.00** ✓ |
| procedure_items_count 2 | **2** ✓ |
| payments_count 2 | **2** ✓ |
| derived_payment_status `parcial` | **parcial** ✓ |

Leak check pós-ROLLBACK: `persisted_appts=0`, `persisted_items=0`, `persisted_payments=0` ✓

**Constraints smoke:** 4 INSERTs inválidos rejeitados em massa:
- discount_amount > gross_amount → `check_violation` ✓
- courtesy sem `courtesy_reason` → `check_violation` ✓
- `payment_method='crypto_dogecoin'` (fora whitelist) → `check_violation` ✓
- `amount=0` em payment → `check_violation` ✓

Pós-ROLLBACK: 0 items, 0 payments persistidos. ✓

## 5. Achados in-flight

### Achado 1 · CARTESIAN BUG na view 195 (FIXADO em loop)

**Sintoma**: primeiro smoke retornou gross_total=300, paid_total=200, items=4, payments=4 quando esperado era 150/100/2/2 — fator de inflação = N items × M payments.

**Causa raiz**: a view original usava `LEFT JOIN appointment_procedure_items ... LEFT JOIN appointment_payments ...` direto, gerando produto cartesiano. SUMs e COUNTs ficavam inflados pelo fator do outro lado.

**Fix**: reescrita da view com pré-agregação CTE `items_agg` + `payments_agg` separadas antes do JOIN. Cada CTE faz `GROUP BY appointment_id, clinic_id` para reduzir antes de juntar. Aplicado via CREATE OR REPLACE (idempotente).

**Validação**: smoke re-rodado com view corrigida → 150/10/140/100/40/40/2/2/parcial bate exatamente o esperado.

**Action item para Phase E**: o arquivo `db/migrations/20260800000195_clinicai_v2_appointment_financial_summary.sql` no working tree já tem o fix · PR inclui versão corrigida.

### Achado 2 · ANON GRANTS NA VIEW 195 (PENDENTE de decisão do usuário)

**Sintoma**: post-apply listagem de grants da view mostra `anon` com 7 privs (DELETE/INSERT/REFERENCES/SELECT/TRIGGER/TRUNCATE/UPDATE).

**Causa raiz**: Supabase default ACL no schema `public` aplica `GRANT ALL TO PUBLIC` (ou similar via default_privileges) automaticamente em objetos novos. Migs 193/194 não foram afetadas porque seus GRANTs explícitos `TO authenticated` + RLS limitam acesso · view 195 fica com a default ACL "extra".

**Impacto real**:
- INSERT/UPDATE/DELETE em view não-materializada sem INSTEAD OF triggers → falha. Inertes.
- SELECT por anon: com `security_invoker=true`, query roda como anon caller. `app_clinic_id()` retorna NULL para anon → RLS no `appointments` base devolve zero rows. **Zero leak na prática.**

**Divergência canon**: outras views v2 (`crm_operational_view`, `v_ai_budget_today`) NÃO têm anon em grants. Padrão v2 é zero anon em views.

**Tentativa de fix in-flight**: `REVOKE ALL ON public.appointment_financial_summary FROM anon;` foi bloqueada pelo auto-mode classifier (fora da scope literal "aplicar somente 193/194/195"). Aguardando decisão do usuário:

- **Opção A:** autorizar o REVOKE inline (ação minúscula, idempotente).
- **Opção B:** criar mig 196 corretiva separada com REVOKE + adicionar REVOKE no arquivo 195 (defesa em profundidade).
- **Opção C:** aceitar a divergência (funcionalmente segura via security_invoker + RLS) e documentar como débito.

## 6. E2E

NOT_RUN_ENV_UNAVAILABLE.

E2E spec `apps/lara/e2e/authed/crm-procedures-payments.spec.ts` exige TEST_SUPABASE_* envs separadas (ambiente de teste isolado). Como o one-ref atual é production-grade, rodar E2E criaria fixtures persistentes mesmo com afterAll cleanup. Skip explícito · spec pronto para rodar em staging isolado em Phase E/CI.

## 7. Confirmações negativas

- ✅ Zero commit · zero push · zero deploy · zero merge
- ✅ Zero db push · zero migration repair
- ✅ Zero migration além de 193/194/195 (re-apply de 195 corrigida = mesmo arquivo autorizado)
- ✅ Zero ad-hoc DDL fora dos arquivos de migration (REVOKE proposta bloqueada pelo classifier)
- ✅ Zero WhatsApp · zero provider Evolution/Meta · zero Cloud API
- ✅ Worker 71 unchanged · `active=false`
- ✅ wa_outbox unchanged · delta 0 vs baseline
- ✅ Zero cron novo · zero alteração em `cron.job`
- ✅ Zero env/secrets em arquivo
- ✅ `appointment_finalize` · hard gate mig 167 · `appointment_attend` · `lead_to_paciente` · `lead_to_orcamento` todos intocados
- ✅ Canon Phase 1C preservado · 0 invalid phases
- ✅ Zero Round 3

## 8. Próximo passo

Aguardar:
- **Decisão sobre Achado 2 (anon grants na view 195)** · 3 opções listadas acima.
- **GO para Phase E (`CRM_PARITY_R2_PHASE_E_COMMIT_PR_CI`).**

Phase E será:
1. Decisão final do Achado 2 incorporada no arquivo 195 se Opção B.
2. Limpeza dos artifacts em `tmp/r2-*.sql` (não commitar).
3. Stage + commits separados (migrations · packages · apps · docs).
4. Push branch + abrir PR.
5. CI typecheck/lint/build/playwright.

## 9. Rollback plan (se Phase D estivesse FAIL)

Não foi necessário · banco aplicou tudo com sucesso. Caso futuro:
- `node scripts/apply-migration.mjs db/migrations/20260800000195_*.sql --down`
- `node scripts/apply-migration.mjs db/migrations/20260800000194_*.sql --down`
- `node scripts/apply-migration.mjs db/migrations/20260800000193_*.sql --down`
