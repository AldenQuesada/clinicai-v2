# CRM_PHASE_2R.2 · Appointment Outcomes Refinement (Cancel/No-show/Remarcação)

> **Data:** 2026-05-12
> **Status:** UI refinada · backend intacto · smoke PASS · zero migration · zero envio
> **HEAD inicial:** `70641a6` · HEAD final esperado: commit local 2R.2
> **Verdict alvo:** `PASS_CRM_PHASE_2R2_APPOINTMENT_OUTCOMES_READY_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Refina UX de desfechos operacionais da agenda · 3 fluxos:
1. **Cancelar** · select de 7 motivos predefinidos + observação opcional
2. **No-show** · select de 4 motivos predefinidos + observação opcional
3. **Remarcar** · botão dedicado linkando para `/crm/agenda/[id]/editar` (rota 2AUX.3 · path canônico: editar horário do MESMO appointment)

Backend e DB **já estavam canônicos** desde rounds anteriores:
- `appointment_change_status(p_id, p_new_status, p_reason)` RPC (mig 72)
- Colunas dedicadas `motivo_cancelamento` + `cancelado_em` + `motivo_no_show` + `no_show_em`
- CHECK constraints `chk_appt_cancelled_consistency` + `chk_appt_noshow_consistency`
- Trigger `trg_appointment_rescheduled_phase`

**Zero migration · zero envio · zero alteração de banco.** Só UI.

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `70641a6496a887b5aeb703e68a735392da896b82` |
| Working tree | limpo |
| Worker 71 | OFF ✅ |
| `cancelado_count` | 0 (DB pré-produção) |
| `no_show_count` | 0 |
| `remarcado_count` | 0 |
| RPCs outcome | `appointment_change_status` + trigger `trg_appointment_rescheduled_phase` |
| Coluna outcome | `cancelado_em`, `motivo_cancelamento`, `no_show_em`, `motivo_no_show` |

---

## 3 · Auditoria dos fluxos existentes

### Antes 2R.2

**Cancel:**
- Botão "Cancelar" no detail page → abre `CancelModal`
- Modal: textarea livre · motivo string · validação min 2 chars
- Action: `cancelAppointmentAction` (wrapper de `appointment_change_status('cancelado', motivo)`)
- DB: `appointment_change_status` RPC pega motivo + popula `cancelado_em=now()`, `motivo_cancelamento=motivo`

**No-show:**
- Botão "Não compareceu" → `NoShowModal`
- Modal: textarea com default "Paciente não compareceu" · motivo string
- Action: `markNoShowAction` (wrapper de `appointment_change_status('no_show', motivo)`)
- DB: idem cancel · popula `no_show_em` + `motivo_no_show`

**Remarcar:**
- Atualmente via **dragDrop** (já existia em 2H) ou via **/editar** rota (2AUX.3 nova)
- Nenhum botão "Remarcar" dedicado no actions-bar do detail

### Lacunas atacadas

- ✅ Motivos categorizados (cancel + no-show) com select predefinido
- ✅ Botão "Remarcar" dedicado linkando para `/editar`
- ✅ Reset on close + "outro" exige observação

### Lacunas NÃO atacadas (futuro · 2R.3)

- Remarcação com **lineage cross-appointments** (criar novo + marcar antigo como `remarcado` + FK `rescheduled_from/to`). Requer mig nova com coluna FK. Decisão: fora do escopo 2R.2 · documentar como 2R.3 dedicado.

---

## 4 · Contrato cancelamento

### 4.1 · Permitido cancelar quando

Status origem ∈ {`agendado`, `aguardando_confirmacao`, `confirmado`, `aguardando`}

State machine TS/DB também permite `cancelado` a partir de:
- `na_clinica` (cancelamento tardio na recepção)
- `em_atendimento` (cancelamento durante consulta)
- `remarcado` (cancelar remarcação antes de criar novo)
- `bloqueado` (liberar slot bloqueado)

### 4.2 · Bloqueado cancelar quando

- `finalizado` (terminal · já encerrado)
- `cancelado` (já cancelado · idempotent_skip)
- `no_show` (terminal)

### 4.3 · UI Motivos predefinidos (CRM_PHASE_2R.2)

```ts
const CANCEL_REASONS = [
  { value: 'paciente_desistiu', label: 'Paciente desistiu' },
  { value: 'conflito_horario', label: 'Conflito de horário do paciente' },
  { value: 'problema_saude', label: 'Problema de saúde' },
  { value: 'sem_resposta', label: 'Sem resposta após tentativas' },
  { value: 'erro_agendamento', label: 'Erro de agendamento (recriar correto)' },
  { value: 'profissional_indisponivel', label: 'Profissional indisponível' },
  { value: 'outro', label: 'Outro motivo (observação obrigatória)' },
]
```

**Reason composto enviado ao backend:**
- Com observação: `"{label}: {notes}"`
- Sem: apenas `label`

`outro` exige observação (min 2 chars · client-side validation).

---

## 5 · Contrato no-show

### 5.1 · Permitido marcar no-show quando

Status origem ∈ {`agendado`, `aguardando_confirmacao`, `confirmado`, `aguardando`, `na_clinica`}

(State machine permite no-show até o paciente "chegar" na clínica · raro mas possível se equipe marcar errado e descobrir depois)

### 5.2 · Bloqueado marcar no-show quando

- `em_atendimento` (paciente já está sendo atendido · contradição)
- `finalizado` (terminal · smoke confirmou `illegal_status_transition`)
- `cancelado` (terminal)
- `no_show` (idempotent_skip)
- `remarcado` (já reagendado)
- `bloqueado` (não-pessoa)

### 5.3 · UI Motivos predefinidos

```ts
const NO_SHOW_REASONS = [
  { value: 'nao_compareceu', label: 'Não compareceu (sem aviso)' },
  { value: 'nao_respondeu', label: 'Não respondeu confirmação · não veio' },
  { value: 'chegou_muito_atrasada', label: 'Chegou muito atrasado(a) · perdeu slot' },
  { value: 'outro', label: 'Outro motivo (observação obrigatória)' },
]
```

Composição igual ao cancel.

---

## 6 · Contrato remarcação

### 6.1 · Path canônico atual

**Edit o horário do MESMO appointment** (não cria novo):
- Botão "Remarcar" no detail → `/crm/agenda/[id]/editar` (rota 2AUX.3)
- Wizard 4 passos · permite alterar data/hora/profissional
- Conflict check live + server-side
- `updateAppointmentAction` chama `repos.appointments.update` com nova data/hora
- DB triggers fazem o resto (phase do lead atualiza via trigger se necessário)

### 6.2 · Por que NÃO criar novo appointment nesta fase

Lineage cross-appointments (old=remarcado + new=novo + FK `rescheduled_from/to`) requer:
- Mig nova adicionando colunas
- Backend: action que cria novo + atualiza antigo em transação
- Validação extra de subject preservado

**Decisão:** path simplificado (mesmo appointment, dados novos) cobre 95% dos casos. Lineage formal fica para **2R.3** dedicado se necessário.

### 6.3 · Bloqueios

Botão "Remarcar" só visível se `!isTerminal` (mesma regra de cancel/no-show).

**Defesa em profundidade:**
- UI bloqueia botão se terminal
- Rota `/editar` bloqueia render se terminal
- `updateAppointmentAction` retorna `appointment_terminal` se UI bypassada
- Conflict check em todos os caminhos

---

## 7 · UI entregue

### 7.1 · CancelModal refinado

[apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx](../../apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx) · `CancelModal`:
- Select de 7 motivos predefinidos
- Textarea condicional (obrigatória se "outro" · mín 2 chars)
- Reset on close
- String composta `{label}: {notes}` enviada ao server

### 7.2 · NoShowModal refinado

Mesmo arquivo · `NoShowModal`:
- Select de 4 motivos predefinidos
- Default `nao_compareceu`
- Mesmo comportamento de composição

### 7.3 · Botão "Remarcar" novo

Adicionado no actions-bar (linha após "Não compareceu"):
```tsx
<Link href={`/crm/agenda/${appointmentId}/editar`}>
  <Button size="sm" variant="outline">
    <CalendarClock className="h-4 w-4" />
    Remarcar
  </Button>
