# CRM_PHASE_2J · Enterprise Appointment Finalization

> **Data:** 2026-05-12
> **Status:** DELIVERED · smoke PASS · UI live · dry-mode (worker 71 OFF)
> **HEAD inicial:** `afafc37` · HEAD final esperado: commit local 2J
> **Verdict alvo:** `PASS_CRM_PHASE_2J_ENTERPRISE_FINALIZATION_READY_LOCAL_COMMIT`

---

## 1 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `afafc37c1f94ce2e9445922e9c4064471f5d7b27` |
| Working tree | limpo |
| Migs 160–163 | registradas |
| RPCs `appointment_finalize`, `lead_to_paciente`, `lead_to_orcamento`, `lead_lost` | todas presentes |
| `crm_operational_view` | existe |
| `phase_history` | existe |
| Worker 71 | OFF ✅ (gate inegociável) |

---

## 2 · Gate WhatsApp banido (preservado)

Esta fase **não toca em envio** · nenhum branch da finalização toca em `wa_outbox`, Evolution ou Meta. Lead de paciente_orcamento dispara só os sub-RPCs internos (`lead_to_orcamento` + `lead_to_paciente`).

Doc canônico: [45-phase-2l-whatsapp-real-send-ban-gate.md](45-phase-2l-whatsapp-real-send-ban-gate.md).

---

## 3 · Contrato de finalização (RPC `appointment_finalize`)

### 3.1 · Outcomes aceitos no DB

| Outcome | UI oferece? | Sub-RPC | Comportamento |
|---|---|---|---|
| `paciente` | ✅ Sim | `lead_to_paciente` | Lead vira paciente (idempotente · `appointments_remapped`) |
| `orcamento` | ✅ Sim | `lead_to_orcamento` | Cria orcamento (status=`draft`) · phase→`orcamento` |
| `paciente_orcamento` | ✅ Sim (NOVO) | `lead_to_orcamento` THEN `lead_to_paciente` | Sequencial atômico · cria orçamento + promove a paciente |
| `perdido` | ❌ Não | `lead_lost` | Reservado para path dedicado (fora do FinalizeWizard) |

### 3.2 · Validações do RPC (todas presentes)

- Tenant guard `app_clinic_id()` JWT
- Outcome no whitelist
- `lost_reason` obrigatório quando outcome=`perdido`
- `payment_status` no whitelist quando informado
- `orcamento_subtotal` ≥ 0 + `items` array + `discount` ≥ 0 quando outcome em (`orcamento`, `paciente_orcamento`)
- Lock pessimista (FOR UPDATE)
- Idempotência: appointment `finalizado` retorna ok-noop
- Status válido: `na_clinica` ou `em_atendimento` (rejeita `agendado`, `aguardando_confirmacao`, `confirmado`, `aguardando`, terminais)
- Appointment sem `lead_id` (paciente recorrente): bloqueia `orcamento`/`paciente_orcamento`/`perdido` · permite `paciente` (só finaliza appt sem promover lead)

### 3.3 · Ordem de execução em `paciente_orcamento`

```
1. Validate inputs
2. lead_to_orcamento → orcamento_id (status draft)
   ↳ falha aqui → appt NÃO finaliza · erro budget_creation_failed
3. lead_to_paciente → patient_id
   ↳ falha aqui → appt NÃO finaliza · erro patient_conversion_failed_after_budget
4. UPDATE appointments SET status='finalizado'
```

**Garantia:** appt só finaliza se AMBOS sub-RPCs retornarem `ok=true`. Orçamento já criado em caso de falha do paciente fica órfão de phase mas presente.

---

## 4 · Decisão: zero migration

**Mig 165 NÃO foi criada.** Banco já tinha:
- 4 outcomes válidos em `appointment_finalize`
- `paciente_orcamento` branch sequencial implementado
- Validação completa (lost_reason, orcamento payload, payment_status)
- Tenant guard, lock, idempotência

