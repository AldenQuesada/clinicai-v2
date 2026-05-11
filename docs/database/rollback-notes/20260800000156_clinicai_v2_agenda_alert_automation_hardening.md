# Rollback Note · Mig 156 · agenda alert automation hardening

**Migration:** `20260800000156_clinicai_v2_agenda_alert_automation_hardening.sql`
**Tipo:** CIRÚRGICA · forward-only · 1 UNIQUE + 2 `CREATE OR REPLACE FUNCTION`
**Data alvo de apply:** TBD (Fase 2D.3B.2 · controlado · review prévio do SQL)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Corrigir 2 blockers em automações de alerta de agenda atualmente DESLIGADAS (cron job 72 · `active=false`). Religar o cron sem essa correção quebraria em produção.

---

## 2 · Bugs corrigidos

### 2.1 · `_agenda_alert_min_before_tick()` · comparação uuid/text sem cast

**Antes (def real capturada via `pg_get_functiondef`):**
```sql
AND NOT EXISTS (
  SELECT 1
  FROM public.agenda_alerts_log l
  WHERE l.appt_id = a.id            -- l.appt_id é text · a.id é uuid
    AND l.alert_kind = 'min' || v_mins::text
)
```

**Depois:**
```sql
WHERE l.appt_id = a.id::text       -- mig 156: cast explícito
```

### 2.2 · `_enqueue_agenda_alert(...)` · patient_id no lead_id (NOT NULL viola)

**Antes (def real):**
```sql
INSERT INTO public.wa_outbox (clinic_id, lead_id, phone, ...)
VALUES (p_clinic_id, p_appt.patient_id, ...);     -- viola NOT NULL se lead-only

INSERT INTO public.agenda_alerts_log (..., lead_id, ...)
VALUES (..., p_appt.patient_id::text, ...);        -- semântica errada
```

**Depois:**
```sql
-- guard novo antes do INSERT (return NULL silencioso)
IF p_appt.lead_id IS NULL THEN
  RETURN NULL;
END IF;

INSERT INTO public.wa_outbox (clinic_id, lead_id, phone, ...)
VALUES (p_clinic_id, p_appt.lead_id, ...);         -- lead_id real

INSERT INTO public.agenda_alerts_log (..., lead_id, ...)
VALUES (..., p_appt.lead_id::text, ...);
```

### 2.3 · `agenda_alerts_log` · UNIQUE(appt_id, alert_kind) para suportar ON CONFLICT

Hoje tabela tem só PK em `id` + FK em `clinic_id` · ON CONFLICT no `_enqueue_agenda_alert` não tem base. Mig 156 cria a constraint idempotente:

```sql
ALTER TABLE public.agenda_alerts_log
  ADD CONSTRAINT agenda_alerts_log_appt_id_alert_kind_key
  UNIQUE (appt_id, alert_kind);
```

Tabela está vazia (`total_rows=0`) · criação segura sem risco de violação.

---

## 3 · Decisão técnica (Alden)

- ❌ NÃO usar `patient_id` em `wa_outbox.lead_id` (viola semântica FK conceitual)
- ❌ NÃO usar `COALESCE(p_appt.lead_id, p_appt.patient_id)` (mesmo problema semântico)
- ✅ Usar APENAS `p_appt.lead_id`
- ✅ Se `p_appt.lead_id IS NULL` → `RETURN NULL` silencioso (cenário patient-only · não throw)
- ✅ Preservar assinatura, SECURITY DEFINER, search_path, grants
- ✅ Preservar conteúdo render via `_render_appt_template` + regexp phone + RETURNING

---

## 4 · Estrutura preservada 1:1 vs def real do banco

- `_agenda_alert_min_before_tick()` · loop em `wa_agenda_automations` + match em janela de tempo BRT + filtro de status canônicos + `_appt_professional_phone` · **inalterado**
- `_enqueue_agenda_alert(...)` · render `_render_appt_template`, regexp phone, INSERT wa_outbox com `priority=1`/`max_attempts=3`/`status='queued'`/`appt_ref=p_appt.id`/`rule_id=p_rule.id`, RETURNING id, INSERT agenda_alerts_log com ON CONFLICT (appt_id, alert_kind) · **inalterado** exceto pelos 3 fixes acima

