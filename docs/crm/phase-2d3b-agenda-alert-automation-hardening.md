# Fase 2D.3B · Agenda alert automation hardening · PREP

> Preparação da mig 156 cirúrgica. **NÃO APLICADA.** Apply controlado fica
> para Fase 2D.3B.2 após review do SQL no chat.

---

## 1 · Resumo executivo

Cron job 72 (`agenda_alert_min_before_tick`) está DESLIGADO em prod. Auditoria identificou 3 problemas que impediriam o cron de ser religado:

1. `_agenda_alert_min_before_tick()` compara `l.appt_id = a.id` (text vs uuid · sem cast)
2. `_enqueue_agenda_alert(...)` usa `p_appt.patient_id` em `wa_outbox.lead_id` (NOT NULL · violação quando appt é lead-only) + semântica errada
3. `agenda_alerts_log` não tem UNIQUE(appt_id, alert_kind) · `ON CONFLICT` no `_enqueue_agenda_alert` não tem base

Esta fase entrega 5 artefatos prontos para review:

1. Mig 156 forward (1 UNIQUE idempotente + 2 `CREATE OR REPLACE FUNCTION` + sanity DO)
2. Mig 156 down NO-OP defensivo
3. Rollback note completo
4. Validation SQL pós-apply (10 VALs read-only)
5. Este doc

**Sem apply. Sem SQL mutativo. Sem deploy. Sem alteração TS Lara v2. Sem ativar cron 72.**

---

## 2 · Diffs vs defs reais (capturadas via `pg_get_functiondef`)

### 2.1 · `_agenda_alert_min_before_tick()`

**Único diff (1 linha):**
```diff
-     WHERE l.appt_id = a.id
+     WHERE l.appt_id = a.id::text
```

`agenda_alerts_log.appt_id` é `text` · `appointments.id` é `uuid`. Cast explícito elimina a comparação ambígua que o Postgres faz hoje.

### 2.2 · `_enqueue_agenda_alert(uuid, record, text, record, text)`

**3 diffs:**

```diff
+ -- mig 156: guard antes do INSERT · wa_outbox.lead_id é uuid NOT NULL.
+ -- Se appointment é patient-only (lead_id NULL), sair silenciosamente.
+ IF p_appt.lead_id IS NULL THEN
+   RETURN NULL;
+ END IF;

  INSERT INTO public.wa_outbox (..., lead_id, ...) VALUES (
    p_clinic_id,
-   p_appt.patient_id,
+   p_appt.lead_id,
    ...
  );

  INSERT INTO public.agenda_alerts_log (..., lead_id, ...) VALUES (
    ...,
-   p_appt.patient_id::text,
+   p_appt.lead_id::text,
    ...
  );
```

Tudo o resto (render via `_render_appt_template`, regexp_replace phone, content_type, priority=1, max_attempts=3, status='queued', appt_ref, rule_id, ON CONFLICT, RETURNING) **preservado 1:1**.

### 2.3 · `agenda_alerts_log` · nova UNIQUE constraint

```sql
ALTER TABLE public.agenda_alerts_log
  ADD CONSTRAINT agenda_alerts_log_appt_id_alert_kind_key
  UNIQUE (appt_id, alert_kind);
```

Criação idempotente via DO block que checa se já existe constraint OU index equivalente. Tabela está vazia (`total_rows=0` confirmado pelo Alden) · zero risco de violação.

---

## 3 · Decisão técnica do Alden

| Opção descartada | Motivo |
|---|---|
| `patient_id` em `wa_outbox.lead_id` | Viola semântica FK (campo é lead_id, não subject_id) |
| `COALESCE(p_appt.lead_id, p_appt.patient_id)` | Mesmo problema · mistura semantics |
| Tornar `wa_outbox.lead_id` nullable | Mudança de schema fora do escopo P0 |
| Criar lead institucional | Premature optimization |
| Religar cron 72 nesta fase | Decisão de operação · separada |

Estratégia escolhida: **`p_appt.lead_id` only · com guard `IS NULL` → `RETURN NULL` silencioso**. Mesma estratégia do `v_summary_lead_id` na mig 155.

---

## 4 · Comportamento esperado por cenário

