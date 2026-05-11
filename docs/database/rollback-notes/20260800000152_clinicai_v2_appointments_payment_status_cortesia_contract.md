# Rollback Note · Mig 152 · `appointments.payment_status` contract com `cortesia`

**Migration:** `20260800000152_clinicai_v2_appointments_payment_status_cortesia_contract.sql`
**Tipo:** Governança · idempotente · forward-only
**Data alvo de apply:** TBD (Fase 2C.2 · controlado · review prévio do SQL)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Versionar o contrato real de `appointments.payment_status` que inclui
o valor `'cortesia'`. Sem essa migration o repo é fonte da verdade
INCOMPLETA · ambientes novos (dev/preview) seriam criados com constraint
restritiva e RPCs/UI quebrariam ao tentar usar `cortesia`.

---

## 2 · Diagnóstico do drift

Pre-flight no banco real (CLINIIC AI v2) revelou:

| Item | Esperado pelo repo (mig 062) | Estado real no banco |
|---|---|---|
| RPC `appointment_finalize` aceita `cortesia` | Não documentado | ✅ Aceita (verificado via apply mig 151 v4) |
| Constraint `chk_appt_payment_status` inclui `cortesia` | Não definido | ✅ Inclui (verificado via `pg_get_constraintdef`) |
| Tracker registra mig que adicionou `cortesia` | Nenhuma | ❌ Sem registro (alteração fora do path versionado · provavelmente via Studio) |

Dados atuais (snapshot): `pago=1`, `pendente=2`, zero valores fora do contrato.

---

## 3 · Por que `cortesia` deve existir no banco

A clínica usa o status `cortesia` para appointments cuja consulta foi:

- Oferecida como brinde / experiência (B2B partnership recipient ou VPI referral)
- Cortesia institucional (paciente convidado, mídia, profissional parceiro)
- Sessão promocional sem valor monetário recebido nem isenção fiscal

Sem `cortesia` no contrato, o operador é forçado a:
- Usar `pago` com `value=0` (distorce receita e LTV)
- Usar `isento` (falso · isento é categoria fiscal/contratual diferente)
- Não finalizar o appointment (acumula appointments em `na_clinica`/`em_atendimento` indefinidamente)

---

## 4 · Diferença operacional entre `cortesia` e `isento`

| Aspecto | `cortesia` | `isento` |
|---|---|---|
| Origem | Decisão comercial / brinde institucional | Categoria contratual prévia (B2B fechado, sócio) |
| Valor | Geralmente `value=0` mas pode ter `value` simbólico (custo de insumo) | Sempre `value=0` por contrato |
| Receita reportada | Soma como receita "brindada" em relatórios | Não soma em receita |
| Usado em campanhas | Sim · pode virar gatilho de cross-sell | Não · paciente já fechado contratualmente |
| Tratamento Lara | Próximo follow-up oferece serviços relacionados | Próximo follow-up checa renovação de contrato |

---

## 5 · Por que a migration é idempotente

```sql
DO $$
DECLARE v_constraint_def text;
BEGIN
  -- 1. Abort se valor fora do contrato existe (defensivo).
  IF EXISTS (...) THEN RAISE EXCEPTION ...;

  -- 2. Lê constraint atual.
  SELECT pg_get_constraintdef(...) INTO v_constraint_def ...;

  -- 3. Se já inclui todos os valores finais, RETURN (no-op).
  IF v_constraint_def ILIKE '%cortesia%' AND ... THEN
    RAISE NOTICE 'already satisfied'; RETURN;
  END IF;

  -- 4. Caso contrário, DROP IF EXISTS + ADD CONSTRAINT.
  ALTER TABLE ... DROP CONSTRAINT IF EXISTS ...;
  ALTER TABLE ... ADD CONSTRAINT ...;
END $$;
```

Resultados possíveis:

| Ambiente | Constraint pré-apply | Comportamento |
|---|---|---|
| Prod CLINIIC AI v2 (atual) | já tem cortesia | NOTICE + no-op (RETURN no passo 3) |
| Dev/preview sem ajuste manual | não tem cortesia | DROP + ADD recreate (passo 4) |
| Ambiente com valor inválido em prod | qualquer | EXCEPTION (passo 1 · força revisão humana) |

