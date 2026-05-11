# 39 · Fase 2D.3A · Agenda active helpers canonical · PREP (sem apply)

> Preparação da mig 154 que corrige 2 funções ativas/seguras ainda
> referenciando `appointments.patient_name`. **NÃO APLICADA.** Apply
> controlado fica para Fase 2D.3A.2 após revisão de SQL no chat.

---

## 1 · Resumo executivo

Pós-mig 153 (Fase 2D.2 · `appt_upsert`/`appt_sync_batch` canonicalizados), o drift scan no banco real identificou 2 funções **ainda ativas** que leem `appointments.patient_name` (coluna removida no clean-slate da mig 062):

1. `public.wa_daily_summary()` — cron `daily-agenda-summary` **ATIVO** todo dia 08:00 BRT
2. `public._render_appt_template(text, record)` — helper STABLE SECURITY DEFINER

Esta fase entrega 5 artefatos prontos para review:

1. Mig 154 forward (`CREATE OR REPLACE FUNCTION` × 2)
2. Mig 154 down NO-OP defensivo
3. Rollback note completo
4. SQL de validação pós-apply (10 VALs · todas READ-ONLY)
5. Este doc

**Sem apply. Sem SQL mutativo. Sem deploy. Sem alteração TS Lara v2.**

---

## 2 · Diferença vs versão atual no banco

Defs capturadas via `pg_get_functiondef` em prod (Management API SELECT · token deletado após). Mig 154 reproduz 1:1 com apenas 2 trocas funcionais:

### `wa_daily_summary()`

| Local | Antes | Depois |
|---|---|---|
| `select` no loop interno (linha ~71) | `select patient_name, procedure_name, ...` | `select subject_name, procedure_name, ...` |
| Construção do body (linha ~80) | `coalesce(v_appt.patient_name, 'Paciente')` | `coalesce(v_appt.subject_name, 'Paciente')` |

Resto **inalterado**: dedupe por `appt_ref daily_summary_<date>_<md5>`, status `'queued'`, `priority=2`, `scheduled_at` 08:00 BRT (ou `now()` se já passou), join `professional_profiles` por `display_name`, filtro `pp.whatsapp/phone NOT NULL`, fallback `'Paciente'` (maiúsculo), formato da mensagem com emojis/separadores.

### `_render_appt_template(text, record)`

| Local | Antes | Depois |
|---|---|---|
| Placeholder `{{nome}}` | `COALESCE(p_appt.patient_name, 'paciente')` | `COALESCE(NULLIF(p_appt.subject_name, ''), 'paciente')` |

Resto **inalterado**: STABLE SECURITY DEFINER, `search_path`, fallback `'nossa equipe'`/`'nossa clinica'`, BEGIN/EXCEPTION em `clinics`, todos os outros placeholders (`{{data}}`, `{{hora}}`, `{{profissional}}`, `{{profissional_nome}}`, `{{procedimento}}`, `{{clinica}}`, `{{clinic_name}}`).

**Por que `NULLIF` no helper:** `subject_name` no schema canon tem `NOT NULL DEFAULT ''`. `COALESCE(subject_name, 'paciente')` retornaria string vazia (não NULL) se subject_name fosse `''` · `{{nome}}` interpolaria vazio. `NULLIF(..., '')` converte vazio em NULL e dispara fallback.

**Por que NÃO `NULLIF` no `wa_daily_summary`:** preservar 1:1 com legado · raras rows com subject_name vazio mostram `''` em vez de `Paciente`, mas é caso extremo (mig 153 sempre seta valor).

---

## 3 · Arquivos criados (working tree · sem commit)

| Arquivo | Tipo | Status |
|---|---|---|
| [db/migrations/20260800000154_clinicai_v2_agenda_active_helpers_canonical.sql](db/migrations/20260800000154_clinicai_v2_agenda_active_helpers_canonical.sql) | NOVO · forward (2 `CREATE OR REPLACE FUNCTION`) | ✅ |
| [db/migrations/20260800000154_clinicai_v2_agenda_active_helpers_canonical.down.sql](db/migrations/20260800000154_clinicai_v2_agenda_active_helpers_canonical.down.sql) | NOVO · down NO-OP | ✅ |
| [docs/database/rollback-notes/20260800000154_clinicai_v2_agenda_active_helpers_canonical.md](docs/database/rollback-notes/20260800000154_clinicai_v2_agenda_active_helpers_canonical.md) | NOVO · rollback note | ✅ |
| [docs/crm-refactor/sql/phase-2d3a-agenda-active-helpers-post-apply-validation.sql](docs/crm-refactor/sql/phase-2d3a-agenda-active-helpers-post-apply-validation.sql) | NOVO · 10 VALs (READ-ONLY) | ✅ |
| [docs/crm-refactor/39-phase-2d3a-agenda-active-helpers-prep.md](docs/crm-refactor/39-phase-2d3a-agenda-active-helpers-prep.md) | NOVO · este doc | ✅ |

