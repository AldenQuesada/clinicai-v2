# CRM_PHASE_2I.1 · Hard Gate Clinical Finalization

> **Data:** 2026-05-12
> **Status:** APPLIED · smoke PASS · UI live · dry-mode (worker 71 OFF)
> **HEAD inicial:** `4e05776` · HEAD final esperado: commit local 2I.1
> **Verdict alvo:** `PASS_CRM_PHASE_2I1_APPLIED_SMOKE_OK_UI_READY_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Transforma o gate clínico de **warning-only** (entregue em 2I) em **regra operacional bloqueante**. `appointment_finalize` agora rejeita finalização quando o status clínico está `warning` (anamnese ≠ complete OU consent ≠ signed). Owner/admin pode usar override com motivo obrigatório, registrado em audit trail.

Entrega vertical:
- Mig 167 aplicada (DROP + CREATE `appointment_finalize` com 2 args novos no fim)
- Nova tabela `appointment_clinical_gate_overrides` (audit · 1 row por override)
- UI FinalizeWizard com bloqueio visual + seção override (só visível para owner/admin)
- Backend Zod + repository + action atualizados
- Smoke transacional PASS (5 testes)
- Worker 71 OFF preservado

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `4e057762bf9677bd8e178f07114bad3a588c7586` |
| Working tree | limpo |
| Migs 160–166 | registradas |
| Mig 166 (gate fn) | aplicada |
| Worker 71 | OFF ✅ |

---

## 3 · Gate WhatsApp banido (preservado)

Esta fase **não toca em envio**. Hard gate é puro state machine + audit. Zero interação com `wa_outbox`, Evolution ou Meta.

---

## 4 · Problema resolvido

**Antes (2I · warning-only):**
- FinalizeWizard mostrava alert amarelo se `gate=warning`
- Mas o botão "Finalizar consulta" continuava clicável
- RPC `appointment_finalize` finalizava sem checar gate
- **Risco LGPD/clínico:** finalizar consulta sem anamnese/consent era possível por descuido

**Depois (2I.1 · hard gate):**
- RPC bloqueia com `clinical_gate_required` se warning AND sem override
- UI bloqueia botão de submit se gate warning AND sem override válido
- Override exige: `is_admin()` no DB + motivo ≥ 5 chars + audit row criada
- Defesa em profundidade: UI bloqueia ANTES do RPC; RPC bloqueia se UI for bypassada

---

## 5 · Contrato hard gate

### 5.1 · RPC `appointment_finalize` (nova assinatura · 11 args)

```
appointment_finalize(
  p_appointment_id uuid,
  p_outcome text,
  p_value numeric DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_lost_reason text DEFAULT NULL,
  p_orcamento_items jsonb DEFAULT NULL,
  p_orcamento_subtotal numeric DEFAULT NULL,
  p_orcamento_discount numeric DEFAULT 0,
  p_clinical_override boolean DEFAULT false,           -- NOVO
  p_clinical_override_reason text DEFAULT NULL          -- NOVO
) RETURNS jsonb
```

**Lógica de gate (entre validações e roteamento por outcome):**

```
gate := appointment_clinical_gate_status(p_appointment_id)

IF gate.gate_status = 'warning':
  IF NOT p_clinical_override:
    RETURN {ok:false, error:'clinical_gate_required', gate:<full>}

  IF length(trim(p_clinical_override_reason)) < 5:
    RETURN {ok:false, error:'override_reason_required'}

  IF NOT is_admin():
    RETURN {ok:false, error:'override_permission_denied'}

  INSERT INTO appointment_clinical_gate_overrides (audit row)