Apenas TS + UI precisavam de alinhamento.

---

## 5 · Backend / actions

### 5.1 · Enum TS atualizado

[packages/repositories/src/types/enums.ts](../../packages/repositories/src/types/enums.ts):

```ts
export type AppointmentFinalizeOutcome =
  | 'paciente'
  | 'orcamento'
  | 'paciente_orcamento'  // NOVO · alinha com DB
  | 'perdido'
```

### 5.2 · Zod schema alinhado

[apps/lara/src/app/crm/_schemas/appointment.schemas.ts](../../apps/lara/src/app/crm/_schemas/appointment.schemas.ts):
- `AppointmentFinalizeOutcome` enum inclui `paciente_orcamento`
- Refine `orcamentoItems` + `orcamentoSubtotal` obrigatórios para AMBOS `orcamento` e `paciente_orcamento`

### 5.3 · Action: cache tags

[apps/lara/src/app/crm/_actions/appointment.actions.ts](../../apps/lara/src/app/crm/_actions/appointment.actions.ts) · `finalizeAppointmentAction`:
- Tipo de retorno inclui `paciente_orcamento`
- Invalida `CRM_TAGS.patients` quando outcome ∈ (`paciente`, `paciente_orcamento`)
- Invalida `CRM_TAGS.orcamentos` quando outcome ∈ (`orcamento`, `paciente_orcamento`)
- Sempre invalida `appointments`, `leads`, `phase_history`

---

## 6 · UI entregue

[apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx](../../apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx) · `FinalizeWizard`:

### 6.1 · Outcomes oferecidos

```
Virou paciente            · promove lead
Gerou orçamento           · cria proposta
Paciente + orçamento      · vira paciente E gera proposta  ← NOVO
```

**`perdido` foi REMOVIDO da UI** conforme MEGA PROMPT 2J. Capability permanece no DB (`appointment_finalize` aceita) mas path operacional dedicado fica reservado para futuro botão "Marcar como perdido" no card do lead (via `lead_lost` direto).

### 6.2 · Forms condicionais

- `paciente`: valor + payment_status + notas
- `orcamento`: valor + payment_status + subtotal + desconto + notas
- `paciente_orcamento`: valor + payment_status + subtotal + desconto + notas (mostra TODOS os campos)

Hint informativo: "Lead perdido? Use a ação dedicada no card do lead · não nasce de finalização de consulta."

### 6.3 · Toasts diferenciados

- `paciente` → "Lead promovido a paciente!"
- `orcamento` → "Orçamento criado!"
- `paciente_orcamento` → "Lead virou paciente E orçamento criado!"
- Sub-call failure → warning amarelo com instrução manual

### 6.4 · Visibilidade do botão

`canFinalize` do helper `getAppointmentActionFlags()` (2H) já cobre · botão visível quando status ∈ (`na_clinica`, `em_atendimento`).

---

## 7 · Smoke transacional · resultado

```
SMOKE_RESULT_2J:
  TESTE A · paciente:
    result.ok: true
    result.outcome: 'paciente'
    result.patient_call.ok: true
    appointments_remapped: 1
    phase_after: 'paciente'
    lifecycle_after: 'ativo'
    phase_history_rows: 1
    idempotent_result.idempotent_skip: true ✅ (segundo call não duplica)

  TESTE B · orcamento:
    result.ok: true
    result.budget_call.total: 1100.00 (1200 - 100 desconto)
    result.budget_call.orcamento_id: uuid criado
    phase_after: 'orcamento'
    orcamento_rows (por lead_id): 1
    lifecycle_after: 'ativo'

  TESTE C · paciente_orcamento:
    result.ok: true
    result.outcome: 'paciente_orcamento'
    result.budget_call.ok: true · orcamento_id criado · total=2500
    result.patient_call.ok: true · patient_id criado
    phase_after: 'paciente' (ordem sequencial: orçamento depois paciente)
    phase_history_rows: 2 (uma para orcamento, uma para paciente)
    orcamento_rows (por lead_id): 0 (remapeado para patient_id após promoção)

  TESTE D · perdido sem motivo:
    result.ok: false
    result.error: 'lost_reason_required' ✅ (bloqueio correto)

  TESTE E · status invalido (agendado):
    result.ok: false
    result.error: 'invalid_status_for_finalize'
    result.current_status: 'agendado' ✅ (bloqueio correto)

  worker71_off_still: true ✅
  wa_outbox_delta: 0 ✅
```

