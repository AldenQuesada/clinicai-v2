# CRM_PHASE_2AUX.3 · Edit Appointment Dedicated Route

> **Data:** 2026-05-12
> **Status:** Rota live · reusa wizard 2AUX · terminal block · zero migration · zero envio
> **HEAD inicial:** `9dbf0fb` · HEAD final esperado: commit local 2AUX.3
> **Verdict alvo:** `PASS_CRM_PHASE_2AUX3_EDIT_ROUTE_READY_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Adiciona rota dedicada **`/crm/agenda/[id]/editar`** que carrega o appointment via SSR e reusa o `NewAppointmentForm` em modo `editing`. Defesa em profundidade tripla:
1. **SSR** bloqueia render do wizard se status terminal (`finalizado`/`cancelado`/`no_show`/`remarcado`) e renderiza tela amigável com motivo
2. **UI** dropdown só mostra botão "Editar agendamento" no detail page se editável
3. **Server action** `updateAppointmentAction` revalida e retorna `appointment_terminal` se gate UI for bypassada

Zero migration · zero envio · zero alteração de banco · 100% reuso do wizard 2AUX.

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `9dbf0fb1a130f70688d9ccb1f43dd201e394fd86` |
| Working tree | limpo |
| Worker 71 | OFF ✅ |
| Wizard 2AUX (`editing` prop) | ✅ pronto desde commit anterior |
| `updateAppointmentAction` terminal block | ✅ ativo desde 2AUX |

---

## 3 · Rota criada

**Arquivo novo:** [apps/lara/src/app/crm/agenda/[id]/editar/page.tsx](../../apps/lara/src/app/crm/agenda/[id]/editar/page.tsx)

**Comportamento:**
1. `await params` para obter `id`
2. `loadServerReposContext()` (Supabase + tenant)
3. `repos.appointments.getById(id)` · se null → `notFound()`
4. Check terminal: `appt.status` ∈ {finalizado, cancelado, no_show, remarcado}
   - Se sim: renderiza `PageHeader` + `Card` com alert amarelo informativo + link "Voltar ao agendamento"
   - Se não: renderiza `NewAppointmentForm` com `editing` prop preenchida
5. Pre-load `patients` ativos (limit 100, sort name asc · mesmo padrão de `/novo`)
6. Garante que o paciente atual aparece na lista mesmo se inativo (unshift na lista do form)

---

## 4 · Reuso do wizard

`NewAppointmentForm` recebe:

```ts
<NewAppointmentForm
  patients={patientsForForm}                  // patient atual incluído mesmo se inativo
  prefillDate={appt.scheduledDate}            // formato YYYY-MM-DD
  prefillTime={appt.startTime.slice(0, 5)}    // HH:MM
  prefillPatient={currentPatient ? {...} : null}
  editing={{
    appointmentId: appt.id,
    patientId: appt.patientId,
    professionalName: appt.professionalName ?? '',
    procedureName: appt.procedureName ?? '',
    consultType: appt.consultType ?? null,
    value: appt.value,
    status: appt.status,
    origem: appt.origem ?? null,
    obs: appt.obs ?? null,
  }}
