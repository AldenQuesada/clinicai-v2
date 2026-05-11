# 37 · Fase 2C.2 · `payment_status` cortesia · APPLY + VALIDATION · CLOSURE

> Apply controlado da mig 152 v2 em prod (CLINIIC AI v2) + validação no
> chat query a query. **Verdict: `CRM_PHASE_2C2_MIG152_APPLIED_VALIDATED_PASS`** ✅

---

## 1 · Resumo executivo

Mig 152 v2 aplicada com sucesso no banco remoto `oqboitkpcvuaudouwvkl`
via Management API SQL endpoint. Constraint `chk_appt_payment_status`
recriada com o contrato oficial de 5 valores (incluindo `cortesia`).
Tracker registra `20260800000152` como `applied`. COMMENT ON CONSTRAINT
e NOTIFY pgrst executados no mesmo batch.

Drift de governança resolvido: `appointment_finalize` (RPC) aceita
`cortesia` (versionado na mig 151) E `appointments.chk_appt_payment_status`
(constraint) agora também versiona `cortesia` oficialmente (mig 152).

Distribuição operacional intocada · zero DML manual · zero deploy.

---

## 2 · Commit da mig 152 v2

- **Hash:** `d4b7849600674a10f6526c27b665df2529246aba`
- **Mensagem:** `fix(db): normalize payment status cortesia contract migration`
- **Branch:** `main` (== `origin/main` em todas as fases)

Predecessores na linha do tempo:
- `7cc3d46` · `fix(db): version appointment payment status cortesia contract` (v1 · Fase 2C.1 inicial)
- `d4b7849` · `fix(db): normalize payment status cortesia contract migration` (v2 · Fase 2C.1 revisão · removeu guard ILIKE)

---

## 3 · Apply

| Item | Resultado |
|---|---|
| Mecanismo | Management API SQL endpoint (`POST /v1/projects/{ref}/database/query`) |
| Script | `scripts/apply-migration.mjs` (mesmo da mig 086 e mig 151) |
| HTTP status | **201** ✅ |
| Response body | `[]` (DDL retorna array vazio quando OK) |
| Tamanho do SQL aplicado | 3420 chars |
| `COMMENT ON CONSTRAINT chk_appt_payment_status ON public.appointments` | ✅ Executado |
| `NOTIFY pgrst, 'reload schema'` | ✅ Executado (mesmo batch · PostgREST recarrega schema cache) |
| Comportamento real | `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` recreate (constraint pré-existia com cortesia · estado final idêntico, mas agora versionado no repo) |
| Token | Armazenado temporariamente fora do repo · usado via env var inline · deletado após apply · zero log/commit |

---

## 4 · Tracker

| Item | Resultado |
|---|---|
| Marker temporário criado | `supabase/migrations/20260800000152_repair_marker.sql` (vazio · padrão CLI) |
| Comando | `SUPABASE_ACCESS_TOKEN=<env> supabase migration repair --status applied 20260800000152` |
| Output | `Repaired migration history: [20260800000152] => applied` |
| Versão registrada | `20260800000152` |
| Nome no tracker | `repair_marker` |
| Markers removidos pós-repair | ✅ `rm -rf supabase/migrations` |

---

## 5 · Constraint final (pós-apply)

```sql
ALTER TABLE public.appointments
  ADD CONSTRAINT chk_appt_payment_status
  CHECK (
    payment_status = ANY (
      ARRAY[
        'pendente'::text,
        'parcial'::text,
        'pago'::text,
        'cortesia'::text,
        'isento'::text
      ]
    )
  );
```

Valores aceitos: **`pendente | parcial | pago | cortesia | isento`** (exatamente 5).

---

## 6 · Comentário registrado

```sql
COMMENT ON CONSTRAINT chk_appt_payment_status ON public.appointments IS
  'CRM payment status contract: pendente|parcial|pago|cortesia|isento. Cortesia is distinct from isento and is used for complimentary/voucher/partnership appointments.';
```

Distinção operacional `cortesia` vs `isento` documentada inline no schema
(qualquer dev/DBA que inspecionar a tabela via `\d+ appointments` vê o
contexto · sem precisar caçar doc separada).

---

## 7 · Distribuição pós-apply (VAL-2)

| `payment_status` | Total |
|---|---|
| `pago` | 1 |
| `pendente` | 2 |
| outros | 0 |

Snapshot idêntico ao pre-flight · nenhum dado mutado pela mig.

---

## 8 · Valores fora do contrato (VAL-3)

```
0 rows
```

✅ Confirmado: zero linhas com `payment_status` fora do conjunto oficial
de 5 valores.

---

## 9 · Confirmações negativas

- ❌ Zero `supabase db push`
- ❌ Zero `supabase migration up`
- ❌ Zero deploy (não tocou app/Lara/edge functions · apenas constraint do DB)
- ❌ Zero alteração em código TS
- ❌ Zero alteração em `appointment_finalize`
- ❌ Zero alteração em outras RPCs (`lead_lost`/`lead_to_paciente`/`lead_to_orcamento`/`appointment_attend`)
- ❌ Zero backfill
- ❌ Zero DML operacional manual (`appointments`/`leads` intocados · só `ALTER TABLE` DROP/ADD CONSTRAINT)
- ❌ Zero alteração em outras tabelas/colunas

---

## 10 · Conclusão · drift de governança resolvido

Antes desta fase, dois pontos estavam fora do path versionado:

1. **RPC `appointment_finalize`** aceitava `p_payment_status='cortesia'` mas a mig 065 local não registrava esse contrato.
   → **Resolvido na Fase 2B.2 (mig 151 v4 · commit `ebc46fd`)** · RPC versionada com `cortesia` no conjunto válido + branch `outcome='perdido'` adicionado.

2. **Constraint `chk_appt_payment_status`** já permitia `cortesia` no banco real, mas o tracker não tinha statement que provasse onde isso foi versionado.
   → **Resolvido nesta Fase 2C.2 (mig 152 v2 · commit `d4b7849`)** · constraint oficialmente recriada com os 5 valores via `DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT` · COMMENT documenta semântica.

**Estado final:**
- RPC + constraint + repo + tracker **todos alinhados** com o contrato `pendente | parcial | pago | cortesia | isento`.
- UI/TS já aceitavam `cortesia` desde antes (sem mudanças necessárias nesta fase).
- Governança restaurada · ambientes novos (dev/preview) podem ser criados do zero rodando as migs sequencialmente sem perder `cortesia` no contrato.

---

## 11 · Histórico

- **2026-05-11:** Fase 2C.2 executada com autorização explícita de Alden · auto-mode
- **Validation:** 4 SELECTs rodados no Studio query a query · todos PASS
- **Verdict:** `CRM_PHASE_2C2_MIG152_APPLIED_VALIDATED_PASS` ✅
- **HEAD:** `d4b7849600674a10f6526c27b665df2529246aba` == `origin/main` (mig 152 v2 commitada na fase anterior · esta fase só adiciona este doc)
- **Próximo:** sequência do refactor CRM (Fase 2D ou próximo bloco do plano)
