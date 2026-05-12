# CRM_PHASE_2H · Arrival + Patient In Clinic + Start Attendance (UI cleanup)

> **Data:** 2026-05-12
> **Status:** DELIVERED · smoke PASS · UI live · dry-mode (worker 71 OFF)
> **HEAD inicial:** `46fcfff` · HEAD final esperado: commit local 2H
> **Verdict alvo:** `PASS_CRM_PHASE_2H_PATIENT_ARRIVAL_CLINIC_FLOW_READY_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Fecha o fluxo operacional de **recepção da clínica**:
1. Recepcionista marca "Paciente chegou" → status muda para `na_clinica`, gera 2 alertas internos (secretaria + profissional), atualiza `leads.phase=compareceu`.
2. Profissional marca "Iniciar atendimento" → status muda para `em_atendimento`.
3. UI bloqueia ações inválidas em status terminais (`cancelado`/`no_show`/`finalizado`).
4. UI cleanup: hardcodes de status zumbis (`em_consulta` no detail page) substituídos por helper canônico.

Entrega vertical:
- Backend já tinha tudo (RPCs `appointment_attend`, `appointment_change_status`, `appointment_arrival_internal_alert` desde migs 65/72/161).
- Frontend: novo botão "Iniciar atendimento" + flags centralizadas em `getAppointmentActionFlags()`.
- Smoke transacional PASS · idempotência confirmada · zero envio real · worker 71 OFF preservado.
- **Zero migration nova** (todo o contrato DB já existia).

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `46fcffff8d22e7fa5f73f053fddc537af1a9551e` |
| Working tree | limpo |
| Migs 160/161/162/163 | registradas |
| RPCs `appointment_attend`/`change_status`/`finalize`/`arrival_internal_alert` | todas presentes |
| Cron 12/72/89/90/91/92/93/94 | active=true |
| Worker 71 | OFF ✅ (gate inegociável) |

---

## 3 · Gate WhatsApp banido (preservado)

Esta fase **não toca em envio** · não cria nenhuma row em `wa_outbox` · zero chamada a Evolution/Meta. Os 2 alertas internos criados ao marcar chegada vivem só em `appointment_internal_alerts` (UI bell).

Doc canônico: [45-phase-2l-whatsapp-real-send-ban-gate.md](45-phase-2l-whatsapp-real-send-ban-gate.md).

---

## 4 · Contrato de status

### 4.1 · Status enum oficial (CHECK constraint no DB)

```
agendado · aguardando_confirmacao · confirmado · aguardando · na_clinica ·
em_atendimento · finalizado · remarcado · cancelado · no_show · bloqueado
```

Confirmado via `pg_get_constraintdef` em prod. **`em_consulta` e `pre_consulta` NÃO existem na constraint** (eram zumbis no state-machine TS · ainda referenciados em código legacy + migs antigas · cleanup completo fica para fase futura).

### 4.2 · Matriz de transição (RPC `_appointment_status_transition_allowed`)

| Origem | Destinos válidos |
|---|---|
| `agendado` | aguardando_confirmacao, confirmado, remarcado, cancelado, no_show, (self) |
| `aguardando_confirmacao` | confirmado, remarcado, cancelado, no_show, (self) |
| `confirmado` | aguardando, remarcado, cancelado, no_show, (self) |
| `aguardando` | **na_clinica**, no_show, cancelado, (self) |
| `na_clinica` | **em_atendimento**, (self) |
| `em_atendimento` | **finalizado**, cancelado, na_clinica, (self) |
| `finalizado` | (terminal) |
| `remarcado` | agendado, cancelado, (self) |
| `cancelado` | (terminal) |
| `no_show` | (terminal) |
| `bloqueado` | cancelado, (self) |

### 4.3 · Decisão 2H

- **"Paciente chegou"** → status destino **`na_clinica`** (via `appointment_attend`)
- **"Iniciar atendimento"** → status destino **`em_atendimento`** (via `appointment_change_status`)
- **Finalizar** continua em fase 2J (RPC `appointment_finalize` já existe)
- `cancelado`/`no_show`/`finalizado` → UI esconde botões via `getAppointmentActionFlags`

---

## 5 · Banco / RPC

**Zero migration criada nesta fase.** Reutilizado integralmente:

| RPC | Mig original | Comportamento |
|---|---|---|
| `appointment_attend(p_id, p_chegada_em)` | 65 | Valida status origem · seta `na_clinica` · atualiza `leads.phase=compareceu` em transação atômica · idempotente |
| `appointment_change_status(p_id, p_new, p_reason)` | 72 | State machine canônica · usada para `em_atendimento` em 2H |
| `appointment_arrival_internal_alert(p_id)` | 161 | Cria 2 rows em `appointment_internal_alerts` (secretaria + professional) · UNIQUE protege duplicação |
| `appointment_finalize(...)` | 65 | 3 outcomes (paciente/orcamento/perdido) · usado pelo wizard de finalização |

**Comportamento de bloqueio (RPC `appointment_attend`):**
- `cancelado` → retorna `{ok:false, error:"invalid_status_for_attend", current_status:"cancelado"}`
- `finalizado` → retorna `{ok:true, idempotent_skip:true, status_after:"finalizado"}` (não retrocede, mas não rejeita)
- `no_show`/`bloqueado` → comportamento depende de `_appointment_status_transition_allowed` (rejeita)

Defesa em profundidade: UI bloqueia via `getAppointmentActionFlags` antes do RPC ser chamado.

---

## 6 · Backend / actions

**Atualização mínima:**

[apps/lara/src/app/crm/_actions/appointment.actions.ts](../../apps/lara/src/app/crm/_actions/appointment.actions.ts) · `ChangeStatusSchema` agora aceita `'em_atendimento'` no enum (linha ~399). Permite que `changeAppointmentStatusAction` seja chamado com este destino sem violar validação Zod.

Demais actions intactas:
- `attendAppointmentAction` (mig 161 cria alerta best-effort após RPC ok)
- `cancelAppointmentAction` (motivo obrigatório)
- `markNoShowAction` (motivo obrigatório)
- `finalizeAppointmentAction` (3 outcomes)

---

## 7 · UI entregue

### 7.1 · Helper canônico

[packages/repositories/src/helpers/appointment-state.ts](../../packages/repositories/src/helpers/appointment-state.ts) ganhou `getAppointmentActionFlags(status)`:

```ts
export interface AppointmentActionFlags {
  canMarkArrived: boolean       // mostra botão "Marcar chegada"
  canStartAttendance: boolean   // mostra botão "Iniciar atendimento"
  canFinalize: boolean          // mostra botão "Finalizar consulta"
  canCancel: boolean
  canNoShow: boolean
  canChangeLight: boolean       // dropdown leve aplicável
  isTerminal: boolean
}
```

Espelho 1:1 da matriz canônica do DB. Substitui hardcodes do tipo `['na_clinica','em_consulta','em_atendimento'].includes(status)`.

### 7.2 · Page detail limpa

[apps/lara/src/app/crm/agenda/[id]/page.tsx](../../apps/lara/src/app/crm/agenda/[id]/page.tsx) — removidos hardcodes que misturavam `em_consulta` (zumbi) com status reais. Agora consome `getAppointmentActionFlags(appt.status)`.

Filtro do dropdown de transições leves agora exclui `na_clinica`, `em_atendimento` e `finalizado` (todos têm RPC dedicada).

### 7.3 · Action bar com novo botão

[apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx](../../apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx):
- Nova prop `canStartAttendance`
- Novo handler `handleStartAttendance()` que chama `changeAppointmentStatusAction({appointmentId, newStatus:'em_atendimento'})`
- Novo botão "Iniciar atendimento" com ícone `Stethoscope` · visível APENAS quando status=`na_clinica`
- Toast: "Atendimento iniciado · paciente em consulta"

### 7.4 · Estado visual "Paciente na clínica"

Já coberto pelo `AppointmentStatusBadge` (componente shared `@clinicai/ui`) consumindo `APPOINTMENT_STATUS_LABELS['na_clinica'] = 'Na Clínica'` + cor `#06B6D4` (cyan).

