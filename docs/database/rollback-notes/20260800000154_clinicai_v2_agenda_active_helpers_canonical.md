# Rollback Note · Mig 154 · agenda active helpers canonical

**Migration:** `20260800000154_clinicai_v2_agenda_active_helpers_canonical.sql`
**Tipo:** CIRÚRGICA · forward-only · 2 `CREATE OR REPLACE FUNCTION`
**Data alvo de apply:** TBD (Fase 2D.3A.2 · controlado · review prévio do SQL)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Corrigir 2 funções ativas/seguras que ainda referenciam `appointments.patient_name` (coluna removida no clean-slate da mig 062):

- **`public.wa_daily_summary()`** — cron `daily-agenda-summary` ATIVO chama esta função todo dia 08:00 BRT.
- **`public._render_appt_template(text, record)`** — helper STABLE SECURITY DEFINER usado por automações.

Sem essa correção:
- O cron `daily-agenda-summary` falha silenciosamente todo dia (SELECT em `subject_name` lá dentro tenta ler coluna inexistente).
- Templates renderizados via `_render_appt_template` interpolam string nula no placeholder `{{nome}}` (mas cai em fallback `'paciente'` por `COALESCE` antigo · então tecnicamente não quebra, só perde personalização).

---

## 2 · Funções alteradas

| Função | Tipo | Grants |
|---|---|---|
| `public.wa_daily_summary()` | VOLATILE SECURITY DEFINER · RETURNS integer | Preservados via `CREATE OR REPLACE` |
| `public._render_appt_template(text, record)` | STABLE SECURITY DEFINER · RETURNS text | Preservados via `CREATE OR REPLACE` |

---

## 3 · Diff funcional (vs versão atual no banco · capturada via `pg_get_functiondef`)

### `wa_daily_summary()`

**Trecho ANTES (linha do loop interno):**
```sql
for v_appt in
  select patient_name, procedure_name, start_time, end_time, obs
  from public.appointments
  ...
loop
  ...
  v_body := v_body || v_idx || '. *' || coalesce(v_appt.patient_name, 'Paciente') || '*' || chr(10);
```

**Trecho DEPOIS:**
```sql
for v_appt in
  select subject_name, procedure_name, start_time, end_time, obs
  from public.appointments
  ...
loop
  ...
  v_body := v_body || v_idx || '. *' || coalesce(v_appt.subject_name, 'Paciente') || '*' || chr(10);
```

**Único diff:** 2 ocorrências de `patient_name` → `subject_name`. Todo o resto (dedupe `appt_ref`, `priority=2`, `scheduled_at` 08:00 BRT ou `now()`, fallback `'Paciente'`, join `professional_profiles` por `display_name`, filtro `pp.whatsapp/phone IS NOT NULL`, etc) **inalterado**.

### `_render_appt_template(text, record)`

**Trecho ANTES:**
```sql
v_out := REPLACE(v_out, '{{nome}}',              COALESCE(p_appt.patient_name, 'paciente'));
```

**Trecho DEPOIS:**
```sql
v_out := REPLACE(v_out, '{{nome}}',              COALESCE(NULLIF(p_appt.subject_name, ''), 'paciente'));
```

**Único diff:** `patient_name` → `subject_name` + `NULLIF(..., '')` para cair no fallback quando subject_name é string vazia (default do schema atual é `''`). Resto (placeholders `{{data}}`, `{{hora}}`, `{{profissional}}`, `{{procedimento}}`, `{{clinica}}`, `{{clinic_name}}`, fallback `'nossa equipe'`/`'nossa clinica'`, `BEGIN/EXCEPTION` em `clinics`) **inalterado**.

---

## 4 · Por que `NULLIF(subject_name, '')` (não só `COALESCE`)

A coluna `subject_name` no schema canon (mig 062) tem `NOT NULL DEFAULT ''`. `COALESCE(p_appt.subject_name, 'paciente')` retornaria a string vazia (não NULL) · `{{nome}}` interpolaria vazio. Adicionando `NULLIF(..., '')` o COALESCE recebe NULL e cai no fallback `'paciente'`.

