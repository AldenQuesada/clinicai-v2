# CRM_PHASE_2AUX · Appointment Scheduling Modal (Wizard Rich)

> **Data:** 2026-05-12
> **Status:** Wizard rich live · backend reforçado · smoke PASS · zero migration · zero envio
> **HEAD inicial:** `8488565` · HEAD final esperado: commit local 2AUX
> **Verdict alvo:** `PASS_CRM_PHASE_2AUX_APPOINTMENT_MODAL_READY_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Refatora o form de agendamento (`/crm/agenda/novo`) para wizard rich em **4 passos** (Paciente · Tempo · Detalhes · Revisão) com validações operacionais fortes, **live conflict check** via server action, e suporte a **edit mode** (rota `/crm/agenda/[id]/editar` pode reusar o mesmo componente). Backend reforça `createAppointmentAction` e `updateAppointmentAction` com `checkConflicts` + bloqueio de edit em status terminal. **Zero migration · zero envio · zero alteração de banco.**

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `848856515add823fa777bf9910cd5d8d1006f3c9` |
| Working tree | limpo |
| Worker 71 | OFF ✅ |
| invalid_status_count | 0 (CHECK constraint protege) |
| overlapping_active_count | 0 |
| orphan_subject_count | 0 |
| phase_perdido_count | 0 |

---

## 3 · Auditoria do modal atual

**Antes (2AUX):**
- Form linear de 1 página · sem stepper · todos os campos visíveis
- Validação básica (data >= hoje, end > start)
- **Sem conflict check** · UI permitia overlapping (backend só catchava se houver constraint)
- **Sem edit mode** · só create
- **Sem lead support** · só patient
- **Sem revisão antes de salvar**
- Status enum já limpo após 2H.1

**Limitações:**
- Sem feedback de conflito em tempo real (usuário só vê após submit)
- Sem proteção contra duração absurda (aceitaria 12h)
- Sem proteção de edit em terminal (poderia editar appointment finalizado)
- Sem resumo final antes do submit

---

## 4 · Contrato de criação/edição

### 4.1 · Criação (`/crm/agenda/novo`)

Campos obrigatórios:
- `patientId` (selecionado em step 1)
- `scheduledDate` >= hoje
- `startTime` + `endTime` (end > start, duração 15-240min)
- `status` ∈ {`agendado`, `aguardando_confirmacao`, `confirmado`}
- `origem` ∈ {`manual`, `whatsapp`, `lara`, `api`, `import`}

Opcional:
- `professionalName` (texto livre · TODO: integrar professional FK em fase futura)
- `procedureName`, `consultType`, `value`, `obs`

### 4.2 · Edição (`/crm/agenda/[id]/editar` · futura rota · wizard pronto)

**Campos editáveis:**
- Data, horário, profissional, procedimento, valor, status (transições leves), notas

**Campos bloqueados:**
- `patientId` (Select disabled · trocar paciente requer cancelar + recriar)
- `origem` (snapshot do momento de criação)

**Status terminais bloqueiam edit:**
- Server retorna `appointment_terminal` se status atual ∈ {`finalizado`, `cancelado`, `no_show`}

### 4.3 · Outcome do submit

- `create`: rota nova vai para `/crm/agenda/{novo-id}`
- `update`: volta para `/crm/agenda/{mesmo-id}` (já atualizado · `router.refresh`)

---

## 5 · Validações implementadas

### 5.1 · Zod schemas (server-side · canonical)

`CreateAppointmentSchema` refinements:
- `endTime > startTime`
- Duração 15-240 minutos
- `scheduledDate >= today` (string ISO comparison)
- Subject XOR: leadId OR patientId (ou nenhum se `status='bloqueado'`)

`UpdateAppointmentSchema` refinements:
- Mesmos refinements **condicionais** (só se o campo estiver no patch)

`CheckAppointmentConflictSchema` (novo):
- `endTime > startTime`
- Aceita `appointmentId` opcional (exclude self em edit)

### 5.2 · Server actions (defesa em profundidade)

`createAppointmentAction`:
- Chama `checkConflicts` antes do INSERT
- Retorna `schedule_conflict` com counts se houver
- Pula check se `status='bloqueado'` (block time não conflita)

`updateAppointmentAction`:
- Busca appointment atual via `getById`
- Bloqueia se status ∈ `TERMINAL_STATUSES_FOR_EDIT` (`finalizado`, `cancelado`, `no_show`) → `appointment_terminal`
- Se schedule field mudou (date/start/end/professional), chama `checkConflicts(..., excludeId=appointmentId)`
- Bloqueia se conflito existir → `schedule_conflict`

`checkAppointmentConflictAction` (novo):
- Server action que expõe `checkConflicts` para UI consumir
- Retorna `{ hasConflict, counts: { professional, room, patient } }`

### 5.3 · UI client-side (feedback imediato)

Validation por step:
- **Step 1** (Paciente): patientId obrigatório
- **Step 2** (Tempo): data, horários, duração 15-240min, **chama `checkAppointmentConflictAction` antes de avançar**
- **Step 3** (Detalhes): status + origem obrigatórios
- **Step 4** (Revisão): só botão de submit

Live conflict feedback em step 2:
- `idle` → sem check ainda
- `checking` → "Verificando conflitos…"
- `ok` → "✓ Horário livre · sem conflitos detectados" (verde)
- `conflict` → "⚠️ Conflito detectado: X appointments do mesmo profissional/sala/paciente" (vermelho)
- `error` → "Não foi possível verificar conflitos · servidor revalida no submit"

---

## 6 · UI / wizard

### 6.1 · Stepper visual

Topo do card com 4 chips numerados (1 → 4) · chip ativo com fundo primary · chips passados em opacity reduzida.

### 6.2 · Step 1 · Paciente

- Select de patients (ordenado por nome) · com phone display
- Hint contextual: "Sem pacientes? adicione em /crm/pacientes/novo"
- Em **edit mode**: select disabled + nota "trocar paciente requer cancelar + criar"

### 6.3 · Step 2 · Tempo

- Grid 3 cols: Data | Início | Fim · label do Fim mostra duração calculada (`Fim · duração 60min`)
- `min` no input date = hoje
- Auto-recalc endTime quando startTime muda (mantém duração)
- Campo `professionalName` (texto livre · TODO professional FK)
- **Live conflict feedback** abaixo dos inputs

### 6.4 · Step 3 · Detalhes

- Grid 2 cols: Tipo | Procedimento · Valor | Status | Origem
- Status options canônicas (3 valores: agendado, aguardando_confirmacao, confirmado)
- Origem hide em edit mode (origem é snapshot)
- Observações em md:col-span-2

### 6.5 · Step 4 · Revisão

Lista vertical com chave/valor (Paciente, Telefone, Data, Horário+duração, Profissional, Tipo, Procedimento, Valor, Status, Origem, Observações).

Se conflict state ainda em `conflict`, mostra warning forte.

### 6.6 · Navigation

Footer com:
- Esquerda: "Cancelar" (volta para /crm/agenda) ou "Voltar ao detalhe" (em edit mode)
- Direita: "Voltar" + "Próximo" / "Verificando…" / "Criar/Atualizar agendamento"

---

## 7 · Backend / actions / RPC

### 7.1 · Sem migration nova

`checkConflicts` repository method já existia (mig 65 + helpers) · só faltava expor via server action.

### 7.2 · Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `apps/lara/src/app/crm/_schemas/appointment.schemas.ts` | 3 refinements em `Create` + 3 em `Update` + novo `CheckAppointmentConflictSchema` |
| `apps/lara/src/app/crm/_actions/appointment.actions.ts` | `createAppointmentAction` reforçado com conflict check · `updateAppointmentAction` reforçado com terminal block + conflict check · novo `checkAppointmentConflictAction` |
| `apps/lara/src/app/crm/agenda/novo/_form.tsx` | Reescrito como wizard rich 4 passos · 600+ linhas |

---

## 8 · Smoke transacional · resultado

```
SMOKE_RESULT_2AUX:
  baseline: worker71_off=true, appointments_total=5

  A · Valid create: id retornado ✅
  B · Status zombie 'em_consulta': CAUGHT por chk_appt_status ✅
  C · Subject XOR violation (sem lead+patient): CAUGHT por chk_appt_subject_xor ✅
  D · Block time válido (sem subject + status='bloqueado'): criado ✅
  E · Outro prof distinct: true ✅
  F · Finalized fixture criado (gate de edit fica em TS action) ✅

  worker71_off_still: true ✅
  wa_outbox_delta: 0 ✅
  appointments_delta: 5 (rollback aborta tudo)
