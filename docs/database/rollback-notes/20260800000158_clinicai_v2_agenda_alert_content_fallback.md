# Rollback Note · Mig 158 · agenda alert content fallback hardening

**Migration:** `20260800000158_clinicai_v2_agenda_alert_content_fallback.sql`
**Tipo:** CIRÚRGICA · forward-only · CREATE OR REPLACE de `_enqueue_agenda_alert` + sanity DO
**Data alvo de apply:** TBD (Fase 2D.3G.2 · controlado · review prévio do SQL)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Corrigir o fallback de conteúdo em `_enqueue_agenda_alert` que permitia `wa_outbox.content = ''` quando `wa_agenda_automations.content_template = ''`.

### Bug observado (smoke 2D.3D.1-R2)

- rule `Alerta 10 Min` (id `515e9b19-bda9-42f7-b7ee-24f6d751d306`) tem:
  - `content_template = ''`
  - `alert_title = 'Proximo paciente em 10 min: {{nome}} — {{procedimento}}'`
- `_render_appt_template('')` retorna `''` (não NULL)
- `COALESCE('', rendered_alert_title, fallback)` escolhe `''`
- `wa_outbox.content` fica vazio
- Bloqueia ativação operacional do job 72 (`agenda_alert_min_before_tick`)

### Auditoria 2D.3G

`ENQUEUE_CONTENT_FALLBACK_SCAN` verdict:

| Marker | Valor |
|---|---|
| `uses_render_template` | true |
| `mentions_content_template` | true |
| `mentions_alert_title` | true |
| `has_nullif` | **false** ← gap |
| `has_coalesce` | true |
| `inserts_outbox` | true |
| verdict | `BUG_EMPTY_STRING_CAN_WIN_COALESCE` |

---

## 2 · Mudanças

### 2.1 · Correção mínima de `v_content`

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

`NULLIF(x, '')` retorna NULL se `x = ''`, permitindo o COALESCE descer para o próximo candidato.

### 2.2 · Sanity DO block

Aborta apply (`RAISE EXCEPTION`) se a função pós-replace:

- Não contém `NULLIF(..., '')` no render de `content_template`
- Não contém `NULLIF(..., '')` no render de `alert_title`
- Não contém `INSERT INTO public.wa_outbox`
- Não contém guard `p_appt.lead_id IS NULL`
- Reintroduziu `p_appt.patient_id`
- Não contém `ON CONFLICT (appt_id, alert_kind)`
- Ainda contém o padrão bugado (COALESCE sem NULLIF nos renders)

### 2.3 · `NOTIFY pgrst, 'reload schema'`

---

## 3 · O que NÃO mudou

- `_render_appt_template` (mig 154) · zero alteração
- `_agenda_alert_min_before_tick()` (mig 156) · zero alteração
- `_appt_professional_phone(record)` · zero alteração
- `wa_daily_summary()` (mig 155) · zero alteração
- `appt_upsert` / `appt_sync_batch` / `_appt_upsert_one` (mig 153)
- `lead_to_appointment` / `appointment_attend` / `appointment_finalize` / `appointment_change_status`
- `cron.job` 12/71/72 (12 ativo · 71/72 desligados continuam desligados)
- Schema de `wa_outbox` / `agenda_alerts_log` / `wa_agenda_automations` / `appointments`
- Regras `wa_agenda_automations` (templates **não modificados** · fix é no consumidor, não na origem)
- TS Lara v2 (`apps/lara/src/`)

---

## 4 · Por que esta abordagem (decisão Alden)

| Alternativa descartada | Motivo |
|---|---|
| Alterar `_render_appt_template` para retornar NULL em template `''` | Mudança de contrato · pode quebrar outros consumers (`wa_daily_summary`, futuros) |
| Editar `wa_agenda_automations` para popular `content_template` | Toca dados · fix de sintoma · próxima rule com `''` reintroduz bug |
| Adicionar CHECK constraint em `wa_agenda_automations.content_template <> ''` | Quebra rules legítimas que dependem só de `alert_title` |
| Usar `BTRIM(...)` em vez de `NULLIF(..., '')` | Remove espaços intencionais nas extremidades · escopo maior que o necessário |

Estratégia escolhida: **`NULLIF(render, '')`** no consumer (`_enqueue_agenda_alert`). Escopo mínimo · zero efeito colateral em templates legítimos · zero mudança de dados.

---

## 5 · Como aplicar pós-revisão (Fase 2D.3G.2)

```bash
# 1. Comparar def atual (READ-ONLY)
SELECT pg_get_functiondef(
  'public._enqueue_agenda_alert(uuid, record, text, record, text)'::regprocedure
);

# 2. Apply via Management API
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

Pós-apply, o smoke 2D.3D.1-R2 pode ser refeito e dessa vez `wa_outbox.content` deve conter o `alert_title` renderizado em vez de string vazia.

---

## 6 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `CREATE OR REPLACE` perde grants | Nenhuma | `CREATE OR REPLACE FUNCTION` preserva grants em PostgreSQL |
| Mudança de comportamento para templates legítimos | Nenhuma | `NULLIF(x, '')` é no-op quando `x <> ''` |
| Outros consumers de `_render_appt_template` afetados | Nenhuma | Função não é alterada · só o consumer `_enqueue_agenda_alert` |
| Sanity DO block falha | Muito baixa | Defesa em profundidade · aborta apply |

---

## 7 · Down NO-OP defensivo

`.down.sql` apenas `RAISE NOTICE`. Rollback exige forward migration nova porque:

- Restaurar a versão pré-mig158 reintroduz o bug
- Nenhum dado foi alterado · só a definição da função
- Função antiga ainda está no histórico git

---

## 8 · Confirmações negativas (estado da prep)

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativa
- ❌ Zero deploy
- ❌ Zero cron change · jobs 12/71/72 inalterados
- ❌ Zero job activation
- ❌ Zero execução de funções mutativas
- ❌ Zero `wa_outbox` insert
- ❌ Zero `agenda_alerts_log` insert
- ❌ Zero WhatsApp/Evolution send
- ❌ Zero alteração TS/app code
- ❌ Zero alteração em `_render_appt_template` / `_agenda_alert_min_before_tick` / `_appt_professional_phone` / `wa_daily_summary` / `appt_*` / `wa_agenda_automations`
- ❌ Zero criação de app_user fake / professional_profile fake / lead institucional
- ❌ Zero ação sobre monitoramento `2986→7773` nesta fase
- ❌ Zero commit em git no momento da escrita desta nota (commit apenas após review)

---

## 9 · Histórico

- **2026-05-11:** Mig 158 PREPARADA via Fase 2D.3G · sem apply
- **Baseado em:** smoke 2D.3D.1-R2 (achado adjacente `content=""`) + auditoria 2D.3G
- **Próximo:** review SQL no chat → Fase 2D.3G.2 apply controlado → validation → re-smoke 2D.3D.1
