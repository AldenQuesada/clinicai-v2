# Fase 2D.4 · DB hardening Secretaria Mih (2986) · PREP

> Preparação da mig 159 aditiva. **NÃO APLICADA.** Apply controlado fica para
> Fase 2D.4.2 após review do SQL no chat. Sem backfill, sem alteração de
> trigger, sem mexer em outbox.

---

## 1 · Resumo executivo

Patch 1 (commit pendente) corrige no código TS o escopo da query `/secretaria` (`listByStatus` ganha `waNumberId`). Esta fase 2D.4 **blinda o DB** contra regressão criando 3 objetos canônicos:

1. View `public.secretaria_mih_conversations_view` · escopo HARDCODED no canal Mih (`phone=5544991622986`).
2. RPC `public.get_secretaria_mih_inbox(p_limit int, p_before timestamptz)` · cursor inbox listing com `sort_at` robusto a drift.
3. RPC `public.get_secretaria_mih_health_check()` → `jsonb` · read-only · monitoramento.

**Princípio:** `inbox_role='secretaria'` NÃO é identidade de canal (4 canais carregam esse role). `wa_number_id` É. Esta migration cria a única fonte da verdade no banco · próximas queries do app passam por aqui.

**Sem apply nesta fase. Sem SQL mutativo no banco. Sem deploy. Sem alteração TS. Sem backfill.**

---

## 2 · Mudanças na mig 159

### 2.1 · VIEW `public.secretaria_mih_conversations_view`

| Coluna derivada | Fórmula |
|---|---|
| `latest_message_at_from_messages` | `max(wa_messages.sent_at)` per conversation (ignora `deleted_at`) |
| `sort_at` | `GREATEST(c.last_message_at, max msg, c.updated_at)` |
| `is_preview_stale` | `max msg > c.last_message_at + 60s` |
| `preview_drift_seconds` | `EXTRACT(EPOCH FROM (max msg - c.last_message_at))::int` |

Demais colunas: cópia de `wa_conversations` (id, clinic_id, wa_number_id, phone, display_name, lead_id, status, inbox_role, unread_count, last_message_at, last_message_text, last_lead_msg, last_inbound_time, ai_enabled, ai_paused_until, assigned_to, assigned_at, created_at, updated_at).

JOIN com `wa_numbers` hardcoded em `phone='5544991622986' AND is_active=true`. Auto-scope multi-tenant por clinic via JOIN composto `(mih.id, mih.clinic_id) = (c.wa_number_id, c.clinic_id)`.

### 2.2 · RPC `get_secretaria_mih_inbox(p_limit, p_before)`

- `SECURITY DEFINER` · `search_path` blindado.
- Tenant: `COALESCE(public.app_clinic_id(), public._default_clinic_id())`.
- Order: `sort_at DESC NULLS LAST`.
- Limit: clamp `[1, 200]`, default 50.
- Cursor: `v.sort_at < p_before` (NULL = sem corte).
- Retorna `SETOF public.secretaria_mih_conversations_view`.

### 2.3 · RPC `get_secretaria_mih_health_check()` → `jsonb`

| Campo | Tipo | Significado |
|---|---|---|
| `mih_wa_number_id` | uuid | id resolvido (phone ou label) |
| `clinic_id` | uuid | tenant resolvido |
| `inbox_role_secretaria_total` | int | conversas active/paused com `inbox_role='secretaria'` (cross-canal) |
| `mih_conversations_total` | int | conversas active/paused do canal Mih |
| `non_mih_secretaria_conversations_total` | int | `inbox_role_total - mih_total` |
| `messages_24h` | int | `wa_messages` last 24h escopo Mih |
| `conversations_with_messages_24h` | int | distinct conv com msg últ 24h |
| `view_rows_total` | int | rows na view (sanity) |
| `preview_drift_count` | int | rows com `is_preview_stale=true` |
| `max_preview_drift_seconds` | int | maior drift atual |
| `verdict` | text | 1 de 5 categorias |

**Verdicts** (ordem de severidade · primeiro condition match ganha):

| Verdict | Quando | Severidade |
|---|---|---|
| `FAIL_MIH_WA_NUMBER_NOT_FOUND` | sem phone canônico nem label fallback | 🔴 |
| `FAIL_MESSAGES_EXIST_BUT_VIEW_EMPTY` | `messages_24h > 0` mas view vazia | 🔴 |
| `WARN_SECRETARIA_INBOX_ROLE_HAS_MULTIPLE_CHANNELS` | `non_mih_secretaria > 0` (status atual) | 🟠 |
| `WARN_PREVIEW_DRIFT` | drift > 0 (status atual provável) | 🟡 |
| `PASS_SECRETARIA_MIH_DB_HEALTHY` | nada acima | 🟢 |

### 2.4 · Sanity DO block

Verifica existência da view + colunas derivadas + ambas RPCs antes de COMMIT. `RAISE EXCEPTION` aborta apply.

### 2.5 · `NOTIFY pgrst, 'reload schema'`