| Cenário | Comportamento |
|---|---|
| Appt lead-only (lead_id NOT NULL) | INSERT wa_outbox OK + INSERT agenda_alerts_log OK |
| Appt patient-only (lead_id NULL) | `RETURN NULL` silencioso · zero erro |
| Mesmo (appt_id, alert_kind) chamado 2× | ON CONFLICT DO NOTHING (idempotência preservada) |
| Phone vazio/null | `RETURN NULL` (preservado) |
| Cron 72 desligado (estado atual) | Não roda · status quo |

---

## 5 · Arquivos criados (working tree · sem commit)

| Arquivo | Tipo | Status |
|---|---|---|
| [db/migrations/20260800000156_clinicai_v2_agenda_alert_automation_hardening.sql](../../db/migrations/20260800000156_clinicai_v2_agenda_alert_automation_hardening.sql) | Forward · UNIQUE + 2 CREATE OR REPLACE + sanity DO | ✅ |
| [db/migrations/20260800000156_clinicai_v2_agenda_alert_automation_hardening.down.sql](../../db/migrations/20260800000156_clinicai_v2_agenda_alert_automation_hardening.down.sql) | Down NO-OP | ✅ |
| [docs/database/rollback-notes/20260800000156_clinicai_v2_agenda_alert_automation_hardening.md](../database/rollback-notes/20260800000156_clinicai_v2_agenda_alert_automation_hardening.md) | Rollback note | ✅ |
| [scripts/validation/20260800000156_validate_agenda_alert_automation_hardening.sql](../../scripts/validation/20260800000156_validate_agenda_alert_automation_hardening.sql) | 10 VALs read-only | ✅ |
| Este doc | Prep | ✅ |

---

## 6 · Static safety scan

| Padrão | Hits |
|---|---|
| `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM public.appointments` / `DELETE FROM public.wa_outbox` | 0 |
| `UPDATE cron.job` / `cron.schedule` / `cron.unschedule` | 0 |
| `p_appt.patient_id` (em código executável) | 0 (1 em comentário descritivo do header) |
| `COALESCE(p_appt.lead_id, p_appt.patient_id)` | 0 |
| `a.id::text` (esperado) | presente |
| `p_appt.lead_id` (esperado) | presente |
| `p_appt.lead_id IS NULL` guard (esperado) | presente |
| `ON CONFLICT (appt_id, alert_kind)` (esperado) | presente |

---

## 7 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Drift residual em linha não capturada | Muito baixa | Capturado 1:1 via `pg_get_functiondef` |
| Unique conflita com dados existentes | Muito baixa | `agenda_alerts_log.total_rows = 0` |
| Cron 72 ativado por engano após apply | Aceito | Mig não toca cron · checagem manual antes de religar |
| Sanity DO falha | Muito baixa | Defesa em profundidade · aborta apply |
| GRANT EXECUTE perdido | Muito baixa | `CREATE OR REPLACE` preserva grants |

---

## 8 · Como aplicar pós-revisão (Fase 2D.3B.2)

```bash
# 1. Comparar SQL atual (READ-ONLY)
SELECT pg_get_functiondef('public._agenda_alert_min_before_tick()'::regprocedure);
SELECT pg_get_functiondef('public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure);

# 2. Apply
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000156_clinicai_v2_agenda_alert_automation_hardening.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000156_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000156
rm -rf supabase/migrations

# 4. Validation
#    scripts/validation/20260800000156_validate_agenda_alert_automation_hardening.sql
```

**Importante:** após apply, job 72 continua `active=false`. Religação é decisão separada.

---

## 9 · Confirmações negativas

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativa (apenas 2 SELECT pg_get_functiondef pré-prep · token deletado)
- ❌ Zero cron change · jobs 12/71/72 inalterados
- ❌ Zero job activation
- ❌ Zero execução de funções mutativas
- ❌ Zero `wa_outbox` insert
- ❌ Zero `agenda_alerts_log` insert
- ❌ Zero WhatsApp/Evolution send
- ❌ Zero alteração TS Lara v2
- ❌ Zero alteração em outras RPCs (`wa_daily_summary` mig 155, `_render_appt_template` mig 154, `appt_*` mig 153, demais)
- ❌ Zero schema change em `wa_outbox` / `appointments`
- ❌ Zero backfill / DML em tabelas de negócio
- ❌ Zero commit em git

---

## 10 · Histórico

- **2026-05-11:** Fase 2D.3B entrega 5 artefatos prontos para review · sem apply
- **Defs reais capturadas:** via `pg_get_functiondef` em prod (Management API SELECT · token deletado pós-prep)
- **Próximo:** review SQL no chat → Fase 2D.3B.2 apply controlado → validation
