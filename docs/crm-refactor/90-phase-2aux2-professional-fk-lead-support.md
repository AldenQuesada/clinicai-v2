# CRM_PHASE_2AUX.2 · Professional FK + Lead support no wizard

> Refinar profissional como FK first-class no wizard de agendamento + suporte
> seguro a lead. **Sem migration** · DB já tinha tudo. Trabalho concentrado em
> UI/repository/wizard. Zero envio · zero provider · zero `wa_outbox`.

---

## 1. Resumo executivo

DB já tinha o contrato pronto (FK `appointments.professional_id →
professional_profiles.id`, CHECK XOR `lead_id`/`patient_id`, índice
`idx_appt_professional_date`). O gap era **frontend**: wizard usava
`professionalName` como **texto livre** e não suportava agendar
diretamente para um lead.

Mudanças entregues:

- **Repository** `ProfessionalProfilesRepository`: novo método
  `listActiveForAgenda(clinicId)` filtra `is_active=true AND agenda_enabled=true`
  (sem filtro de phone · diferente do `listActiveWithPhone` usado por Mira)
- **Repository** `ProfessionalProfilesRepository`: novo método `getById(id)`
  pra resolver display_name+specialty quando appointment já tem `professional_id`
- **makeRepos** wira o `professionalProfiles` repo no Repos
- **Wizard `/novo` page.tsx**: pre-load profissionais ativos + leads ativos
  + suporte a `?leadId=UUID` prefill
- **Wizard `_form.tsx`** (reescrito):
  - Toggle Subject Type (Paciente / Lead) no step 1
  - Select `professionalId` (FK) no step 2 · não mais texto livre
  - Conflict check passa `professionalId` real
  - Summary mostra nome+especialidade do profissional selecionado
  - Edit mode preserva subject (lead OU patient) e profissional
- **Wizard `/editar` page.tsx**: carrega professionals + leads · força que
  o profissional atual e o lead/patient atual sempre aparecem na lista
  (mesmo se desativados depois)

**Smoke transacional**: 10 cenários PASS · `wa_outbox_delta=0` · ROLLBACK.
**Validation SQL**: todos os flags verdes · `can_continue=true`.

---

## 2. Estado inicial pós-LEGACY.UI.AUDIT

- HEAD inicial: `496d271`
- Branch: `main`
- HEAD == origin/main: sim
- Worker 71 OFF · contratos canônicos prontos
- `wa_outbox`: 0 queued / 0 pending / 0 unsafe

---

## 3. Achados do banco (precheck)

| Item | Valor | Comentário |
|---|---|---|
| FK `appointments.professional_id → professional_profiles.id` | ✅ existe | nada a fazer |
| FK `appointments.lead_id → leads.id` | ✅ existe | nada a fazer |
| FK `appointments.patient_id → patients.id` | ✅ existe | nada a fazer |
| Subject XOR CHECK constraint | ✅ existe (`chk_appt_subject_xor`) | nada a fazer |
| Index `idx_appt_professional_date` | ✅ existe `(clinic_id, professional_id, scheduled_date DESC)` | conflict check rápido |
| `appointments_total` | 3 | dados pré-existentes (pouco volume) |
| `appointments_without_professional` | **3** | todos pré-existentes · débito legado · não-bloqueante |
| `appointments_invalid_professional` | 0 | ✓ |
| `appointments_with_both_subjects` | 0 | ✓ XOR sempre respeitado |
| `appointments_with_neither_subject` | 0 | ✓ |
| `invalid_appointment_status` | 0 | ✓ |
| `phase_perdido_count` | 0 | ✓ |
| `professional_profiles` ativos com agenda_enabled | **6** | pool ok |
| RPCs `appointment_create_via_rpc` / `_update_via_rpc` | ❌ **não existem** | criação/edição via SQL direto na app layer (não RPC) |
| Conflict check RPC dedicada | ❌ **não existe** | check feito em `appointment.repository.ts` (app layer) · OK |

**Decisão: NO MIGRATION needed.** Todos os contratos já existiam. A
mudança foi UI + repository wiring.

---

## 4. Achados do código

### 4.1 Schemas (já estavam corretos)

[`apps/lara/src/app/crm/_schemas/appointment.schemas.ts`](../../apps/lara/src/app/crm/_schemas/appointment.schemas.ts):

- `CreateAppointmentSchema` aceita `professionalId` UUID nullable
- `UpdateAppointmentSchema` aceita `professionalId` UUID nullable
- `CheckAppointmentConflictSchema` aceita `professionalId` UUID nullable
- XOR refinement: exatamente 1 de `leadId`/`patientId` (ou nenhum se `status=bloqueado`)
- Refinements operacionais (duração 15-240min, future date, status canônicos)

**Nada precisou mudar nos schemas.**

### 4.2 Repository `AppointmentRepository.checkConflicts` (já estava correto)

