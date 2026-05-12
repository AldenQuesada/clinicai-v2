# Fase 2D.3G · agenda alert content fallback hardening · PREP

> Preparação da mig 158 cirúrgica. **NÃO APLICADA.** Apply controlado fica
> para Fase 2D.3G.2 após review do SQL no chat.

---

## 1 · Resumo executivo

Smoke 2D.3D.1-R2 expôs achado adjacente (não bloqueia FK fix da mig 157, mas bloqueia ativação operacional do job 72):

- rule `Alerta 10 Min` (id `515e9b19-...`) tem `content_template = ''` e `alert_title` válido
- `_render_appt_template('')` retorna `''` (não NULL)
- `COALESCE('', rendered_alert_title, fallback)` escolhe `''`
- `wa_outbox.content` fica vazio · send seria no-op

Auditoria 2D.3G verdict: `BUG_EMPTY_STRING_CAN_WIN_COALESCE`.

Esta fase entrega 5 artefatos prontos para review:

1. Mig 158 forward (CREATE OR REPLACE `_enqueue_agenda_alert` com NULLIF + sanity DO)
2. Mig 158 down NO-OP defensivo
3. Rollback note
4. Validation SQL pós-apply (17 VALs read-only)
5. Este doc

**Sem apply. Sem SQL mutativo no banco. Sem deploy. Sem alteração TS Lara v2. Sem mexer em cron/regras/wa_outbox/agenda_alerts_log.**

---

## 2 · Mudanças na mig 158

### 2.1 · Correção mínima do COALESCE

**Antes (bug):**

```sql
v_content := coalesce(
  public._render_appt_template(p_rule.content_template, p_appt),
  public._render_appt_template(p_rule.alert_title, p_appt),
  '[Alerta] ' || p_alert_kind
);
```

**Depois (fix):**

```sql
v_content := COALESCE(
  NULLIF(public._render_appt_template(p_rule.content_template, p_appt), ''),
  NULLIF(public._render_appt_template(p_rule.alert_title, p_appt), ''),
  '[Alerta] ' || p_alert_kind
);
```

Escolha de escopo mínimo: `NULLIF(x, '')` apenas trata string vazia como NULL. Sem `BTRIM` (preserva espaços intencionais nas extremidades).

### 2.2 · Preservações

- assinatura `(uuid, record, text, record, text) RETURNS uuid`
- `SECURITY DEFINER`
- `SET search_path TO 'public', 'extensions', 'pg_temp'`
- guard `p_clinic_id IS NULL → RETURN NULL`
- guard `p_phone IS NULL OR trim(p_phone) = '' → RETURN NULL`
- guard `p_appt.lead_id IS NULL → RETURN NULL` (mig 156)
- normalização telefone via `regexp_replace(p_phone, '[^0-9]', '', 'g')`
- `INSERT INTO public.wa_outbox` com 12 colunas idênticas
- `p_appt.lead_id` como `wa_outbox.lead_id` (mig 156)
- `INSERT INTO public.agenda_alerts_log` com `p_appt.lead_id::text`
- `ON CONFLICT (appt_id, alert_kind) DO NOTHING`
- grants atuais (CREATE OR REPLACE preserva)

### 2.3 · Sanity DO block

Aborta apply (`RAISE EXCEPTION`) se a função pós-replace não passar nos 7 checks:

| Check | Detecta |
|---|---|
| `NULLIF(... content_template ...)` presente | fix aplicado lado 1 |
| `NULLIF(... alert_title ...)` presente | fix aplicado lado 2 |
| `INSERT INTO public.wa_outbox` presente | INSERT preservado |
| `p_appt.lead_id IS NULL` presente | guard mig 156 preservado |
| `p_appt.patient_id` ausente | regressão mig 156 evitada |
| `ON CONFLICT (appt_id, alert_kind)` presente | UNIQUE idempotência preservada |
| padrão bugado pré-mig158 ausente | sem regressão de COALESCE direto |

### 2.4 · `NOTIFY pgrst, 'reload schema'`

---

## 3 · Resumo técnico (decisão Alden)

- **Fix no consumer**, não no produtor: `_render_appt_template` continua com contrato existente
- **Templates `wa_agenda_automations` não modificados** · fix é defensivo contra qualquer rule futura com `content_template = ''`
- **Escopo mínimo** · NULLIF em vez de BTRIM (preserva espaços intencionais)
- **`CREATE OR REPLACE FUNCTION`** preserva grants automaticamente
- **Nenhuma outra função tocada** · zero risco de regressão cross-helper

---

## 4 · Arquivos criados (working tree · sem commit no momento da escrita)