Histórico mostra timestamp `chegadaEm` quando o RPC seta o campo (mig 65).

**Gap conhecido:** se a coluna `chegada_em` não existe ou está NULL após attend, o histórico não mostra. Não bloqueante — documentado para futura fase.

---

## 8 · AlertBell · `arrival`

UI bell ([apps/lara/src/components/AlertBell.tsx](../../apps/lara/src/components/AlertBell.tsx)) já cobria `arrival` desde 2G.2:

```ts
const ALERT_KIND_LABEL = {
  ...
  arrival: 'Paciente chegou',
  ...
}

function kindIcon(kind) {
  if (kind === 'arrival') return UserCheck
  ...
}
```

Polling 30s via `useAppointmentInternalAlerts`. Zero mudança nesta fase.

---

## 9 · Smoke transacional · resultado

```
SMOKE_RESULT_2H:
  baseline: worker71_off=true, attend_fn_exists=true, change_status_fn_exists=true
  TESTE A (arrival happy path):
    attend_1.status_after: 'na_clinica' ✅
    attend_1.idempotent_skip: false ✅
    alert_count_after_attend: 2 (secretaria + professional) ✅
    attend_2_idempotent.idempotent_skip: true ✅ (não duplicou)
  TESTE B (start attendance):
    start_1: na_clinica → em_atendimento ✅
    status_after_start: 'em_atendimento' ✅
    start_2_idempotent.idempotent_skip: true ✅ (não retrocedeu)
  TESTE C (bloqueios):
    attend_cancel: ok=false, error='invalid_status_for_attend' ✅
    attend_finalize: ok=true, status_after='finalizado', idempotent_skip=true ✅
      (não retrocede · gate principal é UI via getAppointmentActionFlags)
  worker71_off_still: true ✅
  wa_outbox_delta: 0 ✅ (zero side-effect WhatsApp)
```