/>
```

Wizard interpreta `editing` (truthy) e:
- Step 1: select de paciente fica **disabled** (trocar paciente = cancelar + criar novo)
- Step 3: campo `origem` é **escondido** (snapshot do momento de criação)
- Submit chama `updateAppointmentAction` em vez de `createAppointmentAction`
- Botão final muda label para "Atualizar agendamento"
- Cancel button label muda para "Voltar ao detalhe"

---

## 5 · Mapeamento de initial values

| Campo wizard | Origem appointment | Default se null |
|---|---|---|
| `patientId` | `appt.patientId` | `''` |
| `scheduledDate` | `appt.scheduledDate` | hoje (mas wizard usa prefill) |
| `startTime` | `appt.startTime.slice(0, 5)` | `'09:00'` |
| `endTime` | auto-calc via duração | `+60min` |
| `professionalName` | `appt.professionalName ?? ''` | `''` |
| `procedureName` | `appt.procedureName ?? ''` | `''` |
| `consultType` | `appt.consultType ?? null` | `'consulta'` |
| `value` | `String(appt.value)` | `''` |
| `status` | `appt.status` | `'agendado'` |
| `origem` | `appt.origem ?? null` | `'manual'` (hidden em edit) |
| `obs` | `appt.obs ?? null` | `''` |

`endTime` não vem do appointment porque o wizard auto-calcula a partir de `startTime` + duração. Para preservar duração exata, futuras iterações podem adicionar `prefillEndTime`. Atualmente o wizard usa `+60min` default em edit · usuário ajusta no step 2 se preciso.

---

## 6 · Status editáveis vs bloqueados

### Editáveis (renderiza wizard)
- `agendado`
- `aguardando_confirmacao`
- `confirmado`
- `aguardando`
- `na_clinica`
- `em_atendimento`
- `bloqueado` (block time)

### Bloqueados (renderiza tela amigável)
- `finalizado` (consulta encerrada)
- `cancelado` (terminal)
- `no_show` (terminal)
- `remarcado` (operacional · drag-drop criou novo registro)

**Defesa tripla:**
1. **SSR check** no `page.tsx` (NOT_EDITABLE_STATUSES set)
2. **UI**: botão "Editar agendamento" no detail page só aparece se `canEditAppointment` true
3. **Server action**: `updateAppointmentAction` revalida e retorna `appointment_terminal` se UI for bypassada (via URL direta)

---

## 7 · Conflict check

Wizard 2AUX já implementa:
- **Step 2 (UI)** chama `checkAppointmentConflictAction` antes de avançar para Step 3 (passa `excludeId: editing.appointmentId` para não conflitar consigo mesmo)
- **Submit (server)** `updateAppointmentAction` revalida `checkConflicts(excludeId=appointmentId)` antes do UPDATE

Edição preserva esses checks 100% sem código novo.

---

## 8 · Safety WhatsApp

- ✅ Edit não toca em `wa_outbox`
- ✅ Edit não toca em automações Mira/B2B/Magazine
- ✅ Worker 71 segue OFF
- ✅ Zero chamada Cloud Meta/Evolution
- ✅ Cron alterations: ZERO

---

## 9 · Validation

[sql/phase-2aux3-edit-appointment-route-validation.sql](sql/phase-2aux3-edit-appointment-route-validation.sql) · 5 blocos READ-ONLY:
- `00_safety` (jobs/outbox)
- `01_status_contract` (distribuição + zumbi count expected 0)
- `02_editable_candidates` (counts por status editável + terminal)
- `03_active_overlap` (sanity · não deve aumentar)
- `04_subject_integrity` (orphan subjects)
- `99_final_flags`

Flags esperadas:
- `worker71_off=true`
- `invalid_appointment_status_count=0`
- `zombie_status_count=0`
- `active_overlap_count=0`
- `orphan_subject_count=0`
- `unsafe_outbox_count=0`
- `can_continue=true`

---

## 10 · Smoke transacional · resultado

```
SMOKE_RESULT_2AUX3:
  baseline: worker71_off=true

  A · Fixture editável (agendado/futuro): criado ✅
  B · Fixture terminal (finalizado) criado + SELECT funciona ✅
     (rota /editar SSR consegue ler appointment terminal pra renderizar
     tela bloqueada com info)
  C · UPDATE direto para status 'em_consulta' (zumbi): CAUGHT por
     chk_appt_status CHECK constraint ✅ (DB rejeita zumbis)

  worker71_off_still: true ✅
  wa_outbox_delta: 0 ✅
```

ROLLBACK forçado · zero dado persistente.

[Arquivo smoke](sql/phase-2aux3-edit-appointment-route-smoke.sql)

---

## 11 · Typecheck

```
pnpm --filter @clinicai/lara run typecheck → PASS ✅
```

---

## 12 · Riscos residuais

1. **`endTime` não preservado em edit:** wizard recalcula como `startTime + 60min` em edit. Usuário precisa ajustar no step 2 se a duração original era diferente. Futura iteração pode adicionar `prefillEndTime`.
2. **`paymentStatus` e `paymentMethod` não editáveis pelo wizard:** wizard 2AUX só cobre campos básicos. Edição financeira fica via outra UI (ou direto na agenda detail page).
3. **`consentimentoImg` não editável pelo wizard:** se gestão do consentimento legacy for necessária, usar painel clínico 2I/2I.1.
4. **`bloqueado` editável:** wizard aceita editar block time (criado via fluxo separado). Mudar para outro status pode ser inconsistente · UI deveria desabilitar status zumbis para block time, mas atualmente permite. **TODO** (não bloqueia operação).
5. **Lead-based appointment não editável aqui:** rota só funciona para appointment com `patientId`. Appointments com `leadId` ainda usam fluxo separado em `/crm/leads/[id]`.

---

## 13 · Próxima fase

Consultar [79-next-prompt-after-2aux3.md](79-next-prompt-after-2aux3.md):

1. **CRM_PHASE_2R.2** · No-show/cancel/remark refinement (UX polish)
2. **CRM_PHASE_2RC** · Recuperação comercial (item #18 matriz)
3. **CRM_PHASE_2AUX.2** · Professional FK + Lead support no wizard
4. **CRM_PHASE_2L.2.1** · Template approval mirror (gated por Meta)