---

## 3 · Resumo técnico (decisão Alden)

- **`wa_number_id` é identidade de canal**, não `inbox_role` solto.
- View hardcoded em `phone='5544991622986'` · resolve em ≤2 lookups por refresh.
- `sort_at` derivado dá ordem robusta sem precisar de backfill imediato do `last_message_at`.
- Apenas DDL aditiva · zero alteração em tabelas/triggers/dados existentes.
- RPC com `app_clinic_id()` cobre JWT requests · fallback `_default_clinic_id()` cobre cron/service_role.
- GRANT minimalista: `authenticated` + `service_role` apenas.

---

## 4 · Arquivos criados (working tree · sem commit no momento da escrita)

| Arquivo | Tipo |
|---|---|
| [db/migrations/20260800000159_clinicai_v2_secretaria_mih_inbox_view_rpc.sql](../../db/migrations/20260800000159_clinicai_v2_secretaria_mih_inbox_view_rpc.sql) | Forward (view + 2 RPCs + sanity DO + NOTIFY) |
| [db/migrations/20260800000159_clinicai_v2_secretaria_mih_inbox_view_rpc.down.sql](../../db/migrations/20260800000159_clinicai_v2_secretaria_mih_inbox_view_rpc.down.sql) | Down DROP ordenado |
| [docs/database/rollback-notes/20260800000159_clinicai_v2_secretaria_mih_inbox_view_rpc.md](../database/rollback-notes/20260800000159_clinicai_v2_secretaria_mih_inbox_view_rpc.md) | Rollback note |
| [scripts/validation/20260800000159_validate_secretaria_mih_inbox_view_rpc.sql](../../scripts/validation/20260800000159_validate_secretaria_mih_inbox_view_rpc.sql) | 15 VALs read-only |
| Este doc | Prep |

---

## 5 · Static safety scan

| Padrão | Hits esperados |
|---|---|
| `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` / `DELETE FROM` | 0 |
| `UPDATE cron.job` / `cron.schedule` / `cron.unschedule` | 0 |
| `UPDATE public.*` (qualquer tabela existente) | 0 |
| `INSERT INTO` em qualquer tabela | 0 |
| `CREATE OR REPLACE VIEW public.secretaria_mih_conversations_view` | 1 |
| `CREATE OR REPLACE FUNCTION public.get_secretaria_mih_inbox` | 1 |
| `CREATE OR REPLACE FUNCTION public.get_secretaria_mih_health_check` | 1 |
| `GRANT ... TO authenticated` | 3 |
| `GRANT ... TO service_role` | 3 |
| Sanity DO block | 1 |

---

## 6 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Nome `secretaria_mih_conversations_view` já existe | Muito baixa | `CREATE OR REPLACE` sobrescreve · mesma assinatura |
| `app_clinic_id()` retorna NULL fora de JWT | Tratado | Fallback `_default_clinic_id()` |
| Performance da view (LEFT JOIN agregado em wa_messages) | Baixa | `conversation_id` indexado · 115 convs · plan eficiente |
| RPC retorna 0 em produção (bug de tenant) | Baixa | VAL-9 testa antes de wire-up |
| DDL bloqueia em waitlock | Muito baixa | Objetos novos · sem lock em tabela existente |
| Sanity DO block falha | Muito baixa | Defesa em profundidade · aborta apply |

---

## 7 · Como aplicar pós-revisão (Fase 2D.4.2)

```bash
# 1. Pré-flight (READ-ONLY)
SELECT pg_get_viewdef('public.secretaria_mih_conversations_view'::regclass, true);  -- esperado: não existe ainda
SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_secretaria_mih_health_check');  -- false

# 2. Apply
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

---

## 8 · Confirmações negativas

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
- ❌ Zero alteração TS/app code (este patch é só DB · Patch 1 TS já está pronto · commit pendente)
- ❌ Zero alteração em `wa_conversations` schema/dados
- ❌ Zero alteração em `wa_messages` schema/dados
- ❌ Zero alteração em `wa_outbox` schema/dados
- ❌ Zero alteração em triggers SQL existentes
- ❌ Zero alteração em `wa_agenda_automations` regras
- ❌ Zero backfill de `last_message_at` drift residual
- ❌ Zero criação de mensagem fake / lead institucional / fake row
- ❌ Zero ação sobre monitoramento `2986→7773` nesta fase
- ❌ Zero alteração Mira / vouchers / B2B
- ❌ Zero secret persistido

---

## 9 · Histórico

- **2026-05-11:** Fase 2D.4 entrega 5 artefatos prontos para review · sem apply.
- **Baseado em:** auditoria de isolamento Secretaria/Mih (`docs/incidents/2026-05-11-secretaria-2986-isolation-audit.md`) + Patch 1 TS (commit pendente).
- **Próximo:** review SQL no chat → Fase 2D.4.2 apply controlado → validation → health check ad-hoc → wire-up TS opcional (Fase 2D.5+).