ROLLBACK forçado via `RAISE EXCEPTION` · zero dado persistente.

[Arquivo smoke](sql/phase-2j-finalization-enterprise-smoke.sql) | [Arquivo validation](sql/phase-2j-finalization-enterprise-validation.sql)

---

## 8 · Validation flags esperadas

| Flag | Esperado |
|---|---|
| worker71_off | true |
| finalize_fn_ready | true |
| lead_to_paciente_ready | true |
| lead_to_orcamento_ready | true |
| lead_lost_ready | true |
| paciente_outcome_ready | true |
| orcamento_outcome_ready | true |
| paciente_orcamento_outcome_ready | true |
| perdido_blocked_from_finalize_ui | true |
| perdido_capability_db | true (preservada para path dedicado) |
| phase_history_table_exists | true |
| crm_operational_view_exists | true |
| unsafe_outbox_count | 0 |
| phase_history_suspect_dupes_24h | 0 |
| **can_continue** | **true** |

---

## 9 · Segurança · confirmações negativas

- Job 71 active=false (verificado pré + pós smoke).
- Zero WhatsApp/Evolution/Meta call.
- Zero `wa_outbox` insert (delta=0 no smoke).
- Zero migration nova.
- Zero env/secrets alterados.
- Zero deploy manual.
- Zero worker de envio executado.
- Ban gate 2L preservado.
- Smoke 100% transacional (RAISE EXCEPTION força ROLLBACK).
- Sub-RPCs honram tenant guard via JWT claim.

---

## 10 · Limitações conhecidas

- **`perdido` ainda existe no DB**: capability não foi removida via migration (risco de quebrar outros callers · UI dedicada para `lead_lost` fica para fase 2J.1 ou 2I).
- **Orçamento "órfão" em paciente_orcamento**: após `lead_to_paciente` remapear o lead para patient_id, o orçamento criado fica vinculado ao `patient_id` (não ao `lead_id`). Comportamento correto, mas pode confundir queries que filtram só por `lead_id`. Documentado nesta fase · queries futuras devem usar `UNION` de `lead_id` e `patient_id`.
- **Sem audit trail visível no detail page**: `phase_history` tem rows mas a UI atual ([id]/page.tsx) não exibe a timeline. Card "Histórico" mostra só timestamps de chegada/cancel/no_show.
- **Status reverso impossível**: appointment_finalize idempotente para `finalizado` é ok-noop · não há "desfinalizar". Cancelamento posterior só via soft-delete admin.

---

## 11 · Rollback

Esta fase **não criou migration** · rollback = `git revert` do commit local. Zero impacto em schema.

UI volta a oferecer `perdido` no FinalizeWizard · `paciente_orcamento` some · enum TS volta a 3 outcomes.

Validation SQL pós-rollback continua passando (banco intacto).

---

## 12 · Próxima fase recomendada

Consultar [58-next-prompt-after-2j.md](58-next-prompt-after-2j.md):

1. **2I · Anamnese + Consentimento** (foundation para gates de finalize)
2. **2L.1 · Ban resolution audit** (paralelizável · READ-ONLY)
3. **2J.1 · `lead_lost` dedicada** (path "Marcar como perdido" via card do lead)
4. **2H.1 · cleanup `em_consulta`/`pre_consulta`** (refactor cosmético)