# Procede com roteamento normal por outcome
```

### 5.2 · Erros possíveis (novos)

| Código | Significado |
|---|---|
| `clinical_gate_required` | Gate warning sem override · UI deve mostrar pendências |
| `override_reason_required` | Override solicitado sem reason ≥ 5 chars |
| `override_permission_denied` | Override solicitado mas `is_admin()` retornou false |

Todos os outros erros (invalid_outcome, invalid_status_for_finalize, etc) preservados.

### 5.3 · Backward compatibility

Defaults nos 2 novos parâmetros (`false`/`NULL`) garantem que:
- Caller antigo (sem passar os args novos) → gate é avaliado · se warning, bloqueia · sem override.
- Caller TS atualizado (2I.1) → pode passar `clinicalOverride=true` + reason quando UI permitir.

**Zero quebra** em código TS antigo que ainda não foi atualizado · apenas começa a bloquear casos com gate warning.

---

## 6 · Override admin

### 6.1 · Tabela `appointment_clinical_gate_overrides`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() |
| `clinic_id` | uuid NOT NULL | tenant |
| `appointment_id` | uuid NOT NULL FK | ON DELETE CASCADE |
| `actor_id` | uuid | `auth.uid()` no momento do override |
| `outcome` | text NOT NULL | CHECK in (paciente, orcamento, paciente_orcamento, perdido) |
| `reason` | text NOT NULL | CHECK length >= 5 |
| `gate_status_prev` | text NOT NULL | CHECK in (ok, warning) |
| `gate_details` | jsonb NOT NULL | snapshot do gate completo (anamnese + consent + legacy_consentimento_img) |
| `created_at` | timestamptz | now() |

**RLS:** SELECT same_clinic (authenticated) · INSERT/DELETE só via RPC SECURITY DEFINER · sem UPDATE (audit immutable).

**Indexes:** `(clinic_id, created_at DESC)` + `(appointment_id)`.

### 6.2 · Permissão

Apenas `is_admin()` (= `app_role() IN ('owner','admin')`) pode usar override. Fontes do `app_role()`:
1. `current_setting('app.app_role', true)` GUC (scripts/admin sessions)
2. `auth.jwt() -> 'app_metadata' ->> 'app_role'` (canonical)
3. `auth.jwt() ->> 'app_role'` (legacy)
4. Fallback `'anon'`

UI checa `role` do contexto e só mostra a seção override se `OVERRIDE_ALLOWED_ROLES.has(role)` (owner|admin). DB revalida via `is_admin()` no RPC (defesa em profundidade).

---

## 7 · Banco / RPC · Mig 167 aplicada

- **DROP** `appointment_finalize(uuid, text, numeric, text, text, text, jsonb, numeric, numeric)` (9 args, zero callers internos verificados)
- **CREATE OR REPLACE** com 11 args (+ 2 novos no fim)
- **CREATE** tabela `appointment_clinical_gate_overrides` + indexes + RLS + GRANT
- **Sanity DO block** valida criação e presença dos novos args
- **NOTIFY pgrst, 'reload schema'** final

Tracker: `20260800000167` registrado em `supabase_migrations.schema_migrations`.

---

## 8 · Backend / actions

### 8.1 · Zod schema

[apps/lara/src/app/crm/_schemas/appointment.schemas.ts](../../apps/lara/src/app/crm/_schemas/appointment.schemas.ts) · `FinalizeAppointmentSchema`:
- Novos campos: `clinicalOverride: boolean optional` + `clinicalOverrideReason: string nullable optional`
- Refine: `clinicalOverride=true` exige `clinicalOverrideReason.trim().length >= 5`

### 8.2 · Types

[packages/repositories/src/types/inputs.ts](../../packages/repositories/src/types/inputs.ts) · `AppointmentFinalizeRpcInput` ganhou `clinicalOverride` e `clinicalOverrideReason`.

### 8.3 · Repository

[packages/repositories/src/appointment.repository.ts](../../packages/repositories/src/appointment.repository.ts) · `finalize()` agora passa `p_clinical_override` + `p_clinical_override_reason` para o RPC.

### 8.4 · Action

[apps/lara/src/app/crm/_actions/appointment.actions.ts](../../apps/lara/src/app/crm/_actions/appointment.actions.ts) · `finalizeAppointmentAction` propaga os 2 campos novos para o repository.

---

## 9 · UI

[apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx](../../apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx) · `FinalizeWizard`:

### 9.1 · Bloqueio visual quando gate=warning

Alert **vermelho** no topo do modal com lista de pendências:
- "Anamnese não preenchida (precisa estar completa)"
- "Consentimento informado não registrado"

Mensagem: "Preencha pelo painel clínico acima OU use override admin abaixo".

### 9.2 · Seção override (só visível para owner/admin)

`canOverrideGate` prop calculada no `page.tsx` (server) a partir de `ctx.role`. Se true:
- Checkbox "Finalizar mesmo assim (override admin)"
- Textarea para motivo (rows=2, maxLength=1000)
- Mensagem explicativa: "ciência que anamnese/consent estão pendentes · justificativa obrigatória · ficará no audit"

Se `canOverrideGate=false`: mostra mensagem dizendo que não há permissão e indica preenchimento via painel clínico.

### 9.3 · Botão de submit

`disabled={busy || submitBlocked}` onde:
- `submitBlocked = gateBlocking && !overrideValid`
- `gateBlocking = clinicalGateStatus === 'warning'`
- `overrideValid = overrideRequested && overrideReason.trim().length >= 5`

Label dinâmico:
- "Finalizando…" (busy)
- "Finalizar com override" (gate warning + override válido)
- "Finalizar consulta" (gate ok)

### 9.4 · Reset on close

`useEffect` reseta `overrideRequested` e `overrideReason` quando modal fecha · evita state stale entre sessões.

---

## 10 · Smoke transacional · resultado

```
SMOKE_RESULT_2I1:
  baseline: worker71_off=true, is_admin_check=true (GUC owner)

  TESTE A · warn blocked (sem anamnese/consent · sem override):
    result.ok: false ✅
    result.error: 'clinical_gate_required' ✅
    result.gate.gate_status: 'warning'
    result.hint: 'Preencha anamnese e registre consentimento OU finalize com override admin + motivo'
    appt_status_after: 'em_atendimento' ✅ (não mudou)
    lead_phase_after: 'agendado' ✅ (não promoveu)

  TESTE B · gate ok (anamnesis complete + consent signed):
    result.ok: true ✅
    result.outcome: 'paciente'
    result.patient_call.appointments_remapped: 1 ✅

  TESTE C · override válido (admin + reason >= 5 chars):
    result.ok: true ✅
    result.outcome: 'paciente'
    result.appointment_finalized: true
    override_row_count: 1 ✅
    override_row:
      reason: 'Emergência aprovada pela Dra · audit-2I1'
      outcome: 'paciente'
      actor_id: '33333333-3333-3333-3333-333333333333' (app_user real)
      gate_status_prev: 'warning'

  TESTE D · override sem reason:
    result.ok: false ✅
    result.error: 'override_reason_required'
    result.hint: 'Motivo do override obrigatório (mínimo 5 caracteres)'

  TESTE E · paciente_orcamento (gate ok):
    result.ok: true ✅
    result.outcome: 'paciente_orcamento'
    budget_call.ok: true · orcamento_id criado
    patient_call.ok: true · patient_id criado
    (compatibilidade 2J preservada)

  worker71_off_still: true ✅
  wa_outbox_delta: 0 ✅
