# Fase 2D.3A.3 · `wa_daily_summary` lead_id NOT NULL safety · PREP

> Preparação da mig 155 cirúrgica. **NÃO APLICADA.** Apply controlado fica
> para Fase 2D.3A.3.2 após review do SQL no chat.

---

## 1 · Resumo executivo

P0 latente descoberto pós-mig 154:

- `public.wa_daily_summary()` insere em `public.wa_outbox` com `lead_id = NULL`
- `public.wa_outbox.lead_id` é `uuid NOT NULL` (`data_type: uuid`, `is_nullable: NO`, `column_default: null`)
- Cron `daily-agenda-summary` (job 12 · `0 11 * * *`) está **ATIVO**
- Sem agenda futura agora · risco imediato baixo · mas bug armado

Esta fase entrega 5 artefatos prontos para review:

1. Mig 155 forward (`CREATE OR REPLACE FUNCTION` cirúrgica)
2. Mig 155 down NO-OP defensivo
3. Rollback note completo
4. Validation SQL pós-apply (10 VALs read-only)
5. Este doc

**Sem apply. Sem SQL mutativo. Sem deploy. Sem alteração TS Lara v2.**

---

## 2 · Estratégia (sem mexer em schema · sem criar lead institucional)

Adicionar variável local + lookup runtime do `lead_id` real entre os appointments daquele profissional/dia. Se não houver (cenário patient-only), pular o resumo silenciosamente.

### Variável adicionada

```sql
v_summary_lead_id uuid;
```

### Lookup antes do INSERT

```sql
v_summary_lead_id := NULL;
select a.lead_id
  into v_summary_lead_id
  from public.appointments a
 where a.clinic_id = v_clinic_id
   and a.scheduled_date = v_today
   and a.professional_name = v_prof.professional_name
   and a.status not in ('cancelado','no_show')
   and a.deleted_at is null
   and a.lead_id is not null
 order by a.start_time
 limit 1;

if v_summary_lead_id is null then
  continue;
end if;
```

### INSERT atualizado

```diff
- v_clinic_id, null, v_phone, ...
+ v_clinic_id, v_summary_lead_id, v_phone, ...
```

Resto da função: **1:1 com a versão pós-mig 154** (capturada via `pg_get_functiondef`).

---

## 3 · Por que NÃO essas opções (decisão técnica do Alden)

| Opção descartada | Motivo |
|---|---|
| `patient_id` no `wa_outbox.lead_id` | Viola semântica FK (campo é "lead_id" não "subject_id") |
| Criar lead institucional pra cobrir patient-only | Premature optimization · sem dados que justifiquem ainda |
| Tornar `wa_outbox.lead_id` nullable | Mudança de schema · escopo P0 deve ser cirúrgico |
| Alterar `cron.job` 12 | Cron continua ativo · resumo continua relevante |

---

## 4 · Comportamento esperado por cenário

| Cenário | Comportamento |
|---|---|
| Agenda do dia tem ≥1 appt com `lead_id NOT NULL` para o profissional | Resume normalmente · INSERT em wa_outbox OK |
| Todos os appts do profissional/dia são `lead_id IS NULL` (patient-only) | `CONTINUE` silencioso · zero erro · cron retorna sem erro |
| Profissional sem appts no dia | `v_count = 0 → CONTINUE` (preservado) |
| Profissional sem WhatsApp/phone | Filtrado pelo SELECT externo (preservado) |
| `sent_key` já em wa_outbox (idempotência) | `CONTINUE` (preservado) |

---

## 5 · Arquivos criados (working tree · sem commit)

