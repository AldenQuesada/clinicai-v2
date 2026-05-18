# Round 1 · Agenda Foundation · Audit Matrix + Patch Plan

> CRM_AUDIT_1X1_PARITY_RESTORATION · branch `crm/parity-r1-agenda-foundation` · doc-only até GO de apply.

## Precheck

| Repo | Branch | HEAD | Working tree |
|------|--------|------|--------------|
| clinicai-v2 | `crm/parity-r1-agenda-foundation` (criada) | `2b157f9` (origin/main) | untracked: docs/audits + test-results · sem dirty funcional |
| clinic-dashboard | `master` | `d991418` | só `supabase/.temp/cli-latest` (cli auto-update · não nosso) |

Canonical phase grep em código (`apps/**`, `packages/**`, `db/**`): **0 matches** de `phase=compareceu|phase='compareceu'|compareceu.*phase|phase.*perdido|perdido.*phase`. ✅ Não há regressão canônica.

## ⚠️ DISCREPÂNCIAS DO AUDIT 1×1 PRÉVIO

Ao ler o estado real do código antes de patches, encontrei que **vários gaps reportados estavam superestimados**. Atualização explícita (rule 5: "não corrigir no escuro"):

| Gap ID | Audit reportou | Estado real | Veredito |
|--------|----------------|-------------|----------|
| M-02 (Toggle Novo/Retorno) | ❌ ausente em v2 | ✅ `CONSULT_TYPE_OPTIONS` em [`_form.tsx:242-248`](../../../apps/lara/src/app/crm/agenda/novo/_form.tsx) com valores `consulta / avaliacao / retorno / procedimento` | **JÁ IMPLEMENTADO** · sair do escopo R1 |
| M-08 (Tipo Consulta vs Procedimento) | ❌ indistinguíveis | ✅ Mesmo enum acima cobre · `consultType` no Zod | **JÁ IMPLEMENTADO** · sair do escopo R1 |
| M-16 (Forma pagamento 10→5) | ❌ regressão crítica | ✅ `PAYMENT_METHOD_OPTIONS` em `_form.tsx:208-220` tem 10 formas (PIX, dinheiro, débito, crédito, parcelado, entrada+saldo, boleto, link, cortesia, convênio) · texto livre · `paymentStatus` enum mig 152 com 5 valores é coisa separada (status agregado) | **JÁ IMPLEMENTADO** · sair do escopo R1 |
| M-22 (Motivo cortesia/isento) | ⚠ per-item perdido | ✅ `motivoPagamento` campo em `_form.tsx:172` · `PAYMENT_STATUS_REQUIRES_MOTIVO` set linha 232 enforce client-side | **PARCIAL** (per-item ainda falta — Round 2) |
| D-17 / S-03 (Conflict message com nome) | ❌ sem nome | ✅ `_form.tsx:967-981` já renderiza `"Profissional ocupado · {professionalName} já tem consulta {start}–{end} com {subjectName}"` · `ConflictDetailEntry` em [`appointment.actions.ts:133-205`](../../../apps/lara/src/app/crm/_actions/appointment.actions.ts) popula `professionalName/subjectName` | **JÁ IMPLEMENTADO** · sair do escopo R1 |
| V-03 (Antecedência mínima) | ❌ ausente em v2 | ✅ Cliente: `checkMinAdvance` em `_components/agenda-validation.ts` + prop `antecedenciaMinHoras` em `_form.tsx:128` | **PARCIAL** (só cliente · server-action não enforça · gap real reduzido) |
| V-04 (Horário expediente) | ❌ ausente em v2 | ✅ Cliente: `checkInPeriods` + `getClinicDay` + prop `operatingHours` | **PARCIAL** (idem V-03) |

**Impacto:** Round 1 deveria criar `appointment_type` enum, toggle de tipo, 10 payment forms · todos já existem. Escopo real de R1 fica enxuto e mais honesto.

## ESCOPO REAL DE ROUND 1 (gaps verificados)

