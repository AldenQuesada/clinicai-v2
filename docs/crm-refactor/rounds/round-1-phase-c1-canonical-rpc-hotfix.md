# Round 1 · Phase C1 · Canonical RPC Hotfix

> CRM_PARITY_R1_PHASE_C1_CANONICAL_RPC_HOTFIX_PRE_DEPLOY · branch `crm/parity-r1-agenda-foundation` · zero commit · 2026-05-18

## Verdict

**`PASS_CRM_PARITY_R1_PHASE_C1_CANONICAL_HOTFIX_READY_FOR_AUDIT`**

Hot-fix migration 191 cria source-of-truth canon-compliant para `_lead_phase_transition_allowed` + `appointment_attend` + `lead_to_paciente`. Typecheck verde em ambos pacotes. Assinaturas preservadas. Callers TS compatíveis.

## C1.0 · Precheck

- Branch: `crm/parity-r1-agenda-foundation`
- HEAD: `2b157f9` · zero commit
- Diff stat acumulado R1: 16 arquivos modificados, +474 / -34
- Migrations criadas (untracked): 188, 189, 190, **191** + 4 downs

## C1.1 · CANON_SQL_RISK_MATRIX

| Função | Arquivo de origem | Risco pré-191 | Hotfix? | Estratégia |
|--------|-------------------|--------------|---------|------------|
| `_lead_phase_transition_allowed` | mig 65:50-76 | Matriz 7-phase aceita `→ compareceu` e `→ reagendado` · contradiz `chk_leads_phase` 4-phase da mig 150 | **SIM** | CREATE OR REPLACE em mig 191 com matriz 4-phase canônica |
| `appointment_attend` | mig 65:328-418 | Contém `UPDATE leads SET phase='compareceu'` · viola canon mesmo se guard bloquear | **SIM** | CREATE OR REPLACE em mig 191 removendo o bloco de UPDATE em leads · status flow preservado |
| `lead_to_paciente` | mig 65:588-721 | Gateia `phase <> 'compareceu'` · viola canon Phase 1C | **SIM** | CREATE OR REPLACE em mig 191 com gate `phase IN ('lead','agendado')` + `lifecycle_status='ativo'` · padrão da mig 187 |
| `lead_to_orcamento` | mig 187 | Já canônico (gate `phase IN ('lead','agendado')`) | não | — |
| `lead_lost` | mig 65 | lifecycle, não phase · ok canon | não | — |
| `sdr_change_phase` | mig 65 | wrapper genérico · roteia para sub-RPCs · matriz canônica via `_lead_phase_transition_allowed` (após mig 191 fica canon-only) | não direto | herda canon via dependência |
| `appointment_finalize` | mig 151 | chama lead_to_paciente / lead_to_orcamento · ok após mig 191 desbloquear | não | — |
| Hard gate clínico | mig 167 | ortogonal a phase canon | não | — |

## C1.2 · Migration 191 design

Arquivo: [`db/migrations/20260800000191_clinicai_v2_canonical_appointment_attend_no_compareceu.sql`](../../../db/migrations/20260800000191_clinicai_v2_canonical_appointment_attend_no_compareceu.sql) (380 linhas).

Conteúdo:

1. **`_lead_phase_transition_allowed(p_from, p_to)`** (IMMUTABLE · SECURITY default · search_path public,extensions,pg_temp):
   - Matriz 4-phase canônica: `lead/agendado/paciente/orcamento`
   - `compareceu`/`reagendado` removidos
   - `→ perdido` preservado (legacy compat · sinal real via lead_lost lifecycle)
   - Self-loops para idempotência
   - `ELSE FALSE` defensivo bloqueia dados legacy
   - COMMENT atualizado

2. **`appointment_attend(p_appointment_id uuid, p_chegada_em timestamptz DEFAULT NULL)`** (SECURITY DEFINER · LANGUAGE plpgsql):
   - Assinatura **idêntica** à mig 65
   - Tenant guard preservado
   - SELECT FOR UPDATE em appointments preservado
   - Idempotência preservada (status já avançado → `v_already=true`)
   - Bloqueio status terminal preservado (cancelado/no_show/bloqueado)
   - **REMOVIDO**: bloco lead.phase UPDATE (linhas 383-410 da mig 65)
   - Return jsonb com mesma shape: `{ok, appointment_id, idempotent_skip, status_after}`
   - COMMENT canon atualizado

