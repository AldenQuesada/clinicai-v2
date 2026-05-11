# 25 · Migration Block 077-099 · Selective Repair Result

> Registro do `supabase migration repair --status applied` SELETIVO para o bloco 077-099 (22 migrations · pula mig 086). Executado 2026-05-11 com autorização explícita do Alden (Fase 1A.11). Project-ref `oqboitkpcvuaudouwvkl`.

---

## 1 · Resumo executivo

**Resultado:** 22/23 migrations do bloco 077-099 registradas como `applied` no tracker remoto. Mig 086 **EXCLUÍDA** do repair · permanece como ação humana pendente. Gap remoto reduzido de **35 → 13** (redução exata de 22).

| Métrica | Before | After | Delta |
|---|---|---|---|
| Local migrations | 148 | 148 | 0 |
| Remote tracker | 154 | **176** | **+22** |
| Missing remote | 35 | **13** | **−22** |
| Bloco 077-099 (22 versions) no tracker | 0/22 | **22/22** | +22 |
| Mig 086 no tracker | ❌ ausente | ❌ ausente (esperado) | — |

**Missing residual:**
- 12 do bloco 001-012 (seeds Mira/B2B iniciais · próxima fase)
- 1 mig 086 (decisão humana pendente · doc 24 §14)

**Sem db push. Sem migration up. Sem SQL mutativo de schema/dados. Sem deploy.**

---

## 2 · Estado local antes

```
Branch: main
HEAD: d10a78265a1ce7216fb10ffda98205c26c70fd0e
origin/main: d10a78265a1ce7216fb10ffda98205c26c70fd0e  (== HEAD)
Working tree: apenas docs/crm-refactor/24 untracked
```

---

## 3 · Project-ref confirmado

```
$ cat supabase/.temp/project-ref
oqboitkpcvuaudouwvkl
```

---

## 4 · Snapshot tracker antes

```
$ supabase migration list | grep -E "202608000000(7[7-9]|8[0-9]|9[0-9])"
(zero hits · nenhuma do bloco 077-099 registrada)
```

Total remoto antes: 154 versões. Última: `20260800000150` (bloco 140-150 da Fase 1A.5).

---

## 5 · Confirmação · mig 086 NÃO está materializada

Probe SQL READ-ONLY pré-repair:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='wa_messages'
  AND column_name IN ('internal_note', 'delivery_status');

→ 0 rows
```

✅ **Mig 086 NÃO está materializada** · colunas `internal_note` e `delivery_status` em `wa_messages` ausentes. Decisão humana pendente:
- A. Re-aplicar mig 086 (rodar SQL · idempotente)
- B. **Marcar como `reverted` no tracker** (recomendado · alinha tracker à realidade)
- C. Ignorar agora · `db push` futuro tentará (idempotente)

---

## 6 · Comando executado

```bash
# 1. Markers temporários (22 versões · zero mig 086)
mkdir -p supabase/migrations
for v in 20260800000077 20260800000078 20260800000079 20260800000080 \
         20260800000081 20260800000082 20260800000083 20260800000084 \
         20260800000085                20260800000087 20260800000088 \
         20260800000089 20260800000090 20260800000091 20260800000092 \
         20260800000093 20260800000094 20260800000095 20260800000096 \
         20260800000097 20260800000098 20260800000099; do
  : > supabase/migrations/${v}_repair_marker.sql
done

# 2. Repair seletivo
supabase migration repair --status applied \
  20260800000077 20260800000078 20260800000079 20260800000080 \
  20260800000081 20260800000082 20260800000083 20260800000084 \
  20260800000085                20260800000087 20260800000088 \
  20260800000089 20260800000090 20260800000091 20260800000092 \
  20260800000093 20260800000094 20260800000095 20260800000096 \
  20260800000097 20260800000098 20260800000099

# 3. Cleanup
rm -rf supabase/migrations
```

---

## 7 · Output do repair

```
Connecting to remote database...
Repaired migration history: [20260800000077 20260800000078 20260800000079
  20260800000080 20260800000081 20260800000082 20260800000083 20260800000084
  20260800000085 20260800000087 20260800000088 20260800000089 20260800000090
  20260800000091 20260800000092 20260800000093 20260800000094 20260800000095
  20260800000096 20260800000097 20260800000098 20260800000099] => applied
