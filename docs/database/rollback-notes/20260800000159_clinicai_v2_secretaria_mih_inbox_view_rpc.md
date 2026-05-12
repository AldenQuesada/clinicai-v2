# Rollback Note · Mig 159 · secretaria Mih (2986) inbox view + RPCs

**Migration:** `20260800000159_clinicai_v2_secretaria_mih_inbox_view_rpc.sql`
**Tipo:** ADITIVA · forward-only seguro · CREATE OR REPLACE VIEW + 2 RPCs novas · zero alteração de dados/triggers/tabelas existentes
**Data alvo de apply:** TBD (Fase 2D.4.2 · controlado · review prévio do SQL)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Blindar o DB contra regressão do incidente 2026-05-11 (Patch 1 corrigiu no código a query do `/secretaria`; esta migration cria a fonte canônica no banco e remove a dependência de `inbox_role='secretaria'` solto, que mistura 4 canais legacy).

### Diagnóstico que motiva

- `inbox_role='secretaria'` **NÃO é identidade de canal** — Mih + Mira + Mira Marci + Canal auxiliar carregam esse role.
- `wa_number_id` **É** identidade de canal.
- `wa_conversations.last_message_at` mistura histórico geral com fila operacional e sofre drift residual do incidente do trigger zumbi (2026-05-04).

### Princípio

Fonte canônica no banco (view + RPCs) elimina a possibilidade de novas queries do app caírem no padrão errado. RPC retorna `SETOF view` e RLS herdada da view + `app_clinic_id()` JWT garantem isolamento tenant.

---

## 2 · Mudanças

### 2.1 · VIEW `public.secretaria_mih_conversations_view`

Hardcoded em `phone='5544991622986'` + `is_active=true`. Junta `wa_conversations` com `wa_messages` (LEFT JOIN agregado) para derivar:

- `latest_message_at_from_messages` = `max(wa_messages.sent_at)` (ignora `deleted_at`).
- `sort_at` = `GREATEST(last_message_at, max msg, updated_at)` — ordem robusta a drift.
- `is_preview_stale` = `max msg > last_message_at + 60s` (cosmético).
- `preview_drift_seconds` = `int` em segundos.

Demais colunas: cópia de `wa_conversations` (id, clinic_id, wa_number_id, phone, display_name, lead_id, status, inbox_role, unread_count, last_message_at, last_message_text, last_lead_msg, last_inbound_time, ai_enabled, ai_paused_until, assigned_to, assigned_at, created_at, updated_at).

GRANT SELECT → `authenticated`, `service_role`.

### 2.2 · RPC `public.get_secretaria_mih_inbox(p_limit int, p_before timestamptz)`

- `SECURITY DEFINER` · `search_path` blindado.
- Tenant: `COALESCE(public.app_clinic_id(), public._default_clinic_id())`.
- Cursor-based em `sort_at DESC NULLS LAST`.
- `p_limit` clamped `[1, 200]`, default 50.
- `p_before` filtra `v.sort_at < p_before` (null = sem corte).
- Retorna `SETOF public.secretaria_mih_conversations_view`.

GRANT EXECUTE → `authenticated`, `service_role`.

### 2.3 · RPC `public.get_secretaria_mih_health_check()` → `jsonb`

Read-only. Retorna:

- `mih_wa_number_id` (uuid ou null)
- `clinic_id` (uuid)
- `inbox_role_secretaria_total` (int)
- `mih_conversations_total` (int)
- `non_mih_secretaria_conversations_total` (int)
- `messages_24h` (int)
- `conversations_with_messages_24h` (int)
- `view_rows_total` (int)
- `preview_drift_count` (int)
- `max_preview_drift_seconds` (int)
- `verdict` (text)

**Verdicts** (ordem de severidade, primeiro condição satisfeita ganha):

| Verdict | Quando |
|---|---|
| `FAIL_MIH_WA_NUMBER_NOT_FOUND` | wa_numbers sem phone canônico nem label fallback |
| `FAIL_MESSAGES_EXIST_BUT_VIEW_EMPTY` | `messages_24h > 0 AND view_rows_total = 0` (regressão grave) |
| `WARN_SECRETARIA_INBOX_ROLE_HAS_MULTIPLE_CHANNELS` | `non_mih_secretaria_conversations_total > 0` (status atual com Mira) |
| `WARN_PREVIEW_DRIFT` | `preview_drift_count > 0` |
| `PASS_SECRETARIA_MIH_DB_HEALTHY` | nada do acima |

GRANT EXECUTE → `authenticated`, `service_role`.

### 2.4 · Sanity DO block

Aborta apply (`RAISE EXCEPTION`) se:

- View não foi criada.
- Falta `sort_at` / `is_preview_stale` / `preview_drift_seconds` / `latest_message_at_from_messages`.
- RPC `get_secretaria_mih_inbox` não criada.
- RPC `get_secretaria_mih_health_check` não criada.

### 2.5 · `NOTIFY pgrst, 'reload schema'`

---

## 3 · O que NÃO mudou

- `wa_conversations` schema/dados/triggers
- `wa_messages` schema/dados/triggers
- `wa_outbox` (zero toque)
- `agenda_alerts_log` (zero toque)
- `wa_agenda_automations` regras
- `_sync_wa_conversation_preview_v2` (trigger canônico do preview)
- `_agenda_alert_min_before_tick` / `_enqueue_agenda_alert` / `wa_daily_summary`
- `cron.job` (12/71/72 inalterados)
- `_appt_professional_phone`
- TS Lara v2 (zero alteração)
- WhatsApp / Evolution / Secretária (zero envio)

---