Para `wa_daily_summary` o fallback é `'Paciente'` (maiúsculo) e a função já usa `COALESCE` simples · row com subject_name vazio mostraria `''` em vez de `Paciente`. Mantemos `COALESCE` simples lá (sem `NULLIF`) para preservar comportamento 1:1 com o legado · operadora muito raramente vê esse caso (subject_name é setado em todo INSERT pela mig 153).

---

## 5 · Escopo fora desta mig

- ❌ `appt_upsert` / `appt_sync_batch` / `_appt_upsert_one` (corrigidas em mig 153 · 2D.2)
- ❌ `appt_list` / `appt_delete*` / `appt_create_series` / `appt_set_canonical` / `appt_set_cortesia` (drift em `room_idx` mas coluna existe · não-blocker P0)
- ❌ `_enqueue_agenda_alert` / `_agenda_alert_min_before_tick` (fase 2D.3B · pertencem a automações/min_before atualmente DESLIGADAS · cron jobs 71/72)
- ❌ `wa_outbox_worker` / `wa_agenda_automations` / Cron jobs 71/72 (todos intencionalmente desligados pelo Alden)
- ❌ Schema de qualquer tabela
- ❌ Backfill / DML em `appointments`/`wa_outbox`/qualquer outra tabela

---

## 6 · Como aplicar pós-revisão (Fase 2D.3A.2)

```bash
# 1. Comparar SQL atual (READ-ONLY)
SELECT pg_get_functiondef('public.wa_daily_summary()'::regprocedure);
SELECT pg_get_functiondef('public._render_appt_template(text, record)'::regprocedure);

# 2. Apply via Management API
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000154_clinicai_v2_agenda_active_helpers_canonical.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000154_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000154
rm -rf supabase/migrations

# 4. Validation
#    docs/crm-refactor/sql/phase-2d3a-agenda-active-helpers-post-apply-validation.sql
```

---

## 7 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Drift residual em outra linha não capturada | Muito baixa | Mig 154 foi capturada 1:1 via `pg_get_functiondef` no banco real (não mig local) · review pré-apply confirma |
| Cron daily-agenda-summary roda durante apply | Baixa | `CREATE OR REPLACE` é atômico · roda em <1s · cron next 08:00 BRT |
| `_render_appt_template` chamado por outras funções durante apply | Muito baixa | STABLE · resultado idêntico em rerun |
| GRANT EXECUTE perdido | Muito baixa | `CREATE OR REPLACE` preserva grants |
| `subject_name` vazio causa template `{{nome}}` vazio em `wa_daily_summary` | Aceito | Mantido 1:1 com legado · row com subject_name vazio é extremamente raro |

---

## 8 · Down NO-OP defensivo

`.down.sql` apenas `RAISE NOTICE`. Rollback exige forward migration nova porque:
- Versão anterior (com `patient_name`) reintroduziria a falha silenciosa
- Não há canon anterior versionado localmente

---

## 9 · Confirmações negativas (estado da prep)

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativo (só SELECT pg_get_functiondef pré-prep)
- ❌ Zero deploy
- ❌ Zero alteração em `appt_*` (corrigidas em mig 153)
- ❌ Zero alteração em `_enqueue_agenda_alert` / `_agenda_alert_min_before_tick`
- ❌ Zero alteração em cron.job 71/72 / wa_outbox_worker / wa_agenda_automations
- ❌ Zero alteração em WhatsApp / Evolution / Secretaria
- ❌ Zero alteração de schema
- ❌ Zero backfill
- ❌ Zero commit

---

## 10 · Histórico

- **2026-05-11:** Mig 154 PREPARADA via Fase 2D.3A · sem apply · sem commit
- **Defs reais capturadas:** via `pg_get_functiondef` em prod (Management API SELECT)
- **Próximo:** review do SQL no chat → Fase 2D.3A.2 apply controlado → validation
