# BACKEND_SQL_GUARD_PENDING_PROMPT_4

**Status:** PENDING · runtime já bloqueado · SQL nível pendente
**Patch:** CRM_PARITY_PATCH_0C_FINALIZE_BACKEND_GUARD (2026-05-17)
**Branch:** `crm/parity-patch-agenda-finalization`

## Regra arquitetural

> `appointment_finalize` SÓ aceita 3 outcomes clínicos:
> `paciente | orcamento | paciente_orcamento`
>
> Perda comercial NÃO nasce da finalização de consulta. Perda passa
> SOMENTE por `lead_lost(reason)` RPC dedicado (chamado pelo
> `LeadLostModal` / `markLeadLostAction`).

## Estado atual após Patch 0C

### ✅ Camada app/runtime (bloqueada)

- `packages/repositories/src/types/enums.ts:123` · `AppointmentFinalizeOutcome` TypeScript union restrita a 3 outcomes (sem `'perdido'`)
- `packages/repositories/src/types/inputs.ts:239` · `AppointmentFinalizeRpcInput.outcome` usa o tipo restrito · TS bloqueia
- `packages/repositories/src/appointment.repository.ts:382-398` · `finalize()` tem runtime guard defensivo que retorna `error='invalid_outcome'` se outcome === `'perdido'`
- `apps/lara/src/app/crm/_schemas/appointment.schemas.ts:53` · Zod enum `AppointmentFinalizeOutcome` restrito a 3 outcomes · `safeParse` falha se `'perdido'` chegar
- `apps/lara/src/app/crm/_actions/appointment.actions.ts:482` · type retorno restrito a 3 outcomes
- `apps/lara/src/app/crm/_actions/appointment.actions.ts:489-499` · guard defensivo no início da action

### ⚠️ Camada SQL/RPC (pendente)

A RPC `public.appointment_finalize()` no banco prod (`oqboitkpcvuaudouwvkl`) ainda aceita `p_outcome='perdido'` por compatibilidade com a mig **20260800000151_clinicai_v2_appointment_finalize_lost_outcome.sql** (DRIFT correction documentada).

Isso significa que **callers que bypassem TS+Zod** (psql direto, edge functions, supabase.rpc com cast `any`, integração externa) ainda conseguem chamar `appointment_finalize(p_outcome:='perdido', p_lost_reason:='X')` e obter o comportamento legacy.

## Por que não criar a migration neste patch

1. **Tamanho** · a RPC `appointment_finalize` da mig 151 tem ~400 linhas (state machine, validações, sub-RPC calls). Criar a migration de guard exige copiar literal o corpo + adicionar `RAISE EXCEPTION` no topo. Stub não é seguro pra aplicar em prod sem revisão manual.
2. **Risco operacional** · `CREATE OR REPLACE FUNCTION` substitui a função inteira. Qualquer divergência entre o corpo copiado e o estado real em prod (ex: hotfix aplicado direto via Studio) causa regressão.
3. **Política do prompt 0C** · "Se não for seguro mexer em SQL agora · documentar `BACKEND_SQL_GUARD_PENDING_PROMPT_4` · mas app/runtime deve bloquear desde já." (CRM_PARITY_PATCH_0C_FINALIZE_BACKEND_GUARD spec).

## Plano de aplicação SQL (Prompt 4 · DEPLOY)

Quando o Alden der GO pra Prompt 4 (`CRM_DEPLOY_RELEASE`):

1. **Buscar definição atual da RPC em prod:**
   ```sql
   SELECT pg_get_functiondef(
     'public.appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric)'::regprocedure
   );
   ```

2. **Criar nova migration `20260700000878_appointment_finalize_block_perdido.sql`** com:
   - `CREATE OR REPLACE FUNCTION public.appointment_finalize(...)` com a mesma assinatura
   - Corpo: literalmente o output do `pg_get_functiondef` acima
   - Adicionar **no topo do corpo** (logo após `BEGIN`):
     ```sql
     IF p_outcome = 'perdido' THEN
       RAISE EXCEPTION
         'appointment_finalize does not accept perdido; use lead_lost(reason)'
         USING HINT = 'Perda comercial passa por public.lead_lost · path dedicado',
               ERRCODE = '22023';
     END IF;
     ```
   - **NÃO** alterar o restante do corpo (lógica de roteamento por outcome, validações, sub-RPC calls)

3. **Smoke validation pós-apply (sem mutar dados):**
   ```sql
   -- Deve falhar com ERRCODE 22023:
   SELECT public.appointment_finalize(
     p_appointment_id := '00000000-0000-0000-0000-000000000000'::uuid,
     p_outcome := 'perdido',
     p_lost_reason := 'smoke test'
   );

   -- Outros outcomes seguem normalmente (caller passa appointment real):
   -- SELECT public.appointment_finalize(p_outcome := 'paciente', ...) → ok=false 'appointment_not_found' (não 'invalid_outcome')
   ```

4. **Rollback:** re-aplicar mig 151 (sem o guard).

## Risco residual sem migration SQL

| Quem pode bypassar? | Como? | Mitigação atual |
|---|---|---|
| Frontend Next.js | Impossível (TS + Zod + guards) | ✅ bloqueado em 5 camadas |
| Server actions | Impossível (TS + Zod + guards na action) | ✅ bloqueado |
| Edge functions Supabase | Possível (chamada SQL direta) | ⚠️ pendente |
| psql/Studio manual | Possível (chamada SQL direta) | ⚠️ pendente |
| Integrações externas via PostgREST | Possível (POST /rpc/appointment_finalize com body `{"p_outcome": "perdido"}`) | ⚠️ pendente |

**Recomendação:** aplicar guard SQL no Prompt 4 antes de deploy de produção pra fechar o caminho de bypass via PostgREST/Studio.

## Decisão pendente para Alden

- [ ] Aplicar guard SQL no Prompt 4 (recomendado)
- [ ] OU manter porta aberta no SQL como compat (decisão produto · documentar formalmente)
- [ ] OU revisar a mig 151 e remover o branch `'perdido'` da RPC original (rollback completo da DRIFT correction · ainda mais invasivo)