---

## 5 · Comportamento esperado por cenário

| Cenário | Comportamento |
|---|---|
| Appt lead-only (lead_id NOT NULL) | INSERT wa_outbox OK + INSERT agenda_alerts_log OK |
| Appt patient-only (lead_id NULL) | `_enqueue_agenda_alert` retorna NULL silencioso · zero INSERT · cron continua saudável |
| Mesmo appt + alert_kind chamado 2× | Segunda chamada cai em ON CONFLICT DO NOTHING (idempotência preservada) |
| Phone vazio/null | `_enqueue_agenda_alert` retorna NULL (preservado) |

---

## 6 · Escopo fora desta mig

- ❌ Schema da tabela `wa_outbox` (lead_id permanece NOT NULL)
- ❌ Schema da tabela `appointments`
- ❌ Outras RPCs (`wa_daily_summary` mig 155, `_render_appt_template` mig 154, `appt_*` mig 153, demais)
- ❌ `cron.job` (jobs 12/71/72 inalterados · 72 permanece DESLIGADO)
- ❌ `wa_outbox_worker_tick` / `wa_agenda_automations` data
- ❌ WhatsApp / Evolution / Secretaria
- ❌ TS Lara v2
- ❌ Backfill / DML em qualquer tabela de negócio
- ❌ Lead institucional / outros workarounds

---

## 7 · Como aplicar pós-revisão (Fase 2D.3B.2 · NÃO executar agora)

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

**Importante:** job 72 (`agenda_alert_min_before_tick`) continua `active=false` mesmo pós-mig 156. Religação do cron é decisão separada · não automática.

---

## 8 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Drift residual em linha não capturada | Muito baixa | Capturado 1:1 via `pg_get_functiondef` |
| Unique constraint conflita com dados existentes | Muito baixa | `agenda_alerts_log.total_rows = 0` (confirmado pelo Alden) |
| Cron 72 ativado por engano após apply | Aceito | Mig não toca cron · checagem manual antes de religar |
| GRANT EXECUTE perdido | Muito baixa | `CREATE OR REPLACE` preserva grants existentes |
| Sanity DO block falha (defesa em profundidade) | Muito baixa | Aborta apply · rollback automático · revisar SQL |

---

## 9 · Down NO-OP defensivo

`.down.sql` apenas `RAISE NOTICE`. Rollback exige forward migration nova porque:
- Reverter cast `a.id::text` reintroduziria bug uuid/text
- Reverter `p_appt.lead_id` para `p_appt.patient_id` quebraria NOT NULL
- Dropar a UNIQUE removeria base do ON CONFLICT (idempotência)

---

## 10 · Confirmações negativas (estado da prep)

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativa (apenas 2 SELECT `pg_get_functiondef` pré-prep · token deletado)
- ❌ Zero cron change · job 72 continua DESLIGADO
- ❌ Zero job activation
- ❌ Zero execução de `_agenda_alert_min_before_tick` ou `_enqueue_agenda_alert`
- ❌ Zero INSERT em `wa_outbox` ou `agenda_alerts_log`
- ❌ Zero WhatsApp/Evolution send
- ❌ Zero alteração TS/app code
- ❌ Zero alteração em outras RPCs
- ❌ Zero alteração de schema em `wa_outbox` ou `appointments`
- ❌ Zero backfill / DML em tabelas de negócio
- ❌ Zero commit em git (commit feito apenas após review)

---

## 11 · Histórico

- **2026-05-11:** Mig 156 PREPARADA via Fase 2D.3B · sem apply
- **Defs reais capturadas:** via `pg_get_functiondef` em prod (Management API SELECT · token deletado pós-prep)
- **Próximo:** review SQL no chat → Fase 2D.3B.2 apply controlado → validation
