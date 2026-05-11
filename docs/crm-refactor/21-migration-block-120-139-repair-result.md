# 21 · Migration Block 120-139 · Repair Result

> Registro do `supabase migration repair --status applied` para o bloco 120-139. Executado 2026-05-11 com autorização explícita do Alden (Fase 1A.7). Project-ref `oqboitkpcvuaudouwvkl`.

---

## 1 · Resumo executivo

**Resultado:** 20/20 migrations do bloco 120-139 registradas como `applied` no tracker remoto Supabase. Gap remoto reduzido de **75 → 55** (redução exata de 20 conforme esperado).

| Métrica | Before | After | Delta |
|---|---|---|---|
| Local migrations | 148 | 148 | 0 |
| Remote tracker | 114 | **134** | **+20** |
| Missing remote | 75 | **55** | **−20** |
| Bloco 120-139 no tracker | 0/20 | **20/20** | +20 |

**Sem db push. Sem migration up. Sem SQL mutativo de schema/dados. Sem deploy. Apenas registros administrativos no tracker.**

**Confirmação especial · mig 127 (`wa_identity_architecture` · 7 DMLs · backfill identity):** verificada como totalmente materializada antes do repair (doc 20 §8). 360 rows · timestamp único · zero duplicatas · zero conflitos. Repair aplicou sem disparar reexecução de DML.

---

## 2 · Estado local antes

```
Branch: main
HEAD: 2c89401119ee249bfe2165b0d62e5231c2bb87aa
origin/main: 2c89401119ee249bfe2165b0d62e5231c2bb87aa   (== HEAD)
Working tree: limpo (apenas docs/crm-refactor/20 untracked)
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
$ supabase migration list | grep -E "20260800000(12[0-9]|13[0-9])"
(zero hits · nenhuma do bloco 120-139 registrada)
```

Total remoto antes: 114 versões. Última: `20260800000150` (do bloco 140-150 reparado na Fase 1A.5).

---

## 5 · Comando executado

```bash
# 1. Markers temporários (scaffolding · não-commitado · removido após repair)
mkdir -p supabase/migrations
for v in 20260800000120 20260800000121 20260800000122 20260800000123 \
         20260800000124 20260800000125 20260800000126 20260800000127 \
         20260800000128 20260800000129 20260800000130 20260800000131 \
         20260800000132 20260800000133 20260800000134 20260800000135 \
         20260800000136 20260800000137 20260800000138 20260800000139; do
  : > supabase/migrations/${v}_repair_marker.sql
done

# 2. Repair (apenas tracker · zero SQL executado)
supabase migration repair --status applied \
  20260800000120 20260800000121 20260800000122 20260800000123 \
  20260800000124 20260800000125 20260800000126 20260800000127 \
  20260800000128 20260800000129 20260800000130 20260800000131 \
  20260800000132 20260800000133 20260800000134 20260800000135 \
  20260800000136 20260800000137 20260800000138 20260800000139

# 3. Cleanup
rm -rf supabase/migrations
```

---

## 6 · Output do repair

```
Connecting to remote database...
Repaired migration history: [20260800000120 20260800000121 20260800000122
  20260800000123 20260800000124 20260800000125 20260800000126 20260800000127
  20260800000128 20260800000129 20260800000130 20260800000131 20260800000132
  20260800000133 20260800000134 20260800000135 20260800000136 20260800000137
  20260800000138 20260800000139] => applied
Finished supabase migration repair.
Run supabase migration list to show the updated migration history.
```

✅ Sucesso · 20 versões marcadas como `applied`.

Markers temporários removidos: `TEMP_MARKERS_REMOVED` confirmado · `supabase/migrations/` não existe mais.

---

## 7 · Snapshot tracker depois

```
$ supabase migration list | grep -E "20260800000(12[0-9]|13[0-9])"
         | 20260800000120 | 20260800000120
         | 20260800000121 | 20260800000121
         | 20260800000122 | 20260800000122
         | 20260800000123 | 20260800000123
         | 20260800000124 | 20260800000124
         | 20260800000125 | 20260800000125
         | 20260800000126 | 20260800000126
         | 20260800000127 | 20260800000127
         | 20260800000128 | 20260800000128
         | 20260800000129 | 20260800000129
         | 20260800000130 | 20260800000130
         | 20260800000131 | 20260800000131
         | 20260800000132 | 20260800000132
         | 20260800000133 | 20260800000133
         | 20260800000134 | 20260800000134
         | 20260800000135 | 20260800000135
         | 20260800000136 | 20260800000136
         | 20260800000137 | 20260800000137
         | 20260800000138 | 20260800000138
         | 20260800000139 | 20260800000139
```

✅ Todas as 20 com **Remote + Time preenchidos** · column `Local` vazia.

**Por que `Local` está vazia?** O CLI `supabase migration list` procura migrations em `supabase/migrations/` (default path). Como o repo usa `db/migrations/`, a coluna `Local` fica vazia para TODAS as migrations (não só 120-139 · também 140-150 e os blocos anteriores reparados). É um falso negativo do CLI · não problema de repair.

A coluna `Remote` é a verdade do tracker · todas as 20 estão lá ✅.

---

## 8 · Gap antes vs depois

| Métrica | Before | After |
|---|---|---|
| Local count | 148 | 148 |
| Remote count | 114 | **134** |
| Missing remote count | 75 | **55** |
| Bloco 120-139 missing | 20 | **0** |

