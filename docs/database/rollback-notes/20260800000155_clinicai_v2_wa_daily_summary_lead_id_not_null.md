# Rollback Note · Mig 155 · `wa_daily_summary` resolve `lead_id` real

**Migration:** `20260800000155_clinicai_v2_wa_daily_summary_lead_id_not_null.sql`
**Tipo:** CIRÚRGICA · forward-only · 1 `CREATE OR REPLACE FUNCTION`
**Data alvo de apply:** TBD (Fase 2D.3A.3.2 · controlado · review prévio do SQL)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Corrigir P0 latente em `public.wa_daily_summary()`:

- Hoje insere em `public.wa_outbox` com `lead_id = NULL`.
- `public.wa_outbox.lead_id` é `uuid NOT NULL` (`column_default: null`, `is_nullable: NO`).
- Cron `daily-agenda-summary` (job 12 · `0 11 * * *`) está ATIVO.
- Quando houver agenda real do dia, o INSERT falha com violação de NOT NULL.
- Snapshot atual: 3 appointments finalizados/passados · zero futuros · risco imediato baixo, bug armado.

---

## 2 · Diff funcional (vs versão pós-mig 154)

Definição real capturada via `pg_get_functiondef('public.wa_daily_summary()'::regprocedure)`.

### Adicionada variável local

```diff
  v_first_name text;
  v_schedule_at timestamptz;
+ v_summary_lead_id uuid;  -- mig 155: resolve lead_id real
```

### Novo SELECT antes do INSERT (a cada profissional/dia)

```diff
    if v_count = 0 then
      continue;
    end if;

+   v_summary_lead_id := NULL;
+   select a.lead_id
+     into v_summary_lead_id
+     from public.appointments a
+    where a.clinic_id = v_clinic_id
+      and a.scheduled_date = v_today
+      and a.professional_name = v_prof.professional_name
+      and a.status not in ('cancelado','no_show')
+      and a.deleted_at is null
+      and a.lead_id is not null
+    order by a.start_time
+    limit 1;
+
+   if v_summary_lead_id is null then
+     continue;
+   end if;
+
    v_first_name := split_part(...);
```

### INSERT atualizado

```diff
    insert into public.wa_outbox (
      clinic_id, lead_id, phone, content, scheduled_at, status, priority, appt_ref
    ) values (
      v_clinic_id,
-     null,
+     v_summary_lead_id,
      v_phone,
      ...
    );
```

**3 mudanças cirúrgicas · resto 1:1 com mig 154.**

---

## 3 · Por que NÃO usar `patient_id` em `wa_outbox.lead_id`

Decisão técnica do Alden:

- `wa_outbox.lead_id` é FK conceitual para `leads(id)`. Usar `patient_id` violaria semântica.
- Patient recorrente não tem lead correspondente (modelo single-table ADR-001 promove lead → patient com mesmo UUID, mas após promoção o lead pode ter sido excluído).
- Se todos os appts de um profissional/dia forem patient_id-only, o resumo desse profissional é **silenciosamente pulado** (sem erro · sem throw · cron continua saudável).
- Decisão escalável: lead institucional ou tornar `lead_id` nullable ficam para fase futura se o caso patient-only se tornar frequente.

---

## 4 · Comportamento esperado por cenário

| Cenário | Comportamento |
|---|---|
| Agenda do dia tem ≥1 appt com `lead_id NOT NULL` para o profissional | Resume normalmente · `v_summary_lead_id` recebe o lead_id do primeiro appt (ORDER BY start_time) · INSERT em wa_outbox OK |
| Todos os appts do profissional/dia são `lead_id IS NULL` (patient-only) | `v_summary_lead_id IS NULL` → `CONTINUE` · profissional fica sem resumo do dia · cron retorna sem erro |
| Profissional sem appts no dia | Já era `v_count = 0` → `CONTINUE` (preservado) |
| Profissional sem WhatsApp/phone | Já era filtrado no SELECT do loop externo (preservado) |
| Sent_key já existe em wa_outbox (queued/processing/retrying/sent) | Já era idempotente → `CONTINUE` (preservado) |

---

## 5 · Escopo fora desta mig

- ❌ Schema da tabela `wa_outbox` (lead_id permanece NOT NULL)
- ❌ Outras RPCs (`_render_appt_template` da mig 154 inalterada, `_enqueue_agenda_alert`, `_agenda_alert_min_before_tick`, `appt_*` da mig 153, demais RPCs)
- ❌ `cron.job` (jobs 12/71/72 inalterados)
- ❌ `wa_outbox_worker_tick` / `agenda_alert_min_before_tick` (continuam desligados)
- ❌ `wa_agenda_automations` / WhatsApp / Evolution / Secretaria
- ❌ TS Lara v2 (`apps/lara/src/`)
- ❌ Backfill / DML em qualquer tabela
- ❌ Criar lead institucional
- ❌ Criar `agenda_alerts_log`

---

## 6 · Como aplicar pós-revisão (Fase 2D.3A.3.2)

```bash
# 1. Comparar SQL atual (READ-ONLY)
SELECT pg_get_functiondef('public.wa_daily_summary()'::regprocedure);

# 2. Apply via Management API
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

## 7 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Drift residual em linha não capturada | Muito baixa | Capturado 1:1 via `pg_get_functiondef` real (pós-mig 154) |
| Cron `daily-agenda-summary` roda durante apply | Muito baixa | `CREATE OR REPLACE` atômico · roda em <1s · cron next 11:00 UTC |
| Profissional com apenas patient_id-only fica sem resumo | Aceito | Decisão técnica · raro hoje (operação ainda em lead-mode) · escalável depois se virar comum |
| GRANT EXECUTE perdido | Muito baixa | `CREATE OR REPLACE` preserva grants existentes |
| Sanity DO block falha (defesa em profundidade) | Muito baixa | Aborta apply · rollback automático · revisar SQL |

---

## 8 · Down NO-OP defensivo

`.down.sql` apenas `RAISE NOTICE`. Rollback exige forward migration nova porque:
- Versão anterior com `lead_id=NULL` reintroduziria a falha NOT NULL
- Dropar a função quebraria o cron job 12

---

## 9 · Confirmações negativas (estado da prep)

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero SQL mutativo executado (apenas SELECT `pg_get_functiondef` pré-prep · token deletado)
- ❌ Zero deploy
- ❌ Zero alteração em outras RPCs
- ❌ Zero alteração em schema de tabelas (`wa_outbox.lead_id` permanece NOT NULL)
- ❌ Zero alteração em cron.job
- ❌ Zero alteração em wa_outbox_worker / wa_agenda_automations / WhatsApp / Evolution / Secretaria
- ❌ Zero alteração em TS Lara v2
- ❌ Zero backfill
- ❌ Zero commit em git (commit feito apenas após review)

---

## 10 · Histórico

- **2026-05-11:** Mig 155 PREPARADA via Fase 2D.3A.3 · sem apply
- **Def real capturada:** via `pg_get_functiondef` (Management API SELECT · token deletado)
- **Próximo:** review do SQL no chat → Fase 2D.3A.3.2 apply controlado → validation