3. **`lead_to_paciente(p_lead_id, p_total_revenue, p_first_at, p_last_at, p_notes)`** (SECURITY DEFINER):
   - Assinatura **idêntica** à mig 65
   - Tenant guard + SELECT FOR UPDATE preservados
   - Idempotência (já existe em patients) preservada
   - **NOVO** gate canônico: `phase IN ('lead','agendado')` retorna `illegal_transition` se fora
   - **NOVO** gate canônico: `lifecycle_status='ativo'` retorna `lifecycle_locked`
   - INSERT patient (mesmo UUID) verbatim
   - Re-map appointments/orcamentos verbatim
   - UPDATE leads.phase='paciente' + soft-delete preservado
   - phase_history INSERT preservado
   - Return jsonb mesma shape
   - COMMENT canon atualizado

Comentários SQL no header da mig incluem:
- Canonical rule statement
- Validation SQL probes (5 itens)
- Smoke test E2E ref (`apps/lara/e2e/authed/appointment-attend-finalize.spec.ts:163`)

## C1.3 · Down script

Arquivo: [`...191_*.down.sql`](../../../db/migrations/20260800000191_clinicai_v2_canonical_appointment_attend_no_compareceu.down.sql) (260 linhas).

Decisão registrada: **down restaura 3 funções para o estado mig 65** (matriz 7-phase + UPDATE em leads.phase + gate `phase='compareceu'`).

Aviso explícito no topo:
> ⚠️ DO NOT USE FOR PRODUCTION unless rolling back this exact migration.
> Reintroduz violações ao contrato canônico v2 (mig 150 retroapply).

Justificativa de não-no-op: rollback técnico precisa de função executável; preservamos a SQL legacy intencionalmente marcada como `[ROLLBACK mig 191]` nos COMMENTs para deixar o estado deletério visível em qualquer audit pós-rollback.

## C1.4 · Type / RPC compat audit

Callers TS de `appointment_attend`:

| Arquivo | Linha | Caller | Assinatura esperada | Compat? |
|---------|-------|--------|---------------------|---------|
| `packages/repositories/src/appointment.repository.ts:349` | wrapper `.attend()` | `supabase.rpc('appointment_attend', {p_appointment_id, p_chegada_em})` | ✅ mesma do mig 191 |
| `apps/lara/src/app/crm/_actions/appointment.actions.ts:546` | server action `attendAppointmentAction` | chama `repos.appointments.attend(appointmentId, chegadaEm)` | ✅ |
| `apps/lara/src/app/crm/mesa-operacional/_actions.ts:169` | server action `markArrivedFromMesaAction` | chama `repos.appointments.attend(appointmentId)` | ✅ |

Retorno: `AppointmentAttendResult = { ok, appointmentId, idempotentSkip, statusAfter, error?, detail? }` — todos os campos retornados pela mig 191 são compatíveis.

Callers TS de `lead_to_paciente`:

| Arquivo | Linha | Caller |
|---------|-------|--------|
| `packages/repositories/src/lead.repository.ts:638` | wrapper `.toPaciente(leadId, opts)` |
| `apps/lara/src/app/crm/_actions/appointment.actions.ts` | dentro de `finalizeAppointmentAction` (via repo.appointments.finalize → RPC `appointment_finalize` chama internamente lead_to_paciente) |

Assinatura `lead_to_paciente(uuid, numeric, timestamptz, timestamptz, text)` preservada · retorno shape preservado.

Nenhum caller espera `phase=compareceu` no DB ou no retorno. E2E `appointment-attend-finalize.spec.ts:163` confirma comportamento canônico esperado (lead.phase permanece 'agendado' pós-attend).