| # | Gap ID | Descrição | Arquivos alvo | Função/Componente | Risco | Rollback |
|---|--------|-----------|---------------|--------------------|-------|----------|
| R1.1 | **D-04 / V-10** Profissional em férias | `professional_profiles.ferias` jsonb ausente · sem helper `isOnVacation` · sem enforcement server | mig 188 + `packages/repositories/src/professional-profiles.repository.ts` + `apps/lara/src/app/crm/_actions/appointment.actions.ts` | `isOnVacation(prof, date)` + chamada em createAppointment/updateAppointment | baixo · coluna jsonb default `[]` | down migration drop column |
| R1.2 | **M-04 / D-15** Sala select no form + `room_id` FK | `appointments.room_id uuid FK` ausente · UI sem select · `clinic_rooms` existe legacy mas v2 só tem `room_idx integer NULL` | mig 190 + `_form.tsx` step 2 + novo `packages/repositories/src/room.repository.ts` + `appointment.schemas.ts` aceita `roomId` | UI new component + schema novo | médio · FK nullable + manter `room_idx` deprecado | drop column · down restore |
| R1.3 | **D-03** Auto-link prof→sala | `professional_profiles.sala_id` ausente em v2 (legacy tinha) · cascade NULL em room soft-delete | mig 189 + repo helper + form watch professional change | onProfessionalChange → setRoomId | baixo · FK nullable | drop column |
| R1.4 | **V-03 / V-04** Server enforcement antecedência + expediente | helpers `checkMinAdvance` + `checkInPeriods` existem só client-side | `appointment.actions.ts createAppointmentAction` + `updateAppointmentAction` re-call helpers no servidor | re-call validators server-side | baixo (apenas adiciona check defensivo) | revert action edit |
| R1.5 | **E2E** `crm-agenda-foundation.spec.ts` | spec ausente | `apps/lara/tests/e2e/crm-agenda-foundation.spec.ts` (novo) | 6 cenários (sala válida, profissional férias, fora expediente, antecedência, conflict nomes, procedimento obrigatório) | Playwright local | spec é additive · sem rollback necessário |

## Plano de patch (ordem)

### Fase A · Migrations (THIS TURN)

1. `db/migrations/20260800000188_clinicai_v2_professional_profiles_ferias.sql` (+ down)
   - ADD COLUMN `ferias jsonb NOT NULL DEFAULT '[]'::jsonb`
   - CHECK: cada elemento `{start_date, end_date, reason?}`
   - INDEX GIN para queries de período

2. `db/migrations/20260800000189_clinicai_v2_professional_profiles_sala_id.sql` (+ down)
   - ADD COLUMN `sala_id uuid NULL` FK → `clinic_rooms(id)` ON DELETE SET NULL
   - INDEX parcial em sala_id WHERE NOT NULL

3. `db/migrations/20260800000190_clinicai_v2_appointments_room_id.sql` (+ down)
   - ADD COLUMN `room_id uuid NULL` FK → `clinic_rooms(id)` ON DELETE SET NULL
   - INDEX parcial em room_id WHERE NOT NULL
   - **NÃO** dropar `room_idx` (deprecation gradual em Round 5)

### Fase B · Repositories + Actions (NEXT TURN)

4. `packages/repositories/src/professional-profiles.repository.ts`
   - Estender `AgendaProfessionalDTO` com `defaultRoomId: string | null`
   - Estender select para incluir `sala_id, ferias`
   - Novo método `isOnVacation(professionalId: string, date: string): Promise<boolean>`
   - Novo método `listVacationPeriods(professionalId: string): Promise<VacationPeriod[]>`

5. `packages/repositories/src/room.repository.ts` (novo)
   - Wrap RPCs legacy `get_rooms / upsert_room / soft_delete_room`
   - Método `listActive(clinicId): Promise<RoomDTO[]>`
   - Método `getById(id): Promise<RoomDTO | null>`