## 4 · Por que esta abordagem (decisão Alden)

| Alternativa descartada | Motivo |
|---|---|
| Adicionar coluna `is_secretaria_mih` em `wa_conversations` | DDL em tabela grande · risco de waitlock + backfill obrigatório · escopo aumentaria |
| CHECK constraint forçando `wa_number_id` quando `inbox_role='secretaria'` | Quebra rows legacy com `wa_number_id IS NULL` · requer backfill antes |
| Modificar `wa_conversations_operational_view` existente | View tem 30+ consumidores · mudança ampla · risco de regressão cross-feature |
| Reescrever `listByStatus` TS sem view nova | Já feito no Patch 1 · mas não blinda DB · próxima query ad-hoc volta ao padrão errado |
| Aplicar backfill de `last_message_at` agora | Pedido fora de escopo (Patch 2 separado · esta mig só hardening) |

Estratégia escolhida: **view + RPC novas e isoladas** · zero impacto cross-feature · `sort_at` derivado torna a ordem operacional robusta a drift mesmo sem backfill.

---

## 5 · Como aplicar pós-revisão (Fase 2D.4.2)

```bash
# 1. Comparar def atual (READ-ONLY)
SELECT pg_get_functiondef('public.get_secretaria_mih_inbox(int, timestamptz)'::regprocedure);
SELECT pg_get_functiondef('public.get_secretaria_mih_health_check()'::regprocedure);
SELECT pg_get_viewdef('public.secretaria_mih_conversations_view'::regclass, true);

# 2. Apply via Management API
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000159_clinicai_v2_secretaria_mih_inbox_view_rpc.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000159_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000159
rm -rf supabase/migrations

# 4. Validation
#    scripts/validation/20260800000159_validate_secretaria_mih_inbox_view_rpc.sql

# 5. Health check ad-hoc
#    SELECT public.get_secretaria_mih_health_check();
```

Pós-apply, o frontend pode (Fase 2D.5+) migrar `/api/conversations` e `/api/secretaria/kpis` para consumir `get_secretaria_mih_inbox()` + `get_secretaria_mih_health_check()` em vez de `listByStatus`/`getSecretariaKpiCounts`. Patch 1 fica como redundância TS de defesa em profundidade.

---

## 6 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| View `secretaria_mih_conversations_view` colide com nome existente | Muito baixa | `CREATE OR REPLACE VIEW` · sobrescreve (mesma assinatura) |
| `app_clinic_id()` retorna NULL em chamadas non-JWT (cron) | Tratado | Fallback `_default_clinic_id()` cobre cron / service_role |
| Performance da view em prod | Baixa | LEFT JOIN agregado em `wa_messages` (já indexado em `conversation_id`) · 115 convs Mih · plan eficiente |
| RPC `get_secretaria_mih_inbox` retorna 0 rows em produção | Baixa | Tenant guard via JWT + RLS herdada · valida via VAL-9 antes de wire-up |
| DDL bloqueia em waitlock | Muito baixa | View+RPC novos · sem lock em tabela existente |
| Sanity DO block falha | Muito baixa | Defesa em profundidade · aborta apply |

---

## 7 · Down · DROP ordenado

`.down.sql` executa:

```sql
DROP FUNCTION IF EXISTS public.get_secretaria_mih_health_check();
DROP FUNCTION IF EXISTS public.get_secretaria_mih_inbox(int, timestamptz);
DROP VIEW IF EXISTS public.secretaria_mih_conversations_view;
NOTIFY pgrst, 'reload schema';
```

**Atenção:** se em fase futura o TS já estiver consumindo as RPCs em prod, rolar `.down.sql` quebra esses consumers. Recomendação: forward migration nova com `CREATE OR REPLACE` para versão antiga **ou** desativar feature flag no app **antes** do drop.

Rollback aditivo é seguro porque a mig não toca tabelas/dados/triggers. Só remove os 3 objetos novos.

---

## 8 · Confirmações negativas (estado da prep)

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API mutativa (mig prep)
- ❌ Zero deploy
- ❌ Zero cron change · jobs 12/71/72 inalterados
- ❌ Zero job activation
- ❌ Zero execução de funções mutativas (helpers chamados são read-only — só `pg_get_functiondef` etc nesta fase)
- ❌ Zero `wa_outbox` insert
- ❌ Zero `agenda_alerts_log` insert
- ❌ Zero WhatsApp/Evolution send
- ❌ Zero alteração TS/app code
- ❌ Zero alteração em `_render_appt_template` / `_agenda_alert_min_before_tick` / `_appt_professional_phone` / `wa_daily_summary` / `appt_*` / `wa_agenda_automations`
- ❌ Zero criação de app_user fake / professional_profile fake / lead institucional
- ❌ Zero backfill (`last_message_at` drift residual segue · Patch 2)
- ❌ Zero alteração em triggers SQL existentes (incluindo `_sync_wa_conversation_preview_v2`)
- ❌ Zero ação sobre monitoramento `2986→7773` nesta fase
- ❌ Zero commit em git no momento da escrita (commit apenas após review)
- ❌ Zero secret persistido (mig prep não exigiu Management API)

---

## 9 · Histórico

- **2026-05-11:** Mig 159 PREPARADA via Fase 2D.4 · sem apply.
- **Baseado em:** auditoria de isolamento Secretaria/Mih (`docs/incidents/2026-05-11-secretaria-2986-isolation-audit.md`) + Patch 1 (commit pendente · isolation TS no /api/conversations).
- **Próximo:** review SQL no chat → Fase 2D.4.2 apply controlado → validation → smoke read-only via RPC → wire-up TS opcional (Fase 2D.5+).