| Arquivo | Tipo | Status |
|---|---|---|
| [db/migrations/20260800000155_clinicai_v2_wa_daily_summary_lead_id_not_null.sql](../../db/migrations/20260800000155_clinicai_v2_wa_daily_summary_lead_id_not_null.sql) | Forward · `CREATE OR REPLACE FUNCTION` única | ✅ |
| [db/migrations/20260800000155_clinicai_v2_wa_daily_summary_lead_id_not_null.down.sql](../../db/migrations/20260800000155_clinicai_v2_wa_daily_summary_lead_id_not_null.down.sql) | Down NO-OP | ✅ |
| [docs/database/rollback-notes/20260800000155_clinicai_v2_wa_daily_summary_lead_id_not_null.md](../database/rollback-notes/20260800000155_clinicai_v2_wa_daily_summary_lead_id_not_null.md) | Rollback note | ✅ |
| [scripts/validation/20260800000155_validate_wa_daily_summary_lead_id_not_null.sql](../../scripts/validation/20260800000155_validate_wa_daily_summary_lead_id_not_null.sql) | 10 VALs read-only | ✅ |
| Este doc | Prep | ✅ |

---

## 6 · Static safety scan

| Padrão | Hits em 155.sql | Hits em 155.down.sql |
|---|---|---|
| `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM` / `ALTER TYPE` / `CREATE TYPE` / `DROP TYPE` | 0 | 0 |
| `patient_name` (regressão pós-mig 154) | 0 em código executável | 0 |
| `v_clinic_id, null, v_phone` (padrão legado) | 0 | 0 |
| `subject_name` (esperado) | presente | — |
| `v_summary_lead_id` (esperado) | presente | — |
| `INSERT INTO public.wa_outbox` (esperado) | presente (1×) | 0 |

---

## 7 · Checks de typecheck

A mig 155 não toca TS. Typechecks devem permanecer estáveis:

- `pnpm --filter @clinicai/lara run typecheck` → ✅ PASS (esperado)
- `pnpm --filter @clinicai/repositories run typecheck` → ✅ PASS (esperado)

---

## 8 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Drift residual em linha não capturada | Muito baixa | Capturado 1:1 via `pg_get_functiondef` real pós-mig 154 |
| Cron `daily-agenda-summary` roda durante apply | Muito baixa | `CREATE OR REPLACE` atômico · roda em <1s |
| Profissional patient-only fica sem resumo | Aceito | Decisão técnica · raro hoje · escalável depois |
| GRANT EXECUTE perdido | Muito baixa | `CREATE OR REPLACE` preserva grants |
| Sanity DO block detecta regressão | Muito baixa | Defesa em profundidade · aborta apply se tokens errados |

---

## 9 · Como aplicar pós-revisão (Fase 2D.3A.3.2)

```bash
# 1. Comparar SQL atual (READ-ONLY)
SELECT pg_get_functiondef('public.wa_daily_summary()'::regprocedure);

# 2. Apply
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000155_clinicai_v2_wa_daily_summary_lead_id_not_null.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000155_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000155
rm -rf supabase/migrations

# 4. Validation
#    scripts/validation/20260800000155_validate_wa_daily_summary_lead_id_not_null.sql
```

---

## 10 · Confirmações negativas

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero deploy
- ❌ Zero alteração em outras RPCs (`_render_appt_template` da mig 154, `_enqueue_agenda_alert`, `_agenda_alert_min_before_tick`, `appt_*` da mig 153, demais)
- ❌ Zero alteração em schema de tabelas (`wa_outbox.lead_id` permanece NOT NULL)
- ❌ Zero alteração em cron.job (12/71/72 inalterados)
- ❌ Zero alteração em wa_outbox_worker / wa_agenda_automations / WhatsApp / Evolution / Secretaria
- ❌ Zero alteração em TS Lara v2
- ❌ Zero backfill / DML em qualquer tabela
- ❌ Zero criação de lead institucional
- ❌ Zero criação de `agenda_alerts_log`

---

## 11 · Histórico

- **2026-05-11:** Fase 2D.3A.3 entrega 5 artefatos prontos para review · sem apply
- **Def real capturada:** via `pg_get_functiondef` em prod (Management API SELECT · token deletado pós-prep)
- **Próximo:** review SQL no chat → Fase 2D.3A.3.2 apply controlado → validation