```

ROLLBACK forçado via `RAISE EXCEPTION` · zero dado persistente.

[Arquivo smoke](sql/phase-2i1-hard-gate-clinical-finalization-smoke.sql) | [Validation](sql/phase-2i1-hard-gate-clinical-finalization-validation.sql)

---

## 11 · Validation flags esperadas

| Flag | Esperado |
|---|---|
| worker71_off | true |
| override_schema_ready | true |
| finalize_has_override_args | true |
| clinical_gate_fn_ready | true |
| is_admin_ready | true |
| finalize_count | 1 (só nova versão) |
| invalid_override_count | 0 |
| unsafe_outbox_count | 0 |
| tracker_mig_167 | "20260800000167" |
| **can_continue** | **true** |

---

## 12 · Segurança / LGPD

- **RLS multi-tenant** preservado em todas as queries (clinic_id = app_clinic_id()).
- **GRANT mínimo:** authenticated tem SELECT na tabela override · INSERT/DELETE só via RPC SECURITY DEFINER.
- **CHECK constraints** no DB protegem invariantes (reason length, outcome enum, gate_status enum).
- **Audit trail imutável:** sem UPDATE policy na tabela override · `created_at` default + sem coluna de edição.
- **Defesa em profundidade:** UI bloqueia + RPC bloqueia + DB constraint protege · 3 camadas.
- **Override exige role:** owner/admin via `is_admin()` checado dentro do RPC (não confia só na UI).
- **Snapshot do gate** salvo em `gate_details jsonb` no momento do override (forense).
- **Reason mínimo 5 chars** evita auditorias sem justificativa.

---

## 13 · Riscos residuais

1. **`current_setting('app.app_role')` em scripts:** scripts ou cron rodando com GUC `app.app_role` setado a 'owner' poderiam tecnicamente fazer override sem JWT. **Mitigação:** zero scripts/crons atualmente fazem isso · auditar `pg_proc` por SET commands periodicamente.
2. **Service role bypass:** chamadas via service_role no backend bypassam `is_admin()` (RLS desabilitado). **Mitigação:** zero rota atual chama com service_role para finalize · workers off.
3. **Caller TS antigo sem update:** se algum caller ainda existir chamando RPC com 9 args (sem os 2 novos), defaults garantem que gate ainda é avaliado e bloqueia. **Mitigação:** já não existem callers internos (verificado).
4. **Anamnese/consent pré-consulta (sistema legacy `anamnesis_*`)** não conta para o gate · gate só lê `appointment_anamneses` + `appointment_informed_consents` intra-consulta. **Mitigação:** documentado · decisão consciente para evitar acoplamento.

---

## 14 · Rollback

```bash
# 1. DROP da nova versão
SUPABASE_ACCESS_TOKEN=... node scripts/apply-migration.mjs db/migrations/20260800000167_clinicai_v2_hard_gate_clinical_finalization.sql --down

# 2. Remover tracker
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260800000167';

# 3. Re-aplicar versão 2J da appointment_finalize (DDL completa em 67cd50a)
# ou re-apply do clinic-dashboard backup
```

`git revert` do commit local cobre cleanup TS.

---

## 15 · Próxima fase recomendada

Consultar [65-next-prompt-after-2i1.md](65-next-prompt-after-2i1.md):

1. **CRM_PHASE_2L.1** · Ban resolution / Cloud Meta audit (READ-ONLY · paralelizável)
2. **CRM_PHASE_2J.1** · Lead lost dedicado (botão "Marcar como perdido")
3. **CRM_PHASE_2H.1** · Cleanup zumbis status (`em_consulta`/`pre_consulta`)
4. **CRM_PHASE_2AUX** · Modal agendamento completo
5. **CRM_PHASE_2M** · Envio real (BLOQUEADO até 2L.1)
