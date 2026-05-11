# 27 · Migration 086 · Apply Result

> Aplicação real da mig 086 (`wa_messages_internal_note_delivery_status`) em produção via Management API SQL endpoint. Executada 2026-05-11 com autorização explícita do Alden (Fase 1A.11.C). Project-ref `oqboitkpcvuaudouwvkl`.

---

## 1 · Resumo executivo

**Resultado:** Mig 086 aplicada com sucesso. 2 colunas + 1 CHECK + 2 indexes parciais criados em `public.wa_messages`. Tracker registra `applied`. Types.ts regenerado. TypeCheck Lara e repositories passaram.

**Gap remoto:** 13 → **12** (apenas bloco 001-012 restante).

| Métrica | Before | After |
|---|---|---|
| Local migrations | 148 | 148 |
| Remote tracker | 176 | **177** |
| Missing remote | 13 | **12** |
| Mig 086 no tracker | ❌ ausente | ✅ applied |
| `wa_messages.internal_note` | ❌ ausente | ✅ boolean NOT NULL DEFAULT false |
| `wa_messages.delivery_status` | ❌ ausente | ✅ text NULL com CHECK |
| Indexes parciais | 0 | 2 |
| `types.ts` inclui cols | ❌ não | ✅ sim |
| Typecheck Lara | OK | ✅ OK |
| Typecheck repositories | OK | ✅ OK |
| wa_messages row count | 2626 | 2626 (preservado) |

Janela de execução: sub-segundo · zero downtime · zero data change.

---

## 2 · Estado local antes

```
Branch: main
HEAD: ab239bd6925675f8755c3dbd3cd8d4d344bcfb55
origin/main: ab239bd6925675f8755c3dbd3cd8d4d344bcfb55  (== HEAD)
Working tree: limpo (apenas docs/crm-refactor/26 untracked)
```

---

## 3 · Project-ref confirmado

`oqboitkpcvuaudouwvkl` ✅

---

## 4 · Snapshot pré-aplicação

```json
{
  "cols": null,                  // 0 colunas (internal_note, delivery_status)
  "check_constraint": null,      // 0 CHECK
  "indexes": null,               // 0 indexes
  "wa_messages_total": 2626      // baseline
}
```

✅ Confirmado: nenhum artefato da mig 086 presente.

---

## 5 · SQL aplicado

Conteúdo da `db/migrations/20260800000086_clinicai_v2_wa_messages_internal_note_delivery_status.sql` (verbatim):

```sql
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS internal_note boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_status text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wa_messages_delivery_status_check'
  ) THEN
    ALTER TABLE public.wa_messages
      ADD CONSTRAINT wa_messages_delivery_status_check
      CHECK (delivery_status IS NULL OR delivery_status IN ('sent', 'delivered', 'read', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS wa_messages_internal_note_idx
  ON public.wa_messages(conversation_id)
  WHERE internal_note = true;

CREATE INDEX IF NOT EXISTS wa_messages_delivery_status_pending_idx
  ON public.wa_messages(conversation_id, sent_at)
  WHERE delivery_status IS NULL OR delivery_status = 'sent';

NOTIFY pgrst, 'reload schema';
```

### Static safety scan pré-aplicação

```
$ rg -n "UPDATE |INSERT INTO|DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN|ALTER TYPE|CREATE TYPE|DROP TYPE|SECURITY DEFINER|GRANT |REVOKE " db/migrations/*000086*.sql
(zero hits)
```

✅ Zero DDL/DML perigosa.

---

## 6 · Output da aplicação

Método: Supabase Management API SQL endpoint (`POST /v1/projects/{ref}/database/query`)

```
=== APPLYING MIG 086 ===
[]
(end)
```

Response `[]` = sucesso (DDL retorna array vazio quando OK; erro retorna `{"message": ...}`).

---

## 7 · NOTIFY pgrst reload

Incluído no próprio SQL da migration:

```sql
NOTIFY pgrst, 'reload schema';
```

Executado como parte do batch · PostgREST cache invalidado.

---

## 8 · Snapshot pós-aplicação

```json
{
  "cols": [
    {"column_name":"delivery_status","data_type":"text","is_nullable":"YES","column_default":null},
    {"column_name":"internal_note","data_type":"boolean","is_nullable":"NO","column_default":"false"}
  ],
  "check_constraint": [{
    "conname":"wa_messages_delivery_status_check",
    "definition":"CHECK (((delivery_status IS NULL) OR (delivery_status = ANY (ARRAY['sent','delivered','read','failed']))))"
  }],
  "indexes": [
    {"indexname":"wa_messages_delivery_status_pending_idx","indexdef":"CREATE INDEX ... ON public.wa_messages USING btree (conversation_id, sent_at) WHERE ((delivery_status IS NULL) OR (delivery_status = 'sent'::text))"},
    {"indexname":"wa_messages_internal_note_idx","indexdef":"CREATE INDEX ... ON public.wa_messages USING btree (conversation_id) WHERE (internal_note = true)"}
  ],
  "wa_messages_total": 2626
}
```