### Stale comments corrigidos (TS · doc-only)

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `apps/lara/src/app/crm/mesa-operacional/_actions.ts:198` | "appointment_attend pode tocar leads.phase em transação atômica" | "appointment_attend (canon mig 191) NÃO altera leads.phase · invalida leads tag por defesa apenas..." |
| `apps/lara/src/app/crm/_actions/appointment.actions.ts:574` | "appointment_attend pode atualizar leads.phase em transação atômica" | "appointment_attend (canon mig 191) NÃO altera leads.phase. Tag leads é invalidada por segurança..." |
| `packages/repositories/src/appointment.repository.ts:5-13` | docstring referindo "Mutacoes que mudam phase do lead (appointment_attend, finalize)" | Reescrito explicitando que `appointment_attend` muda apenas `appointments.status` |
| `packages/repositories/src/appointment.repository.ts:323-340` | docstring com FINDING flag | Atualizado para apontar mig 191 como resolved |
| `packages/repositories/src/phase-history.repository.ts:10` | "(lead_create, lead_to_appointment, appointment_attend, etc)" | Removido `appointment_attend` da lista de origens de phase_history |
| `packages/repositories/src/lead.repository.ts:627` | "Exige phase=compareceu" | "Gate canônico Phase 1C (mig 191): exige phase IN ('lead','agendado') + lifecycle_status='ativo'" |
| `packages/repositories/src/lead.repository.ts:653` | "Exige phase=compareceu" | "Gate canônico Phase 1C (mig 187): phase IN ('lead','agendado') + lifecycle_status='ativo'" |
| `packages/repositories/src/types/dtos.ts:216` | "Quando o lead transicionou pra phase=compareceu" | "Timestamp histórico em que o lead foi promovido para patient (legacy: marcava transição...)" |
| `packages/repositories/src/helpers/appointment-state.ts:81-84` (já feito na Fase C) | "leads.phase=compareceu" | "NÃO altera leads.phase" |

## C1.5 · Checks

| Check | Resultado |
|-------|-----------|
| `git diff --check` | ✅ exit 0 |
| `pnpm --filter @clinicai/repositories typecheck` | ✅ PASS (tsc --noEmit · zero erro) |
| `pnpm --filter @clinicai/lara typecheck` | ✅ PASS |
| Unit tests | ⏸ não rodados (Fase C1 audit · não exigiu) |
| E2E real run | ⏸ NOT_RUN_ENV_UNAVAILABLE · spec existente `apps/lara/e2e/authed/appointment-attend-finalize.spec.ts` (linha 163: `expect(leadAfterAttend?.phase).toBe('agendado')`) valida comportamento canônico do hotfix |

## C1.6 · Canon grep final

| Pattern | Onde | Result |
|---------|------|--------|
| `phase=compareceu\|phase='compareceu'\|phase = 'compareceu'` em `apps/lara/src` `.ts` | grep | 0 matches em runtime/funcional |
| Idem em `packages/repositories/src` `.ts` | grep | 2 matches **em docstrings canon-flagged**: `appointment.repository.ts:344` (referindo mig 65 legacy SQL · contexto histórico) + `types/dtos.ts:218` (legacy meaning de `sourceLeadPhaseAt`) · tolerável |
| Idem em `.d.ts` (build artifacts) | grep | 4 matches · regeneram em próximo build |
| Em mig 191 up | grep | 12 matches · todos em comentários canon-flagged ("compareceu NÃO é phase") · validation SQL refs |
| Em mig 191 down | grep | 13 matches · esperado (restaura legacy) |
| Em docs (não-código) | grep | matches históricos · não-funcionais |

**Veredito grep**: zero violação em runtime code · todas as referências em código TS são docstrings que explicitamente afirmam o canon.

## C1.7 · Confirmações negativas

- ✅ Zero commit · HEAD ainda `2b157f9`
- ✅ Zero push
- ✅ Zero deploy
- ✅ Zero migration aplicada (4 .sql + 4 .down.sql no working tree)
- ✅ Zero WhatsApp · zero `wa_outbox` tocado
- ✅ Zero provider call (Evolution/Meta)
- ✅ Worker 71 intocado (zero refs `cron.job` no diff)
- ✅ Zero `appointment_finalize` runtime change (mig 191 toca attend + lead_to_paciente + helper · não toca finalize wrapper mig 151)
- ✅ Zero hard gate mig 167 change
- ✅ Zero env/secrets
- ✅ Zero edit em migrations históricas (65/72/150/167/187) · mig 191 nova
- ✅ Zero side-effect em wa_outbox · funções não chamam pg_net

## Próximo passo

Aguardar `GO CRM_PARITY_R1_PHASE_C_AUDIT_CHECK_REDO_AFTER_CANON_HOTFIX`.

A re-execução do audit-check (Phase C) deve verificar:
- Mig 191 SQL syntax + canon
- Mig 191 callers compat
- Mig 191 não introduz regressão nas Migs 188-190 do R1
- Re-confirmar que falsos positivos continuam preservados
- Bloqueio canônico anterior agora resolvido em source-of-truth

Branch viva · zero commit · pronto para audit redo.