[`packages/repositories/src/appointment.repository.ts`](../../packages/repositories/src/appointment.repository.ts):

- `checkConflicts(clinicId, candidate, excludeId?)` já considera `professionalId`
- Filtra `BLOCKS_CALENDAR` statuses (cancelado/no_show/finalizado/remarcado liberam slot)
- Retorna `{ professional[], room[], patient[] }`

**Nada precisou mudar.**

### 4.3 Repository `ProfessionalProfilesRepository` (gap fechado nesta fase)

Tinha apenas `listActiveWithPhone()` (filtra phone válido pra Mira).
**Adicionado:**

```ts
listActiveForAgenda(clinicId): Promise<AgendaProfessionalDTO[]>
getById(id): Promise<AgendaProfessionalDTO | null>
```

DTO compacto:
```ts
export interface AgendaProfessionalDTO {
  id: string
  displayName: string
  specialty: string | null
  color: string | null
}
```

### 4.4 Wizard `_form.tsx` (reescrito)

Antes (gap original):
- `professionalName` como `<input type=text>` livre
- Comment-TODO no código: `professionalId: null // TODO: integrar professional FK`
- Apenas `patientId` suportado (não tinha caminho pra lead direto)

Depois:
- `professionalId` é `<select>` populado de `listActiveForAgenda`
- Toggle Subject Type (Paciente / Lead) em modo create
- XOR enforced no front + back (Zod + CHECK constraint)
- Conflict check passa `professionalId` real → bloqueia overlap por profissional

### 4.5 `apps/lara/src/lib/repos.ts`

Adicionado `professionalProfiles: ProfessionalProfilesRepository` ao `Repos`
e ao factory `makeRepos`.

---

## 5. Contrato profissional (final · FK first-class)

| Aspecto | Spec |
|---|---|
| Fonte canônica | `public.professional_profiles` |
| FK | `appointments.professional_id → professional_profiles.id` |
| Filtro pool wizard | `is_active=true AND agenda_enabled=true AND clinic_id=app_clinic_id` |
| Wizard | required no step 2 (validateStep2) · não permite passar sem selecionar |
| Edição | preserva profissional original · permite trocar para outro ativo |
| Edição com profissional desativado | mantém na lista (unshift) pra não quebrar |
| Conflict check | `professional_id` real passado · overlap só por mesmo profissional |
| Detail page | mostra `professional_name` (denormalizado) escrito pelo wizard |
| Future filter por profissional | viável (index `idx_appt_professional_date`) |

**Débito conhecido:** 3 appointments pré-existentes sem `professional_id`.
**Não bloqueante** (Wizard requer professional · dados antigos não geram
novos sem professional). Cleanup admin opcional em CONTROL.1.

---

## 6. Contrato lead/patient (XOR · subject excludente)

| Aspecto | Spec |
|---|---|
| Modelo | XOR · `appointments.lead_id` XOR `appointments.patient_id` |
| Exceção | `status='bloqueado'` permite ambos nulos (block-time) |
| DB | `chk_appt_subject_xor` CHECK constraint |
| Frontend | Zod refinement: subjects=1 ou 0 (se status=bloqueado) |
| Wizard create | Toggle UI Paciente / Lead · escolhe 1 source |
| Wizard edit | **NÃO permite trocar subject** (preserva original) |
| Caso "lead virou paciente" | `lead_to_paciente` RPC remapeia · history preservado |
| Lead pool wizard | `phases ∈ {lead, agendado}` + `lifecycle='ativo'` · limit 50 |

---

## 7. Conflict check (já existia · agora alimentado com FK)

Implementado em `AppointmentRepository.checkConflicts`:

```
WHERE clinic_id = $1
  AND scheduled_date = $2
  AND deleted_at IS NULL
  AND status IN BLOCKS_CALENDAR    -- agendado/aguardando_confirmacao/...
  AND id != excludeId              -- edit mode
  AND overlap(start_time, end_time) -- via helper appointmentsOverlap
```

Filtros separados:
- `professional[]` · mesmo `professional_id` e overlap
- `room[]` · mesmo `room_idx` e overlap
- `patient[]` · mesmo `patient_id` OU `lead_id` e overlap

Wizard `_form.tsx` chama `checkAppointmentConflictAction` antes do
step 3 e bloqueia avanço se houver conflict. Servidor revalida no submit
(defesa em profundidade).

---

## 8. UI entregue

### 8.1 `/crm/agenda/novo`

- Toggle Paciente / Lead com contadores `(N)`
- Subject select condicional · dropdown busca por nome + telefone
- Time inputs com `min=today`, duração 15-240min
- **Profissional select** populado de `listActiveForAgenda` (FK)
- Hint quando pool vazio: "habilite em /configuracoes/profissionais"
- Live conflict check ao avançar do step 2
- Visual conflict feedback (✅ ok · ⚠️ conflict · ❌ error)
- Step 4 summary mostra nome+especialidade do profissional selecionado

