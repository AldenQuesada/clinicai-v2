# CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE · Wiring do contrato canônico

> Mig 182 já aplicada · `appointments.procedure_id` existe como FK nullable
> para `clinic_procedimentos(id)`. Esta fase **liga** o app ao novo campo:
> types/DTOs/repository/Zod/wizard/prontuário. Snapshot `procedure_name`
> continua sendo gravado em paralelo. Zero backfill.

---

## 1 · Objetivo

Fazer o app começar a persistir `procedure_id` quando o usuário selecionar
do catálogo, mantendo `procedure_name` como snapshot textual e respeitando
o legado (NULL é caminho válido).

---

## 2 · Contexto

| Item | Estado |
|---|---|
| Branch · HEAD inicial | `main` · `65788f6` |
| Mig 182 aplicada | sim · tracker registrado |
| `appointments.procedure_id` | uuid NULL · FK + index parcial |
| Backfill executado | **não** (e nem é executado nesta fase) |
| `procedure_name` | preservado · continua gravado |
| `recurrence_procedure` | preservado |
| Hard gate clínico | intocado |
| Tail Alexa | fechado (mig 181) |
| `medical_record_attachments` | placeholder · 0 policies |

---

## 3 · Typegen

- Comando: `pnpm db:types` (`scripts/generate-types.mjs` · Management API)
- Arquivo regenerado: `packages/supabase/src/types.ts`
- Diff `+952 / -104` linhas (typegen estava desatualizado há várias fases · agora reflete schema real)
- `appointments.procedure_id: string | null` capturado em Row/Insert/Update
- FK `appointments_procedure_id_fkey` capturada como relacionamento

---

## 4 · Contrato dual entregue

| Coluna | Papel | Quando é populated |
|---|---|---|
| `procedure_id` | **canônico** · FK → `clinic_procedimentos(id)` | quando user selecionar do Select catálogo no wizard |
| `procedure_name` | **snapshot textual** · compat com legado e modo manual | sempre que houver procedimento (catálogo ou manual) |

Estados possíveis de um appointment:

1. **Canônico**: `procedure_id` NOT NULL + `procedure_name` = snapshot do `clinic_procedimentos.nome` no momento da gravação.
2. **Snapshot compatível**: `procedure_id` NULL + `procedure_name` bate com nome ativo no catálogo (legado antes da FK · pode ser promovido ao salvar).
3. **Snapshot legado/manual**: `procedure_id` NULL + `procedure_name` sem match (modo "Outro/manual" ou seed antigo).

---

## 5 · Mudanças por camada

### 5.1 Types (`@clinicai/repositories`)

- `AppointmentDTO.procedureId: string | null` adicionado em `dtos.ts`.
- `mapAppointmentRow`: mapeia `row.procedure_id ?? null`.
- `APPT_COLUMNS` no `appointment.repository.ts` inclui `procedure_id`.
- `CreateAppointmentInput.procedureId?: string | null` e
  `UpdateAppointmentInput.procedureId?: string | null` adicionados.

### 5.2 Repository (`AppointmentRepository`)

- `create()`: grava `procedure_id` (nullable · `input.procedureId ?? null`).
- `update()`: grava `procedure_id` quando `procedureId !== undefined`
  (permite explicitamente setar `null` para mover canônico→manual sem
  destruir snapshot).
- `getById`/`listBySubject`/`listByDate*` retornam o DTO completo já com
  `procedureId`.

### 5.3 Zod schemas (`apps/lara/src/app/crm/_schemas/appointment.schemas.ts`)

- `CreateAppointmentSchema`: `procedureId: z.string().uuid().nullable().optional()`.
- `UpdateAppointmentSchema`: mesma adição.

### 5.4 Wizard (`apps/lara/src/app/crm/agenda/novo/_form.tsx`)

- `EditingPrefill.procedureId: string | null` adicionado.
- Inicialização em edit: prefere FK existente (`editing.procedureId`),
  fallback para match por nome (`editing.procedureName`), senão manual.
- Submit envia `procedureId` no payload de `createAppointmentAction` e
  `updateAppointmentAction`:
  ```ts
  const procedureIdPayload =
    data.procedureMode === 'canonical' && data.procedureId
      ? data.procedureId
      : null
  ```
- `procedureName` snapshot continua sendo enviado em paralelo.

### 5.5 Editar (`apps/lara/src/app/crm/agenda/[id]/editar/page.tsx`)

- `editing.procedureId: appt.procedureId ?? null` passado para o form.

### 5.6 Prontuário aba Procedimentos (`apps/lara/src/app/crm/pacientes/[id]/_record-tabs.tsx`)

- Agrupamento preferencial por `procedure_id` (FK canônica), fallback por
  `procedure_name` (case-insensitive trim).
- Três badges:
  - `FK canônica` (emerald) quando agrupado por `procedure_id`
  - `snapshot compatível` (sky) quando match por nome no catálogo
  - `snapshot legado` (zinc) quando nem FK nem match

### 5.7 Outros consumidores

`AlertBell`, `recepcao/painel`, `agenda/_components/*`, `LeadDetailClient`,
`api/leads/[id]/appointments`, `agenda/[id]/page.tsx` continuam usando
`procedureName` como label. **Não foram alterados** porque o snapshot já
é populated e o DTO continua exposto · zero risco de quebrar nada.

---