Validação:
```
$ grep -E "20260800000(12[0-9]|13[0-9])" missing_remote_after_repair.txt
(none · bloco 120-139 não está mais faltando)
```

---

## 9 · Confirmação · zero db push

- ❌ `supabase db push` **NÃO** foi executado
- ❌ `supabase migration up` **NÃO** foi executado
- ❌ Nenhum DDL/DML de schema ou dados foi executado pelo repair
- ✅ `supabase migration repair --status applied` é operação **administrativa**: marca a versão como já aplicada no tracker (`supabase_migrations.schema_migrations`) sem executar o SQL da migration
- ✅ Estado de tabelas, colunas, views, RPCs, triggers, policies, índices, dados de aplicação: **inalterado**

---

## 10 · Confirmação · zero SQL mutativo

O único SQL emitido pelo CLI durante o repair é a operação interna:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES (...)
ON CONFLICT (version) DO ...
```

Esse INSERT atua **somente sobre a tabela administrativa do próprio tracker** · não toca em nenhuma tabela de schema/dados da aplicação.

---

## 11 · Confirmação especial · mig 127

A mig 127 (`wa_identity_architecture`) foi a maior preocupação do bloco · 7 DMLs · backfill identity.

Probes pré-repair (doc 20 §8) confirmaram:

| Aspecto | Estado |
|---|---|
| Tabela `wa_contact_identities` | ✅ existe · 19 colunas |
| Tabela sidecar `wa_identity_conflicts` | ✅ existe · 16 colunas · 0 conflitos |
| Rows totais | 360 |
| Rows com `lead_id` | 354 (98.3%) |
| Rows com `conversation_id` | 360 (100%) |
| Rows ativos (não soft-deleted) | 349 |
| Timestamp único de backfill | 2026-05-05 13:52:27.947441+00 |
| Tipos de identity (5 phone variants + lid) | ✅ todos presentes (62 contacts × 5 + 50 LIDs = 360) |
| Source prefix `backfill_secretaria_bh.*` | ✅ confirma origem mig 127 |
| Duplicatas (clinic_id, identity_type, identity_value_norm) | **0** |
| Constraint `uq_wa_contact_identities_strong` | ✅ ativa |
| 7 indexes inclusive `idx_wa_contact_identities_weak_lookup` | ✅ presentes |
| Function `_wa_identity_norm` | ✅ existe |

**Veredito:** mig 127 estava 100% materializada antes do repair. Repair foi apenas registro · zero risco de reexecução de DML.

---

## 12 · Próximo bloco recomendado

**Fase 1A.8 · Sanity probes do Bloco 100-119 (20 migs · CRM canonical + LGPD media).**

Atenção especial:
- **Mig 110 `lgpd_media_path_migration`** · 9 DMLs · backfill paths em storage paths
- **Mig 103 `align_phase_status_checks`** · já documentada (CHECK constraints v2) · doc 13 confirma
- **Mig 109 `drop_legacy_phone_unique`** · cuidado com idempotência de DROP CONSTRAINT
- **Mig 104 `fix_vpi_zombie_triggers`** · DROP TABLE + 1 DML

Plano:
1. Listar arquivos 100-119
2. Static summary por mig
3. Probes:
   - Storage paths backfill (mig 110): contar rows com path no formato `<clinic_id>/...`
   - CHECK constraints CRM v2 (mig 103): re-confirmar com probe D doc 13
   - Tabelas e indexes do bloco
   - Triggers VPI
   - Conversation tables (mig 100-102)
4. Mapear status por mig
5. Recomendar estratégia

**Alternativa:** seguir para Bloco 077-099 (23 migs · RLS endurecimento + cleanup) primeiro. Tem mais drops (mig 093-095) mas zero DMLs significativas.

**Recomendo Bloco 100-119** porque ele contém mig 103 que já é parte da arquitetura CRM (alinhada com o foco da refatoração). Mig 110 LGPD é a única preocupação real · probes podem confirmá-la em ~10min.

---

## 13 · Riscos remanescentes

| Risco | Probabilidade | Mitigação |
|---|---|---|
| 55 migrations ainda faltando no tracker | Certeza · estado conhecido | Repair por blocos · fases 1A.8+ |
| Mig 110 (lgpd_media_path · 9 DMLs) materialização parcial | Baixa-Média | Probe em fase 1A.8 |
| Mig 095 (drop_unused_zero_byte_tables · 23 DROPs) repair sem objetos visíveis | Baixa | Drops são one-way · idempotência via IF EXISTS provável |
| Mig 099 (recreate_dropped_tables) reverte cascade · pode confundir | Baixa | Probe sobre tabelas restauradas em fase 1A.10 |
| `supabase db push` futuro tenta rodar versões já materializadas | Mitigada | Repair correto · tracker reflete realidade |
| 41 remotas sem arquivo local (clinic-dashboard legacy) | Aceito · governance | Histórico legado · não bloqueia |

---

## 14 · Histórico

- **2026-05-11:** Repair executado com autorização explícita de Alden (mensagem citada no prompt da Fase 1A.7)
- **CLI usado:** `supabase` v2.90.0 (v2.98.2 disponível · não-bloqueante)
- **Latência total:** ~5 segundos (1 chamada API por versão · 20 versões)
- **Falhas:** 0
- **Markers temporários:** 20 criados + removidos · nunca commitados
- **Working tree pós-fase:** limpo (exceto docs 20 e 21 untracked · alvo do próximo commit)