</Link>
```

Visível apenas quando `!isTerminal`. Reusa rota 2AUX.3.

### 7.4 · Constantes exportáveis

`CANCEL_REASONS` e `NO_SHOW_REASONS` declaradas no arquivo (não exportadas · uso interno) · seguindo padrão de 2J.1 `LEAD_LOST_REASONS`.

---

## 8 · Backend / actions / RPC

**Zero alteração:**
- `cancelAppointmentAction` continua usando `repos.appointments.cancel`
- `markNoShowAction` continua usando `repos.appointments.markNoShow`
- Ambos wrappers de `appointment_change_status` RPC
- DB validações continuam ativas (CHECK constraints + state machine RPC)

UI compõe reason string com label + notes opcionais · server recebe string única + grava em `motivo_cancelamento`/`motivo_no_show`.

---

## 9 · Smoke transacional · resultado

```
SMOKE_RESULT_2R2:
  baseline: worker71_off=true, appointments_total=5

  A · Cancel válido:
    result.ok: true · from=agendado → to=cancelado
    status_after: 'cancelado'
    motivo: 'Paciente desistiu: smoke 2R2 test' ✅
    has_timestamp: true ✅ (cancelado_em populado)

  B · Cancel sem motivo (appt já cancelado · idempotent):
    result.ok: true · idempotent_skip: true ✅
    (RPC trata corretamente · não força reason quando já no destino)

  C · No-show válido:
    result.ok: true · from=confirmado → to=no_show
    status_after: 'no_show'
    motivo: 'Não compareceu (sem aviso): smoke' ✅
    has_timestamp: true ✅ (no_show_em populado)

  D · No-show em finalizado (terminal):
    result.ok: false
    error: 'illegal_status_transition' ✅
    (state machine RPC rejeita corretamente)

  E · Status zumbi via UPDATE direto:
    CAUGHT por chk_appt_status CHECK constraint ✅

  worker71_off_still: true ✅
  wa_outbox_delta: 0 ✅