| Arquivo | Tipo |
|---|---|
| [db/migrations/20260800000158_clinicai_v2_agenda_alert_content_fallback.sql](../../db/migrations/20260800000158_clinicai_v2_agenda_alert_content_fallback.sql) | Forward (CREATE OR REPLACE + sanity DO + NOTIFY) |
| [db/migrations/20260800000158_clinicai_v2_agenda_alert_content_fallback.down.sql](../../db/migrations/20260800000158_clinicai_v2_agenda_alert_content_fallback.down.sql) | Down NO-OP defensivo |
| [docs/database/rollback-notes/20260800000158_clinicai_v2_agenda_alert_content_fallback.md](../database/rollback-notes/20260800000158_clinicai_v2_agenda_alert_content_fallback.md) | Rollback note |
| [scripts/validation/20260800000158_validate_agenda_alert_content_fallback.sql](../../scripts/validation/20260800000158_validate_agenda_alert_content_fallback.sql) | 17 VALs read-only |
| Este doc | Prep |

---

## 5 · Static safety scan

| Padrão | Hits esperados |
|---|---|
| `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM` | 0 |
| `UPDATE cron.job` / `cron.schedule` / `cron.unschedule` | 0 |
| `UPDATE public.appointments` / `UPDATE public.wa_outbox` / `UPDATE public.agenda_alerts_log` / `UPDATE public.wa_agenda_automations` | 0 |
| `INSERT INTO` em qualquer tabela durante apply | 0 (CREATE OR REPLACE é DDL) |
| `CREATE OR REPLACE FUNCTION public._enqueue_agenda_alert` | 1 |
| `NULLIF(public._render_appt_template(p_rule.content_template, p_appt), '')` | 1 |
| `NULLIF(public._render_appt_template(p_rule.alert_title, p_appt), '')` | 1 |
| Sanity DO block | 1 |

---

## 6 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `CREATE OR REPLACE` perde grants | Nenhuma | Postgres preserva grants em `CREATE OR REPLACE FUNCTION` |
| Templates com conteúdo `' '` (espaço puro) ficariam vazios | Nenhuma | NULLIF apenas trata `''`, não `' '` · escolha consciente |
| `_render_appt_template` retorna `' '` (não `''`) e ainda passa coalesce | Muito baixa | NULLIF não cobre · se ocorrer, fase 2D.3H opcional |
| Outros consumers afetados | Nenhuma | Só `_enqueue_agenda_alert` é tocada |
| DDL bloqueia em waitlock | Muito baixa | `CREATE OR REPLACE FUNCTION` é atômico em ~ms |
| Sanity DO block falha | Muito baixa | Defesa em profundidade · aborta apply |

---

## 7 · Como aplicar pós-revisão (Fase 2D.3G.2)

```bash
# 1. Comparar def atual (READ-ONLY)
SELECT pg_get_functiondef(
  'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
);

# 2. Apply
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000158_clinicai_v2_agenda_alert_content_fallback.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000158_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000158
rm -rf supabase/migrations

# 4. Validation
#    scripts/validation/20260800000158_validate_agenda_alert_content_fallback.sql
```

Pós-apply, o smoke 2D.3D.1-R2 pode ser refeito e `wa_outbox.content` deve conter o `alert_title` renderizado em vez de string vazia.

---

## 8 · Confirmações negativas

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativa (mig prep)
- ❌ Zero deploy
- ❌ Zero cron change (jobs 12/71/72 inalterados)
- ❌ Zero job activation (71/72 continuam desligados)
- ❌ Zero execução de funções (`_agenda_alert_min_before_tick`, `_enqueue_agenda_alert`, `wa_daily_summary`, `_render_appt_template` não chamadas)
- ❌ Zero `wa_outbox` insert
- ❌ Zero `agenda_alerts_log` insert
- ❌ Zero WhatsApp/Evolution send
- ❌ Zero alteração TS/app code (`apps/lara/src/`)
- ❌ Zero alteração em `_render_appt_template` / `_agenda_alert_min_before_tick` / `_appt_professional_phone` / `wa_daily_summary` / `appt_*` / `wa_agenda_automations`
- ❌ Zero criação de app_user fake / professional_profile fake / lead institucional
- ❌ Zero alteração de dados em `wa_agenda_automations` (templates intocados · fix é no consumer)
- ❌ Zero ação sobre monitoramento `2986→7773` nesta fase
- ❌ Zero secret persistido (mig prep não exigiu Management API)

---

## 9 · Histórico

- **2026-05-11:** Fase 2D.3G entrega 5 artefatos prontos para review · sem apply
- **Baseado em:** smoke 2D.3D.1-R2 (achado adjacente `wa_outbox.content=""`) + auditoria 2D.3G
- **Próximo:** review SQL no chat → Fase 2D.3G.2 apply controlado → validation → re-smoke 2D.3D.1