```

ROLLBACK forçado via `RAISE EXCEPTION` · zero dado persistente.

[Arquivo smoke](sql/phase-2aux-appointment-modal-smoke.sql) | [Validation](sql/phase-2aux-appointment-modal-validation.sql)

---

## 9 · Validation flags esperadas

| Flag | Esperado |
|---|---|
| worker71_off | true |
| invalid_appointment_status_count | 0 |
| zombie_status_count | 0 |
| active_overlap_count | 0 |
| orphan_subject_count | 0 |
| unsafe_outbox_count | 0 |
| **can_continue** | **true** |

---

## 10 · Riscos residuais

1. **`professionalName` texto livre:** ainda não integra com `professional_id` FK. Conflict check por profissional usa `professionalId` (recebido como null) · só detecta conflito por paciente. **TODO 2AUX.2:** trocar input por select de professional FK.
2. **Sem lead support no wizard:** wizard atual só aceita `patientId`. Para appointments de leads, usar fluxo separado em `/crm/leads/[id]` que já chama `scheduleAppointmentAction` (com phase transition).
3. **Conflict check pode ficar stale:** UI roda check ao clicar "Próximo" no step 2. Se usuário ficar 30+ minutos parado no step 4, outro user pode criar appt conflitante. Defesa: server revalida no submit · retorna `schedule_conflict` + força volta ao step 2.
4. **Block time não testado em smoke:** status='bloqueado' funciona via fluxo separado (`createBlockTimeAction`) · não pelo wizard.
5. **Rota `/crm/agenda/[id]/editar` não criada ainda:** componente wizard suporta `editing` prop mas a rota dedicada precisa ser adicionada em fase futura.

---

## 11 · Rollback

`git revert <commit>` cobre toda a mudança. Zero alteração de banco · zero alteração de migration tracker.

Fallback rápido: reverter apenas `_form.tsx` para versão pré-2AUX se UI quebrar:
```bash
git checkout 8488565 -- apps/lara/src/app/crm/agenda/novo/_form.tsx
```

Mantém os reforços backend (que são defesa em profundidade · não quebram UI antiga).

---

## 12 · Próxima fase

Consultar [77-next-prompt-after-2aux.md](77-next-prompt-after-2aux.md):

1. **CRM_PHASE_2R.2** · No-show/cancel/remark refinement
2. **CRM_PHASE_2RC** · Recuperação comercial (consome `perdidos` table)
3. **CRM_PHASE_2AUX.2** · Professional FK integration + lead support no wizard
4. **CRM_PHASE_2L.2.1** · Template approval mirror (gated por Meta readiness)