```

ROLLBACK forçado · zero dado persistente.

[Arquivo smoke](sql/phase-2r2-appointment-outcomes-smoke.sql) | [Validation](sql/phase-2r2-appointment-outcomes-validation.sql)

---

## 10 · Validation flags esperadas

| Flag | Esperado |
|---|---|
| worker71_off | true |
| invalid_appointment_status_count | 0 |
| missing_outcome_reason_count | 0 (CHECK protege) |
| missing_outcome_timestamp_count | 0 (CHECK protege) |
| active_overlap_count | 0 |
| unsafe_outbox_count | 0 |
| **can_continue** | **true** |

---

## 11 · Limitações

1. **Reason composta como string única** · não há split estruturado no DB. Queries de analytics que quiserem agrupar por código (ex: `paciente_desistiu`) precisam fazer LIKE/regex no `motivo_cancelamento`. **Futura iteração:** adicionar colunas `cancel_reason_code` / `no_show_reason_code` (mig dedicada).
2. **Remarcação sem lineage formal** · path atual edita MESMO appointment. Audit trail via `phase_history` + `updated_at`/`updated_by` é o que existe. Cross-appointment lineage = 2R.3.
3. **Reasons hardcoded no TS** · sem catálogo editável. Para customização por clínica, futura mig adicionaria `clinic_outcome_reasons` table com RLS.
4. **Sem follow-up automático pós-cancelamento** · UI cancelou mas zero ação automatizada (envio de mensagem ao paciente "soubemos que cancelou..."). Por design: WhatsApp real bloqueado por 2L · fase futura `2RC.2 communication on outcomes`.

---

## 12 · Próxima fase

Consultar [81-next-prompt-after-2r2.md](81-next-prompt-after-2r2.md):

1. **CRM_PHASE_2RC · Recuperação comercial** (item #18 matriz · consome `perdidos`)
2. **CRM_PHASE_2AUX.2 · Professional FK + Lead support no wizard**
3. **CRM_PHASE_2L.2.1 · Template approval mirror** (gated por Meta)
4. **CRM_PHASE_2R.3 · Reschedule lineage** (cross-appointment com FK · opcional)