ROLLBACK forçado via `RAISE EXCEPTION` · zero dado persistente.

[Arquivo smoke](sql/phase-2h-arrival-clinic-flow-smoke.sql) | [Arquivo validation](sql/phase-2h-arrival-clinic-flow-validation.sql)

---

## 10 · Validation flags esperadas

| Flag | Esperado |
|---|---|
| worker71_off | true |
| attend_fn_ready | true |
| change_status_fn_ready | true |
| arrival_alert_fn_ready | true |
| na_clinica_em_atendimento_allowed | true |
| cancelado_blocked_to_na_clinica | true |
| finalizado_blocked_to_em_atendimento | true |
| duplicate_arrival_alert_count | 0 |
| orphan_arrival_alert_count | 0 |
| invalid_status_rows | 0 |
| unsafe_outbox_count | 0 |
| **can_continue** | **true** |

---

## 11 · Segurança · confirmações negativas

- Job 71 active=false (verificado pré + pós smoke).
- Zero WhatsApp/Evolution/Meta call.
- Zero `wa_outbox` insert (delta=0 no smoke).
- Zero env/secrets alterados.
- Zero deploy manual.
- Zero worker de envio executado.
- Ban gate 2L preservado.
- Smoke 100% transacional (RAISE EXCEPTION força ROLLBACK).

---

## 12 · Limitações conhecidas

- `em_consulta` e `pre_consulta` ainda referenciados no state-machine TS, em código legacy (`apps/lara/public/legacy/js`) e em migs antigas. **Não removidos nesta fase** (escopo seria refactor enorme cross-cutting · proposto para fase futura).
- Coluna `chegada_em` populada pelo RPC mas UI da page de detail pode mostrar "—" se RPC não setar o campo (não bloqueante).
- "Iniciar atendimento" reusa `appointment_change_status` (state machine) · não cria alerta interno dedicado. Se for necessário alerta para "consulta iniciada", criar em fase futura sem mig nova (reusar `appointment_internal_alert_create`).

---

## 13 · Rollback

Esta fase **não criou migration** · rollback = `git revert` do commit local. Zero impacto em schema.

UI volta a usar hardcodes antigos · `em_atendimento` sai do enum do action TS · botão "Iniciar atendimento" some.

Validation SQL pós-rollback continua passando (banco intacto).

---

## 14 · Próxima fase recomendada

Consultar [56-next-prompt-after-2h.md](56-next-prompt-after-2h.md):

1. **2J · Finalização enterprise** (modal rico · gates anamnese/consent)
2. **2I · Anamnese + consentimento** (dependência de 2J)
3. **2L.1 · Ban resolution audit** (audit cloud meta · paralelizável)
4. **2H.1 · Cleanup zumbi `em_consulta`/`pre_consulta`** (refactor cross-cutting · pode esperar)