---

## 4 · Escopo da mig 154

### Faz

- 2 `CREATE OR REPLACE FUNCTION` (forward-only · preserva grants)
- 1 DO block sanity check DENTRO da transação (`RAISE EXCEPTION` aborta apply se faltar)
- `NOTIFY pgrst, 'reload schema'`

### NÃO faz

- ❌ Não altera `appt_upsert`/`appt_sync_batch`/`_appt_upsert_one` (já corrigidas em mig 153)
- ❌ Não altera `appt_list`/`appt_delete*`/`appt_create_series`/`appt_set_canonical`/`appt_set_cortesia`
- ❌ Não altera `_enqueue_agenda_alert`/`_agenda_alert_min_before_tick` (fase 2D.3B)
- ❌ Não altera `wa_outbox_worker_tick` / cron.job 71 / cron.job 72 (desligados intencionalmente)
- ❌ Não altera `wa_agenda_automations` / `wa_outbox` / WhatsApp / Evolution / Secretaria
- ❌ Não altera schema de tabelas
- ❌ Não altera código TS Lara v2 (`apps/lara/src/`)
- ❌ Não faz backfill / zero DML em `appointments`/`wa_outbox`/qualquer tabela
- ❌ DROP TABLE / DROP COLUMN / TRUNCATE / DELETE FROM / ALTER TYPE / CREATE TYPE / DROP TYPE: 0 hits

---

## 5 · Static safety scan

```
$ rg "DROP TABLE|DROP COLUMN|TRUNCATE|DELETE FROM|ALTER TYPE|CREATE TYPE|DROP TYPE" \
     db/migrations/20260800000154_*.sql db/migrations/20260800000154_*.down.sql
→ 0 hits
```

Tokens checagem:

| Token | mig 154.sql |
|---|---|
| `patient_name` | 0 hits em código executável · 1 hit em comentário descritivo (header) |
| `subject_name` | 4 ocorrências em código |
| `wa_daily_summary` | 3 (1 CREATE OR REPLACE + 1 COMMENT + 1 sanity DO) |
| `_render_appt_template` | 3 (idem) |

---

## 6 · Checks de typecheck

A mig 154 não toca TS · typechecks devem permanecer estáveis.

| Pacote | Esperado |
|---|---|
| `@clinicai/lara` | ✅ PASS |
| `@clinicai/repositories` | ✅ PASS |
| `@clinicai/ui` | ✅ PASS |

---

## 7 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Drift residual em linha não capturada | Muito baixa | Capturado 1:1 via `pg_get_functiondef` real do banco |
| Cron `daily-agenda-summary` roda durante o apply | Baixa | `CREATE OR REPLACE` atômico · roda em <1s · cron next 08:00 BRT |
| `_render_appt_template` chamado por outras funções durante apply | Muito baixa | STABLE · resultado idêntico em rerun |
| GRANT EXECUTE perdido | Muito baixa | `CREATE OR REPLACE` preserva grants existentes |
| `subject_name` vazio causa template `{{nome}}` vazio no `wa_daily_summary` | Aceito · raro | Row com subject_name vazio é caso extremo · mig 153 garante valor em inserts novos |

---

## 8 · Como aplicar pós-revisão (Fase 2D.3A.2)

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

# 4. Validation (READ-ONLY)
#    docs/crm-refactor/sql/phase-2d3a-agenda-active-helpers-post-apply-validation.sql
```

---

## 9 · Confirmações negativas

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativo (apenas SELECT pg_get_functiondef pré-prep · token deletado)
- ❌ Zero deploy
- ❌ Zero alteração em `appt_*` (mig 153 já cuidou)
- ❌ Zero alteração em `_enqueue_agenda_alert` / `_agenda_alert_min_before_tick` (fase 2D.3B)
- ❌ Zero alteração em cron.job (jobs 71/72 desligados continuam desligados)
- ❌ Zero alteração em `wa_outbox` / `wa_agenda_automations`
- ❌ Zero alteração em WhatsApp / Evolution / Secretaria
- ❌ Zero alteração em TS Lara v2
- ❌ Zero backfill
- ❌ Zero commit em git

---

## 10 · Histórico

- **2026-05-11:** Fase 2D.3A entrega 5 artefatos prontos para review · zero apply · zero commit
- **Defs reais capturadas:** via `pg_get_functiondef` em prod (Management API · token rotacionado deletado pós-prep)
- **Próximo:** review do SQL no chat → Fase 2D.3A.2 apply controlado → validation
