# 36 · Fase 2C.1 · `payment_status` cortesia contract · PREP (sem apply)

> Preparação da migration 152 idempotente que versiona o contrato real de
> `appointments.payment_status` (5 valores incluindo `cortesia`). **NÃO
> APLICADA.** Apply controlado fica para Fase 2C.2 após revisão de SQL no
> chat.

---

## 1 · Resumo executivo

Achado residual pós-mig 151: a RPC `appointment_finalize` aceita
`p_payment_status='cortesia'` (verificado via `pg_get_functiondef` antes do
apply da v4). Pre-flight no banco real confirmou que a constraint
`chk_appt_payment_status` ATUAL também já permite `cortesia`. Mas o
tracker de migrações **não registra** nenhum statement que tenha adicionado
esse valor · alteração foi feita fora do path versionado.

Esta fase entrega:
1. Mig 152 idempotente (DO block · não recria se já satisfeita · ABORT se houver dado inválido)
2. Down NO-OP defensivo
3. Rollback note
4. SQL de validação pós-apply (SELECT-only)
5. Este doc

**Sem apply. Sem SQL mutativo. Sem deploy. Sem alteração TS.**

---

## 2 · Evidências do chat (pre-flight)

### 2.1 · RPC `appointment_finalize` aceita `cortesia`

Validação 1:1 da v4 (Fase 2B.1 · commit `ebc46fd`):

```sql
IF p_payment_status IS NOT NULL
   AND p_payment_status NOT IN ('pendente','parcial','pago','cortesia','isento')
THEN
  RETURN jsonb_build_object('ok', false, 'error', 'invalid_payment_status', 'got', p_payment_status);
END IF;
```

Aplicada em prod via mig 151 v4 (Fase 2B.2 · HTTP 201 confirmado).

### 2.2 · Constraint atual já aceita `cortesia`

Probe `pg_get_constraintdef(c.oid)` em `chk_appt_payment_status`:

```
CHECK (payment_status = ANY (ARRAY['pendente'::text, 'parcial'::text, 'pago'::text, 'cortesia'::text, 'isento'::text]))
```

(Trecho · output completo capturado no chat durante pre-flight.)

### 2.3 · Tracker não registra origem

```
SELECT * FROM supabase_migrations.schema_migrations
WHERE statements ILIKE '%cortesia%' OR statements ILIKE '%payment_status%';
→ 0 rows (statements null/0 em entries antigas · 20260800000151 sem cortesia)
```

→ Confirmado: alteração da constraint para incluir `cortesia` foi feita
fora do path versionado (provavelmente via Studio em algum ponto entre
mig 062 e hoje).

### 2.4 · Distribuição atual de dados

| `payment_status` | Total |
|---|---|
| `pago` | 1 |
| `pendente` | 2 |
| outros | 0 |

→ Zero linhas com valor fora do contrato final. Mig 152 vai rodar
limpo (RETURN no passo 3 · idempotência).

---

## 3 · Escopo da mig 152

### Faz

- DO block que:
  1. Aborta com `EXCEPTION` se houver linha com `payment_status` fora do contrato final
  2. Lê `pg_get_constraintdef` da `chk_appt_payment_status`
  3. Se já contém `pendente|parcial|pago|cortesia|isento` → `RAISE NOTICE` + `RETURN` (no-op)
  4. Caso contrário → `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` com os 5 valores
- `COMMENT ON CONSTRAINT` documentando o contrato
- `NOTIFY pgrst, 'reload schema'`

### Não faz

- ❌ Não toca `appointment_finalize` ou outras RPCs
- ❌ Não faz UPDATE/INSERT/DELETE em `appointments` (zero DML)
- ❌ Não toca GRANT/REVOKE (constraint não tem grant)
- ❌ Não toca outras tabelas/colunas
- ❌ Não faz backfill

---

## 4 · SQL esperado (resumo · ver arquivo completo)

```sql
BEGIN;

DO $$
DECLARE v_constraint_def text;
BEGIN
  -- 1. Abort defensivo
  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE payment_status IS NOT NULL
      AND payment_status NOT IN ('pendente','parcial','pago','cortesia','isento')
  ) THEN
    RAISE EXCEPTION 'appointments.payment_status contains values outside final contract';
  END IF;

  -- 2. Ler constraint atual
  SELECT pg_get_constraintdef(c.oid) INTO v_constraint_def
    FROM pg_constraint c
   WHERE c.conrelid='public.appointments'::regclass
     AND c.conname='chk_appt_payment_status';

  -- 3. Idempotência
  IF v_constraint_def IS NOT NULL
     AND v_constraint_def ILIKE '%pendente%'
     AND v_constraint_def ILIKE '%parcial%'
     AND v_constraint_def ILIKE '%pago%'
     AND v_constraint_def ILIKE '%cortesia%'
     AND v_constraint_def ILIKE '%isento%'
  THEN
    RAISE NOTICE 'chk_appt_payment_status already includes cortesia; contract already satisfied';
    RETURN;
  END IF;

  -- 4. DROP + ADD recreate
  ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS chk_appt_payment_status;
  ALTER TABLE public.appointments
    ADD CONSTRAINT chk_appt_payment_status
    CHECK (payment_status = ANY (ARRAY['pendente'::text,'parcial'::text,'pago'::text,'cortesia'::text,'isento'::text]));

  RAISE NOTICE 'chk_appt_payment_status updated to include cortesia';
END $$;

COMMENT ON CONSTRAINT chk_appt_payment_status ON public.appointments IS
  'CRM payment status contract: pendente|parcial|pago|cortesia|isento. Cortesia is distinct from isento and is used for complimentary/voucher/partnership appointments.';

NOTIFY pgrst, 'reload schema';

COMMIT;
```

---

## 5 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Constraint diverge entre ambientes (prod = ok, dev = sem cortesia) | Aceito · esperado | Mig 152 trata os dois casos (RETURN no-op vs DROP+ADD) |
| Dado inválido entre prep e apply | Muito baixa | Guard `RAISE EXCEPTION` aborta antes do DROP CONSTRAINT |
| Outro nome de constraint protegendo payment_status | Muito baixa | Verificável via probe `WHERE conname ILIKE '%payment_status%'` antes do apply |
| Conflito com COMMENT existente | Nenhuma | `COMMENT ON CONSTRAINT` sobrescreve idempotente |

---

## 6 · Confirmação · não houve apply

- ❌ Zero `supabase db push`
- ❌ Zero `supabase migration up`
- ❌ Zero `supabase migration repair`
- ❌ Zero Management API call
- ❌ Zero SQL mutativo executado em qualquer ambiente
- ❌ Zero deploy
- ❌ Zero alteração em código TS
- ❌ Zero DML em `appointments`

---

## 7 · Próximo passo

**Fase 2C.2 · apply controlado:**

1. Review do SQL acima no chat (comparar com `pg_get_constraintdef` real)
2. Apply via `scripts/apply-migration.mjs` + Management API
3. Repair tracker (`supabase migration repair --status applied 20260800000152`)
4. Rodar validation SQL (`docs/crm-refactor/sql/phase-2c-payment-status-cortesia-post-apply-validation.sql`)
5. Confirmar `NOTICE: ... already satisfied` (esperado em prod)

---

## 8 · Histórico

- **2026-05-11:** Fase 2C.1 entrega 5 artefatos prontos para review · zero apply
- **Diagnóstico:** drift entre constraint real do banco (já tinha cortesia) e ausência de versionamento no tracker
- **Próximo:** Fase 2C.2 (apply + repair + validation)