Finished supabase migration repair.
```

✅ Sucesso · 22 versões marcadas como `applied`. **Lista NÃO contém `20260800000086`** ✅.

Markers temporários removidos: `TEMP_MARKERS_REMOVED` confirmado.

---

## 8 · Snapshot tracker depois

22 migrations aparecem com Remote preenchido:

```
20260800000077 .. 20260800000085 (9 versões)
20260800000087 .. 20260800000099 (13 versões)
```

**Mig 086 ausente:** ✅ confirmado · `grep "20260800000086" tracker_after` retornou nada.

---

## 9 · Gap antes vs depois

| Métrica | Before | After |
|---|---|---|
| Local count | 148 | 148 |
| Remote count | 154 | **176** |
| Missing remote count | 35 | **13** |
| Bloco 077-099 (22 versions) | 0/22 | **22/22** |

### Missing remote list (13 versões)

```
20260800000001  (mira_discriminators)
20260800000002  (mira_state)
20260800000003  (b2b_auto_whitelist)
20260800000004  (mira_state_nullable_and_trigger_auth)
20260800000005  (custom_access_token_hook)
20260800000006  (voucher_dispatch_queue)
20260800000007  (lara_voucher_followup)
20260800000008  (voucher_dispatch_queue_idempotency)
20260800000009  (lara_followup_batch_limit)
20260800000010  (mira_state_cleanup_margin)
20260800000011  (webhook_processing_queue)
20260800000012  (voucher_issue_with_dedup)
20260800000086  (wa_messages_internal_note_delivery_status · NOT_FOUND_IN_DB)
```

12 do bloco 001-012 (seeds antigos · próxima fase) + 1 mig 086 (decisão humana).

---

## 10 · Confirmação · mig 086 foi pulada

| Validação | Resultado |
|---|---|
| Lista de versions no comando repair | ✅ NÃO inclui `20260800000086` |
| Output do CLI | ✅ NÃO menciona `20260800000086` em "Repaired migration history" |
| Tracker pós-repair | ✅ `grep "20260800000086"` retorna vazio |
| Missing remote list pós-repair | ✅ `20260800000086` AINDA na lista |
| Markers temporários | ✅ Apenas 22 criados · zero `20260800000086_*` |
| Banco de dados | ✅ Nenhuma alteração de schema · cols `internal_note`/`delivery_status` ainda ausentes |

---

## 11 · Confirmação · zero db push

- ❌ `supabase db push` NÃO foi executado
- ❌ `supabase migration up` NÃO foi executado
- ❌ Nenhum DDL/DML de schema/dados foi executado pelo repair
- ✅ `supabase migration repair --status applied` é operação administrativa do tracker

---

## 12 · Confirmação · zero SQL mutativo de aplicação

Único SQL emitido pelo CLI:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (...) ON CONFLICT (version) DO ...
```

Atua somente sobre `supabase_migrations.schema_migrations` (tracker administrativo).

Estado de tabelas/views/RPCs/triggers/policies/dados: **inalterado**.

---

## 13 · Próxima decisão sobre mig 086

A mig 086 (`wa_messages_internal_note_delivery_status`) permanece em estado divergente:
- Arquivo `.sql` presente no repo
- Banco não tem as colunas
- Tracker não tem a versão registrada

**Decisão humana (Alden) pendente · Fase 1A.11.B:**

### Opção A · Re-aplicar mig 086 (re-rodar SQL)

Apropriado se a feature Sprint C (internal notes + delivery status visual) AINDA está no roadmap.

Comando proposto (NÃO EXECUTADO):
```bash
# Aplicar mig 086 manualmente via SQL READ-WRITE
psql "$SUPABASE_PG_CONN" -f db/migrations/20260800000086_clinicai_v2_wa_messages_internal_note_delivery_status.sql
# Depois:
supabase migration repair --status applied 20260800000086
```

Risco: Adiciona 2 colunas a `wa_messages` · não destrutivo · idempotente. Mas requer runtime do app atualizado para usar.

### Opção B · Marcar como `reverted` (recomendada)

Apropriado se a feature foi cancelada/adiada · banco hoje reflete a decisão.

Comando proposto (NÃO EXECUTADO):
```bash
mkdir -p supabase/migrations
: > supabase/migrations/20260800000086_repair_marker.sql
supabase migration repair --status reverted 20260800000086
rm -rf supabase/migrations
```

Risco: Sinaliza ao CLI que a mig foi explicitamente revertida · futuro `db push` não tenta aplicar.

### Opção C · Ignorar (não recomendado)

Deixar mig 086 pendente eternamente. Próxima vez que alguém rodar `db push` o CLI vai tentar aplicar (idempotente · ADD COLUMN IF NOT EXISTS · OK tecnicamente). Mas o tracker fica em estado ambíguo.

---

## 14 · Próximo bloco recomendado

**Fase 1A.12 · Sanity probes do Bloco 001-012 (12 migs · seeds Mira/B2B iniciais).**

Características:
- 12 migs com DMLs de seed (mira_state, voucher_dispatch_queue, webhook_processing_queue, etc)
- Algumas com mais DML que DDL (config defaults)
- DMLs idempotentes (provavelmente `INSERT ... ON CONFLICT DO NOTHING/UPDATE`)
- Tabelas-alvo já existem (verificado em fases anteriores)

Após Fase 1A.12 (probes) + Fase 1A.13 (repair) o tracker estará 100% alinhado (148/148 + decisão sobre 086).

---

## 15 · Riscos remanescentes

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Bloco 001-012 tem DMLs de seed | Baixa | Probes confirmam seed rows presentes |
| Mig 086 fica pendente indefinidamente | Aceito até decisão Alden | Documentada · Fase 1A.11.B prevista |
| Algum próximo `db push` tenta aplicar 086 | Baixa (tracker já reflete) | Mark `reverted` resolve |
| 41 remotas sem arquivo local (clinic-dashboard legacy) | Aceito · governance | Histórico legado |

---

## 16 · Histórico

- **2026-05-11:** Repair seletivo executado com autorização explícita de Alden (Fase 1A.11)
- **CLI:** `supabase` v2.90.0
- **Latência:** ~5s · 22 versões
- **Falhas:** 0
- **Mig 086 status:** explicitamente pulada · ainda `missing` no tracker · banco sem as colunas
- **Working tree pós-fase:** limpo (docs 24 e 25 untracked · alvo do próximo commit)