---

## 6 · Por que aborta se houver valor fora do contrato

Garantia defensiva: `DROP CONSTRAINT IF EXISTS` seguido de `ADD CONSTRAINT`
falharia silenciosamente em qualquer linha que já tenha um valor inválido
(o ADD bate na linha existente). Em vez de propagar erro genérico do
Postgres, a mig 152 detecta antes e levanta `EXCEPTION` com mensagem clara
para que o operador faça correção/backfill humano antes do retry.

Hoje em prod o snapshot é limpo (`pago=1, pendente=2`), mas o guard
protege contra estados futuros desconhecidos (e.g. dev branches que
mexeram em dados de teste).

---

## 7 · Down NO-OP defensivo

`20260800000152_*.down.sql` é apenas `RAISE NOTICE`. Rollback exige
forward migration nova (`mig 153`) porque:

- Remover `cortesia` da constraint quebraria operação real (RPC
  `appointment_finalize` aceita e a UI usa)
- Dropar a constraint inteira removeria proteção contra valores inválidos
- Não há versão anterior canônica para "restaurar"

---

## 8 · Como aplicar pós-revisão (Fase 2C.2 · NÃO executar agora)

```bash
# 1. Comparar constraint atual (READ-ONLY)
SELECT pg_get_constraintdef(c.oid)
FROM pg_constraint c
WHERE c.conrelid='public.appointments'::regclass
  AND c.conname='chk_appt_payment_status';

# 2. Apply via Management API
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000152_clinicai_v2_appointments_payment_status_cortesia_contract.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000152_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000152
rm -rf supabase/migrations

# 4. Validation SQL (SELECT-only)
#    docs/crm-refactor/sql/phase-2c-payment-status-cortesia-post-apply-validation.sql

# 5. Smoke (opcional · não destrutivo)
#    Tentar INSERT/UPDATE com payment_status='cortesia' em appt teste
#    e payment_status='invalid_xxx' (deve falhar pelo CHECK).
```

Esperado em prod CLINIIC AI v2: `NOTICE: chk_appt_payment_status already
includes cortesia; contract already satisfied` (no-op idempotente).
Esperado em dev/preview limpo: `NOTICE: chk_appt_payment_status updated
to include cortesia`.

---

## 9 · Validação pós-apply

Ver `docs/crm-refactor/sql/phase-2c-payment-status-cortesia-post-apply-validation.sql`:

1. `pg_get_constraintdef` da `chk_appt_payment_status` · deve listar 5 valores
2. Distribuição `payment_status` agrupada · sanity de dados
3. Contagem de valores fora do contrato · deve ser 0
4. Tracker · `version=20260800000152` registrada

---

## 10 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Dado fora do contrato aparece entre prep e apply | Muito baixa | Guard `RAISE EXCEPTION` aborta antes do DROP CONSTRAINT |
| Constraint diferente do esperado (drift de nome) | Muito baixa | `DROP CONSTRAINT IF EXISTS` + ADD recreate · operação atômica em transação |
| Constraint hipotética em outras tabelas com mesmo nome | Muito baixa | `conrelid='public.appointments'::regclass` qualifica |
| Quebra de RPCs/aplicações ao perder grant | Nenhuma | Mig não toca GRANTs · apenas constraint |
| NOTIFY pgrst falhar | Nenhuma | NOTIFY é fire-and-forget · não bloqueia transação |

---

## 11 · Confirmações negativas (estado da prep)

- ❌ Zero apply no banco
- ❌ Zero SQL mutativo executado
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API call
- ❌ Zero deploy
- ❌ Zero alteração em `appointment_finalize` ou outras RPCs
- ❌ Zero DML em `appointments`
- ❌ Zero backfill
- ❌ Zero alteração em TS

---

## 12 · Histórico

- **2026-05-11:** Mig 152 PREPARADA via Fase 2C.1 (sem apply)
- **Diagnóstico:** drift entre constraint real do banco e ausência de migration versionada (alteração fora do path)
- **Próximo:** revisão SQL no chat → Fase 2C.2 apply controlado → validation