### 8.2 `/crm/agenda/[id]/editar`

- Bloqueia se status terminal (4 não-editáveis: finalizado/cancelado/no_show/remarcado)
- Preserva subject (patient OU lead) original · select disabled
- Profissional atual incluído na lista mesmo se desativado depois (unshift)
- Lead atual incluído na lista mesmo se já promovido (unshift)

### 8.3 `/crm/agenda/[id]` (detail page · não alterado)

Já mostrava `professional_name` (denormalizado pela criação/edição). Como
o wizard agora escreve o `displayName` real do profissional selecionado,
o detail page reflete a fonte canônica automaticamente.

---

## 9. Migration (não houve)

**Decisão arquitetural:** zero migration nesta fase. O DB já tinha:

- FK `professional_id → professional_profiles.id`
- FK `lead_id → leads.id`, `patient_id → patients.id`
- CHECK `chk_appt_subject_xor`
- Index `idx_appt_professional_date`

Adicionar uma migration de `NOT NULL professional_id` seria prematuro:
3 appointments pré-existentes têm `professional_id IS NULL`. Backfill
exige análise manual (qual profissional? era block-time? agenda antiga?).
Diferido pra CONTROL.1 ou mig dedicada futura.

---

## 10. Smoke transacional (10 cenários PASS · ROLLBACK)

`docs/crm-refactor/sql/phase-2aux2-professional-fk-lead-support-smoke.sql`

| Test | Cobertura | Resultado |
|---|---|---|
| A | Criar appointment patient + professional A | ✅ ok |
| B | Mesmo horário · professional B (allow) | ✅ ok |
| C | Overlap professional A detectado | ✅ 1 (correto) |
| C' | Professional B count separado | ✅ 1 |
| C'' | Professional A horário diferente sem overlap | ✅ 0 |
| D | Appointment lead + professional A | ✅ ok |
| E | XOR check bloqueia lead+patient simultâneos | ✅ blocked |
| F | Status zumbi `em_consulta` rejeitado | ✅ blocked |
| G | Edit preserva subject (patient_id) | ✅ preserved |
| H | FK inválido professional_id rejeitado | ✅ blocked |
| safety | `wa_outbox_delta` | ✅ 0 |
| safety | `worker71_off_still` | ✅ true |

---

## 11. Validation SQL (final flags PASS)

`docs/crm-refactor/sql/phase-2aux2-professional-fk-lead-support-validation.sql`

```json
{
  "worker71_off": true,
  "professional_fk_ready": true,
  "professional_index_ready": true,
  "subject_xor_ready": true,
  "lead_support_ready": true,
  "professionals_with_agenda_enabled": 6,
  "appointments_without_professional": 3,
  "appointments_invalid_professional": 0,
  "appointments_xor_violations": 0,
  "invalid_appointment_status_count": 0,
  "phase_perdido_count": 0,
  "unsafe_outbox_count": 0,
  "can_continue": true
}
```

---

## 12. O que NÃO foi feito (escopo controlado)

- ❌ Escala/disponibilidade semanal do profissional
- ❌ Múltiplos profissionais por consulta (single FK por enquanto)
- ❌ Sala física no wizard (deferido · `room_idx` ainda usado em conflict)
- ❌ Backfill dos 3 appointments antigos sem professional_id (CONTROL.1 audit)
- ❌ Filtros de agenda por profissional (próx fase · LEGACY.PORT.DASHBOARDS)
- ❌ Drag-and-drop reschedule (fora do escopo)
- ❌ RPC dedicada `appointment_create_via_rpc` (app layer atual é suficiente)

---

## 13. Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| 3 appointments sem `professional_id` históricos | 🟢 baixo | Não-bloqueante · wizard novo exige · cleanup em CONTROL.1 |
| Pool de professionais vazio bloqueia wizard | 🟡 médio | UI mostra hint "habilite em /configuracoes/profissionais" |
| `lead.name` pode ser null (DTO) | 🟢 baixo | Fallback "Sem nome" no `.map()` da page.tsx |
| Lead pool limitado a 50 mais recentes | 🟢 baixo | Search server-side futuro se clínica passar do limite |
| Não tem RPC atomic de create+conflict | 🟢 baixo | Race window mínima · conflict check + insert mesmo client session |
| Edit não permite trocar subject | 🟡 médio | UX deliberado · evita corrupção histórica · alternativa: cancelar+criar novo |

---

## 14. Próxima fase

Ver [`91-next-prompt-after-2aux2.md`](91-next-prompt-after-2aux2.md).

Recomendado:
- **CRM_PHASE_LEGACY.PORT.DASHBOARDS** · funil/SDR por profissional (agora viável)
- ou **CRM_PHASE_2ALEXA.1** · polish do AlertBell (UX rápido)
- ou **CRM_PHASE_CONTROL.1** · audit final + cleanup dos 3 appointments sem professional + 18 zumbi pg_proc + 9 Alexa RPCs dormentes