✅ **2 cols + 1 CHECK + 2 indexes presentes · count preservado.**

### Distribution check (sanity)

```json
{"total":2626, "internal_note_true":0, "delivery_status_filled":0}
```

✅ Defaults aplicados corretamente (internal_note=false default · delivery_status=null default).

---

## 9 · Repair do tracker

```
$ supabase migration repair --status applied 20260800000086
Connecting to remote database...
Repaired migration history: [20260800000086] => applied
Finished supabase migration repair.
```

✅ Mig 086 registrada como `applied` no `supabase_migrations.schema_migrations`.

Validação:
```
$ supabase migration list | grep "20260800000086"
         | 20260800000086 | 20260800000086
```

Markers temporários removidos: `TEMP_MARKERS_REMOVED` confirmado.

---

## 10 · Types regenerados

Comando: `pnpm db:types` (usa `scripts/generate-types.mjs` · Management API `/v1/projects/{ref}/types/typescript`).

```
→ Buscando types de oqboitkpcvuaudouwvkl...
✅ Salvo em packages/supabase/src/types.ts
   Tamanho: 613.7 KB
```

Validação no novo `types.ts`:
```
$ rg -n "internal_note|delivery_status" packages/supabase/src/types.ts
14138:          delivery_status: string | null
14142:          internal_note: boolean
14167:          delivery_status?: string | null
14171:          internal_note?: boolean
14196:          delivery_status?: string | null
14200:          internal_note?: boolean
```

✅ 6 hits (Row/Insert/Update × 2 cols) · cols agora tipadas em TypeScript.

git diff stat:
```
packages/supabase/src/types.ts | 1219 ++++++++++++++++++++ (1200 inserts · 19 deletes)
```

---

## 11 · Typecheck

| Pacote | Resultado |
|---|---|
| `@clinicai/lara` (`pnpm --filter @clinicai/lara run typecheck`) | ✅ PASS (tsc --noEmit · zero erros) |
| `@clinicai/repositories` (`pnpm --filter @clinicai/repositories run typecheck`) | ✅ PASS |

Confirma que o código que usa `internalNote` / `deliveryStatus` (em `apps/lara/src/`, `packages/repositories/src/`) agora compila contra types atualizados sem warnings.

---

## 12 · Confirmações

- ✅ Zero `supabase db push`
- ✅ Zero `supabase migration up`
- ✅ Zero SQL fora da mig 086 (Management API SQL recebeu apenas o conteúdo do `.sql` da 086)
- ✅ Zero DDL/DML em outras tabelas
- ✅ Zero deploy (não tocou app/Lara · apenas DB schema + types regen)
- ✅ Código funcional inalterado (apenas `types.ts` auto-gerado)
- ✅ Markers temporários removidos
- ✅ Nenhuma outra migration aplicada/reparada nesta fase

---

## 13 · Gap antes vs depois

| Métrica | Before (Fase 1A.11) | After (Fase 1A.11.C) |
|---|---|---|
| Local | 148 | 148 |
| Remote | 176 | **177** |
| Missing | 13 | **12** |
| 086 status | ❌ NOT_FOUND_IN_DB | ✅ MATERIALIZED + REPAIRED |

Missing residual = 12 versões do bloco 001-012 (seeds Mira/B2B iniciais).

---

## 14 · Próximo passo recomendado

**Fase 1A.12 · Sanity probes do Bloco 001-012 (12 migs · último bloco).**

Características:
- 12 migs com DMLs de seed (mira_state, voucher_dispatch_queue, webhook_processing_queue, etc · ver doc 17)
- Algumas com mais DML que DDL (config defaults)
- Tabelas-alvo já existem (verificado em fases anteriores)

Plano:
1. Listar arquivos 001-012
2. Static scan
3. Probes:
   - Tabelas: `mira_state`, `voucher_dispatch_queue`, `webhook_processing_queue`, `b2b_auto_whitelist_phones`, etc
   - Functions/triggers
   - Seed rows
4. Mapear status por mig
5. Recomendar estratégia

Após Fase 1A.12 (probes) + 1A.13 (repair), tracker fica 100% alinhado (148/148).