6. `apps/lara/src/app/crm/_schemas/appointment.schemas.ts`
   - `CreateAppointmentSchema` + `UpdateAppointmentSchema`: aceitar `roomId: z.string().uuid().nullable().optional()`

7. `apps/lara/src/app/crm/_actions/appointment.actions.ts`
   - Server-side enforcement em `createAppointmentAction` + `updateAppointmentAction`:
     - chamar `repos.professionals.isOnVacation()` → fail `professional_on_vacation`
     - chamar helpers `checkMinAdvance` + `checkInPeriods` server-side
   - Passar `roomId` em `appointments.insert/update`

### Fase C · UI (NEXT TURN)

8. `apps/lara/src/app/crm/agenda/novo/page.tsx`
   - server fetch `room.repository.listActive()` + `professional-profiles.repository.listActiveForAgenda()` (já existe) e passar como prop

9. `apps/lara/src/app/crm/agenda/novo/_form.tsx`
   - Adicionar `rooms: ReadonlyArray<RoomOption>` à prop
   - Adicionar `roomId` no FormState
   - Step 2: render Select de sala
   - onProfessionalChange: auto-set `roomId = prof.defaultRoomId`
   - Mensagens de erro:
     - "Dr. X em férias entre dd/mm e dd/mm"
     - "Fora do expediente da clínica"
     - "Antecedência mínima de N horas"

### Fase D · E2E (NEXT TURN)

10. `apps/lara/tests/e2e/crm-agenda-foundation.spec.ts`
    - cenário 1: agendar com sala válida → ✅ row criada com `room_id NOT NULL`
    - cenário 2: profissional em férias → erro `professional_on_vacation` + texto verbatim
    - cenário 3: fora do expediente → erro
    - cenário 4: antecedência mínima → erro com horas
    - cenário 5: conflict de sala com nome do paciente
    - cenário 6: procedimento obrigatório quando tipo=procedimento

### Fase E · Audit-check + Deploy (NEXT TURN)

11. `pnpm --filter @clinicai/lara typecheck`
12. `pnpm --filter @clinicai/lara test`
13. `pnpm --filter @clinicai/lara e2e --grep "crm-agenda-foundation"` (se Playwright instalado)
14. `git diff --check`
15. SQL probes pós-migration (read-only):
    - `SELECT column_name FROM information_schema.columns WHERE table_name='professional_profiles' AND column_name IN ('ferias','sala_id')` → 2 rows
    - `SELECT column_name FROM information_schema.columns WHERE table_name='appointments' AND column_name='room_id'` → 1 row
    - `SELECT COUNT(*) FROM appointments WHERE room_id IS NOT NULL` (deve ser 0 inicialmente · backfill em Round 5)
    - `SELECT phase FROM leads GROUP BY phase` → só `{lead, agendado, paciente, orcamento}` (canon check)
16. Commit pequenos por fase + push
17. Preview deploy via push (Vercel/Easypanel auto)
18. Production deploy: flags default OFF (`crm_v2_room_select_enabled`, `crm_v2_ferias_check_enabled`) · ativação manual depois

## Safety + Confirmações negativas

- Worker 71: **OFF** durante todo R1
- wa_outbox: **zero delta** durante migrations + tests
- Provider calls: **zero**
- Real WhatsApp: **zero**
- Cron alteration: **zero**
- Env/secrets exposed: **zero**
- RLS: cada migration mantém policies existentes
- GRANTs: explicit em cada migration (sem anon write)

## STOP triggers honored

- ✅ Audit discrepancy detectada e reportada antes de patch
- ✅ Compareceu phase: 0 matches em código
- ✅ Perdido phase: 0 matches em código
- ✅ Auditando contra estado real, não contra audit doc stale

## Next prompt automático após PASS R1

Round 2 · Procedures + Payments — só dispara após:
- 3 migrations applied OK
- Repos + actions OK
- UI sala select funcional
- E2E `crm-agenda-foundation` PASS
- Git diff --check clean
- Push branch + preview deploy verde