## 6 · Comportamento por cenário

### 6.1 Novo agendamento — Select oficial
1. User escolhe procedimento → `procedureId = <id>`, `procedureName = nome`, auto-ajusta `endTime`/`value`.
2. Submit → payload tem ambos.
3. DB grava `procedure_id` + `procedure_name`.

### 6.2 Novo agendamento — modo manual "Outro"
1. User escolhe sentinel `__manual__` → `procedureId=''`, `procedureMode='manual'`.
2. User digita texto livre.
3. Submit → `procedureId=null`, `procedureName=<texto>`.

### 6.3 Edição — appointment canônico (procedure_id NOT NULL)
1. Page carrega `editing.procedureId` do DB.
2. Wizard pré-seleciona pelo ID via `editingProcedureByFk`.
3. Salvar mantém o vínculo (ou troca/limpa conforme ação user).

### 6.4 Edição — appointment legado (procedure_id NULL · nome bate)
1. `editingProcedureByName` tenta match por nome.
2. Se bater, Select abre pré-selecionado **sem** persistir nada.
3. Salvar promove para canônico (`procedure_id` passa a NOT NULL).
4. Se user voltar pro manual, `procedure_id` é setado NULL.

### 6.5 Edição — appointment legado (procedure_id NULL · sem match)
1. Form abre em modo manual com hint "Agendamento legado".
2. User pode trocar pelo Select oficial → promove.
3. Se mantiver manual, snapshot textual permanece.

### 6.6 Prontuário do paciente
- Aba "Procedimentos" agora reflete os 3 estados (canônica/compatível/legado).
- Preço/duração de referência exibidos quando há match (FK ou nome).
- Zero alteração de dados.

---

## 7 · Sem backfill

Mantido o contrato da fase APPLY:

- `appointments_with_procedure_id_count = 0` no banco hoje.
- 3 appointments legados continuam com `procedure_id NULL`.
- Novos appointments criados a partir desta fase nascem canônicos quando
  user selecionar do catálogo.

---

## 8 · Smoke transacional rollback

Arquivo: `docs/crm-refactor/sql/phase-appointment-procedure-fk-wire-smoke.sql`

Resultado (todos PASS · `SMOKE_RESULT_FK_WIRE` lançado por design para forçar rollback):

| Cenário | Resultado |
|---|---|
| `A_fk_accept_canonical_ok` | true · INSERT com procedure_id válido aceito |
| `B_fk_reject_invalid_ok` | true · UPDATE com UUID inexistente rejeitado (`foreign_key_violation`) |
| `C_on_delete_set_null_ok` | true · DELETE em clinic_procedimentos linkado coloca `procedure_id=NULL` no appointment |
| `D_legacy_null_still_allowed` | true · INSERT com `procedure_id=NULL` continua aceito |
| `wa_outbox_delta` | 0 |
| `worker71_off_still` | true |
| `hard_gate_still_present` | true |

---

## 9 · Validations

| Validation | Resultado |
|---|---|
| `pnpm --filter @clinicai/repositories typecheck` | OK |
| `pnpm --filter @clinicai/lara typecheck` | OK |
| `git diff --check` | sem warnings (apenas CRLF auto) |
| SQL validation `phase-appointment-procedure-fk-wire-validation.sql` | final_flags green |
| SQL smoke `phase-appointment-procedure-fk-wire-smoke.sql` | 4/4 PASS (rollback) |

Flags chave:

- `worker71_off`: true
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `hard_gate_untouched`: true
- `appointments_procedure_id_exists_remote`: true
- `appointment_fk_to_procedures_present`: true
- `appointment_procedure_index_exists`: true
- `procedure_name_still_exists`: true
- `recurrence_procedure_still_exists`: true
- `appointments_with_procedure_id_count`: **0** (zero backfill)
- `appointments_with_procedure_id_invalid_fk_count`: 0
- `clinic_procedimentos_active_count`: 44
- **`can_continue`: true**

---

## 10 · Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Typegen regenerado introduz mudanças não relacionadas | baixo | diff conferido · só descreve schema real · zero código TS quebra (typecheck passou) |
| Wizard salvar `procedureId` com schema antigo (cache) | trivial | Zod aceita opcional `nullable` · payload é compatível para frente |
| Caller TS que constrói objeto literal `AppointmentDTO` esquecer `procedureId` | trivial | TypeScript exige o campo · build quebra na hora |

---

## 11 · Próximos passos

1. **`CRM_PHASE_APPOINTMENT_PROCEDURE_FK_WIRE_PUSH`** · publicar wiring.
2. **`CRM_PHASE_APPOINTMENT_PROCEDURE_FK_SMOKE_BROWSER`** (opcional) · criar appointment real via UI · validar que nasce com `procedure_id` (snapshot em paralelo).
3. **`CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT`** · destravar `medical_record_attachments` com RLS/storage dedicado.

---

## 12 · Veredito

**PASS_CRM_APPOINTMENT_PROCEDURE_FK_WIRE_READY_LOCAL_COMMIT**

- Types/Repository/Zod/wizard/prontuário wired
- Typegen regenerado · typecheck OK
- Validation pre-apply green · smoke transacional rollback 4/4 PASS
- Zero backfill · zero migration nova · zero hard gate change
- `procedure_name` snapshot e `recurrence_procedure` preservados
- Aguardando autorização para `git push origin main`
