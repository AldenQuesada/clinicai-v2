# Round 1 · Phase C · Audit-Check Report

> CRM_PARITY_R1_PHASE_C_AUDIT_CHECK · branch `crm/parity-r1-agenda-foundation` · zero commit · 2026-05-18

## Resumo

| Item | Resultado |
|------|-----------|
| Verdict | **PARTIAL_CRM_PARITY_R1_PHASE_C_BLOCKED_BY_PREEXISTING_RPC_RISK** |
| Comentários canônicos R1 corrigidos | ✅ 2 lugares (appointment.repository.ts + appointment-state.ts) |
| Migrations 188-190 audit | ✅ PASS |
| RoomId data flow | ✅ PASS |
| Vacation enforcement | ✅ PASS |
| Clinic settings server-side | ⚠ PASS com **TIMEZONE_RISK** pré-existente |
| False positives preservados | ✅ confirmados |
| Typecheck (repos + lara) | ✅ PASS |
| RPC `appointment_attend` audit | ⚠ **PRE-EXISTING residual UPDATE phase='compareceu' em mig 65 · não introduzido por R1** |

---

## C0 · Precheck

- Branch: `crm/parity-r1-agenda-foundation`
- HEAD: `2b157f9` (origin/main · zero commit)
- diff stat: 12 arquivos modificados, +425 / -15 (escopo R1)
- Untracked: migrations 188-190 + docs + e2e spec + room.repository.ts

## C1 · Comentário canônico corrigido

| File | Linha | Estado |
|------|-------|--------|
| `packages/repositories/src/appointment.repository.ts` | 322-340 | ✅ Substituído. Novo texto deixa claro: `appointment_attend` move appointment.status para `na_clinica`; **NÃO altera leads.phase** (Phase 1C canon · mig 150). Inclui ⚠ flag sobre código residual em mig 65 SQL. |
| `packages/repositories/src/helpers/appointment-state.ts` | 81-84 | ✅ Substituído. canMarkArrived comment agora diz: "NÃO altera leads.phase". |

Ambos doc-only · zero runtime change.

## C2 · Audit canon

### Grep em código funcional (`apps,packages,db/src`)
```
phase=compareceu | phase='compareceu' | compareceu.*phase | phase.*perdido | perdido.*phase
```

#### Em código funcional (apps + packages src · não-`.d.ts`)
- ✅ Zero violation em runtime code (R1-tocado)
- ⚠ `packages/repositories/src/lead.repository.ts:627, 653` ainda diz "Exige phase=compareceu" — refere às RPCs `lead_to_paciente` (mig 65, sem patch posterior — ainda gateia compareceu na SQL) e `lead_to_orcamento` (mig 187 já patchou — comment está stale). **Fora do escopo R1** (não tocado por nenhuma path nova). Recomendo round dedicado para alinhar SQL + docstring.
- ⚠ `packages/repositories/src/types/dtos.ts:216` é doc de `source_lead_phase_at` (timestamp histórico, não phase ativa). Tolerável.

#### Em migrations
- mig 60, 64, 65, 72, 103 (originais · 7-phase enum): patched por mig 150 (chk_leads_phase = 4 phases).
- mig 150 (retroapply): canônico 4-phase
- mig 187 (patch lead_to_orcamento): remove gate phase='compareceu'

### RPC `appointment_attend` (mig 65 linhas 328-418)

| Aspecto | Estado |
|---------|--------|
| Define `appointment_attend(uuid, timestamptz)` | sim |
| Tenta `UPDATE leads SET phase='compareceu'` (linha 395) | **SIM · código residual** |
| Guard `_lead_phase_transition_allowed(v_lead.phase, 'compareceu')` | sim (linha 392) |
| `_lead_phase_transition_allowed` permite `agendado → compareceu` post mig 150? | **SIM · mig 65 L63 ainda contém** |
| Patch posterior dessa função? | **NÃO encontrado** em db/migrations/* até mig 190 |
| CHECK constraint `chk_leads_phase` (mig 150) bloqueia 'compareceu'? | **SIM** |
| Resultado runtime esperado | Se `_lead_phase_transition_allowed` returna TRUE, UPDATE viola CHECK → transação rollback → RPC retorna erro. Se a função foi patchada out-of-band (Supabase Studio direto) para canon-compliant, UPDATE não fira e tudo OK. |
| E2E `appointment-attend-finalize.spec.ts:163` espera lead.phase=agendado pós-attend | Só passa se runtime canon-compliant |

**Veredito**: pre-existing risk · não introduzido por R1. Patch correto seria nova migration replicando padrão de mig 187 para `appointment_attend` + `_lead_phase_transition_allowed` (remover compareceu/reagendado dos alvos). Fora do escopo R1.

**Recomendação**: o usuário deve decidir:
- (A) Aplicar Phase D commit/push do R1 atual (escopo enxuto sólido) · agendar round dedicado para hot-fix mig 65 RPC
- (B) Bloquear R1 até criar a hot-fix migration · escopo R1 ganha mais 2 arquivos SQL

Por respeitar o escopo R1 ("Não fazer R2-R7" + "não migration repair sem necessidade comprovada"), eu não fui além de comentário.

## C3 · Audit migrations 188-190

| Item | mig 188 (ferias) | mig 189 (sala_id) | mig 190 (room_id) |
|------|------------------|---------------------|---------------------|
| BEGIN/COMMIT | ✅ | ✅ | ✅ |
| IF NOT EXISTS | ✅ ADD COLUMN | ✅ ADD COLUMN | ✅ ADD COLUMN + CREATE INDEX |
| No DROP no up | ✅ (só DROP CONSTRAINT IF EXISTS antes do CHECK recreate · seguro) | ✅ | ✅ |
| ON DELETE | n/a (não-FK) | ✅ SET NULL | ✅ SET NULL |
| ON UPDATE | n/a | ✅ CASCADE (UUIDs trivial) | ✅ CASCADE |
| FK aponta para clinic_rooms(id) | n/a | ✅ | ✅ |
| Index | ✅ GIN parcial em ferias com jsonb_array_length > 0 | ✅ btree parcial em sala_id WHERE NOT NULL | ✅ btree parcial em room_id WHERE NOT NULL + composite (room_id, scheduled_date) WHERE NOT NULL AND deleted_at IS NULL |
| Default seguro | ✅ `'[]'::jsonb` + CHECK array | n/a (nullable) | n/a (nullable) |
| RLS / anon write impact | ✅ herda policies existentes · zero novas | ✅ idem | ✅ idem |
| GRANTs novos | ✅ zero | ✅ zero | ✅ zero |
| Down script | ✅ DROP INDEX + DROP CONSTRAINT + DROP COLUMN | ✅ DROP INDEX + DROP COLUMN | ✅ DROP INDEX (2) + DROP COLUMN |
| Não dropa coluna pré-existente | ✅ | ✅ | ✅ (room_idx legacy preservado para deprecation gradual em Round 5/7) |
| Não adiciona NOT NULL perigoso | ✅ ferias tem default seguro `'[]'` | ✅ NULL | ✅ NULL |
| Naming consistente | ✅ `20260800000NNN_clinicai_v2_*` | ✅ | ✅ |

Conclusão: **3 migrations seguras pra apply controlado**. Zero risco de quebrar rows existentes.

## C4 · RoomId data flow audit

| Camada | Arquivo | Função/símbolo | Status | Observação |
|--------|---------|------------------|--------|------------|
| DTO | `packages/repositories/src/types/dtos.ts` | `AppointmentDTO.roomId: string \| null` | ✅ | Coexiste com `roomIdx` (legacy) |
| Input · create | `packages/repositories/src/types/inputs.ts` | `CreateAppointmentInput.roomId?: string \| null` | ✅ | nullable optional |
| Input · update | mesmo file | `UpdateAppointmentInput.roomId?: string \| null` | ✅ | nullable optional |
| Mapper | `packages/repositories/src/mappers/appointment.ts:24` | `roomId: row.room_id ?? null` | ✅ | em paralelo ao roomIdx |
| APPT_COLUMNS | `packages/repositories/src/appointment.repository.ts:36-43` | inclui `room_id` | ✅ | |
| Repo · create | mesmo file linha ~189 | `row.room_id = input.roomId ?? null` | ✅ | |
| Repo · update | mesmo file linha ~228 | `if (input.roomId !== undefined) row.room_id = input.roomId` | ✅ | undefined-aware permite limpar |
| Repo · checkConflicts | mesmo file linha ~471 | aceita `roomId?: string \| null` · prioriza sobre `roomIdx` | ✅ | Fallback legacy preservado |
| Zod · create | `apps/lara/src/app/crm/_schemas/appointment.schemas.ts:80` | `roomId: z.string().uuid().nullable().optional()` | ✅ | |
| Zod · update | mesmo file linha ~167 | idem | ✅ | |
| Zod · conflict | mesmo file linha ~229 | idem | ✅ | |
| Action · create | `apps/lara/src/app/crm/_actions/appointment.actions.ts` | `roomId: parsed.data.roomId ?? null` passado a checkConflicts + repo.create | ✅ | |
| Action · update | mesmo file | resolução `patch.roomId !== undefined ? patch.roomId : current.roomId` + passada a checkConflicts + repo.update | ✅ | |
| Action · check | mesmo file | passa `roomId: parsed.data.roomId ?? null` | ✅ | |
| UI · page server fetch | `apps/lara/src/app/crm/agenda/novo/page.tsx` | `repos.rooms.listActive(ctx.clinic_id).catch(() => [])` + mapeia para prop `rooms` | ✅ | Fail-soft |
| UI · form props | `apps/lara/src/app/crm/agenda/novo/_form.tsx` | `rooms?: ReadonlyArray<RoomOption>` default `[]` | ✅ | |
| UI · auto-link | mesmo file | `set('professionalId', ...)` lê `nextProf.defaultRoomId` se user não touched | ✅ | |
| UI · select sala | mesmo file step 2 | render condicional se `rooms.length > 0` | ✅ | |
| UI · conflict check | `runConflictCheck` | envia `roomId: data.roomId \|\| null` | ✅ | |
| UI · submit create | mesmo file | envia `roomId: data.roomId \|\| null` | ✅ | |
| UI · submit update | mesmo file | envia `roomId: data.roomId \|\| null` (edit page) | ✅ | |
| Edit prefill | `apps/lara/src/app/crm/agenda/[id]/editar/page.tsx:174` | mapeia `defaultRoomId` no `professionalsForForm` | ✅ | typecheck fix |
| `EditingPrefill.roomId?` | `_form.tsx` interface | opcional · UI usa `editing?.roomId ?? professional.defaultRoomId` | ✅ | |
| Repos factory | `apps/lara/src/lib/repos.ts` | `RoomRepository` registrado | ✅ | |
| Barrel | `packages/repositories/src/index.ts` | exporta `RoomRepository`, `RoomDTO`, `VacationPeriod` | ✅ | |

**Status**: data flow completo · 22 pontos validados.

## C5 · Vacation enforcement audit

| Item | Estado |
|------|--------|
| `professional_profiles.ferias` schema | jsonb NOT NULL DEFAULT `'[]'` com CHECK `jsonb_typeof(ferias) = 'array'` (mig 188) |
| `VacationPeriod` type exposto | ✅ `packages/repositories/src/professional-profiles.repository.ts` linha ~40 + re-export em index.ts |
| `isOnVacation(professionalId, dateIso)` | ✅ retorna `VacationPeriod \| null` · valida formato date · fail-safe (catch erro → null) |
| `getById` lê ferias? | ❌ Não exposto via DTO (mantido enxuto · vacation acessada via `isOnVacation` dedicado). Aceitável. |
| `listActiveForAgenda` lê defaultRoomId? | ✅ inclui `sala_id` no SELECT, mapeia para `defaultRoomId` |
| Server enforcement | ✅ `enforceScheduleConstraintsServerSide` em `appointment.actions.ts` chama `professionalProfiles.isOnVacation(professionalId, scheduledDate)` |
| Erro retornado | ✅ `professional_on_vacation` com `detail: { start_date, end_date, reason }` |
| Mensagem na UI | ✅ `_form.tsx` formata "Dr. X em férias entre dd/mm e dd/mm · reason" |
| Skip se professionalId null | ✅ guard |

Limitação aceitável: **somente bloqueia se `scheduledDate` cai dentro do período**. Não checa overlap parcial multi-dia (não é caso de uso · férias são em dias inteiros).

## C6 · Clinic settings server-side audit

| Item | Estado |
|------|--------|
| Imports `checkInPeriods`, `checkMinAdvance`, `getClinicDay` | ✅ em `appointment.actions.ts` |
| Import `loadClinicSettingsAction` | ✅ |
| Helper `enforceScheduleConstraintsServerSide` | ✅ |
| Chamado em createAppointmentAction | ✅ |
| Chamado em updateAppointmentAction (quando scheduleChanged) | ✅ |
| fail-soft em settings indisponível | ✅ retorna null (não bloqueia) · justificativa: defesa fica em conflict check + CHECK constraints |
| Retorna `min_advance_required` | ✅ com `detail.message` + `detail.min_hours` |
| Retorna `outside_working_hours` | ✅ com `detail.message` |

### ⚠ TIMEZONE_RISK (pre-existing)

`agenda-validation.ts` usa `new Date(...)`:
- linha 36: `new Date(y, m - 1, d)` — interpreta data no TZ local do processo Node.js
- linha 121: `now: Date = new Date()`
- linha 128: `new Date(\`\${scheduledDate}T\${startTime.slice(0,5)}:00\`)` — string sem TZ offset

**Risco**: Em prod (cloud · Node.js geralmente UTC), `2026-06-15 14:00` é interpretado como 14:00 UTC. Clínica em America/Sao_Paulo (UTC-3): paciente vê "14:00" mas servidor pensa que é "14:00 UTC = 11:00 BRT". Drift de até 3h em validações de antecedência + expediente.

**Status pré-existente**: introduzido em CRM_PARITY_PATCH_0A (antes do R1). R1 apenas adicionou um segundo call-site (server-side) usando os mesmos helpers — amplifica o risco se TZ do servidor diferir do TZ do cliente.

**Mitigação atual**:
- Cliente também valida (no browser, TZ local do usuário · provavelmente BRT correto)
- Server enforcement é defense-in-depth · drift de 3h apenas faz a regra "antecedência" ser conservadora ou liberal por 3h, não rejeita maliciously
- `checkInPeriods` checa `start >= período.inicio && end <= período.fim` em minutos · drift constante não muda relação

**Recomendação**: Criar helper `clinicNow(clinicTimezone)` em pacote utils que aceita timezone vinda de clinic_settings. Fora do escopo R1 (não é regressão · é débito técnico pré-existente).

Veredito: **NÃO BLOQUEIA Phase D** mas registrar para próximo round dedicado à precisão temporal.

## C7 · False positives preservation audit

| Falso positivo do audit antigo | Estado atual | R1 mexeu? |
|---------------------------------|---------------|-----------|
| `CONSULT_TYPE_OPTIONS` (`_form.tsx:242-248`) com `consulta/avaliacao/retorno/procedimento` | ✅ preservado | ❌ não tocado |
| `PAYMENT_METHOD_OPTIONS` (`_form.tsx:208-220`) com 10 formas | ✅ preservado | ❌ não tocado |
| Conflict detail rendering com nome (`_form.tsx:967-981`) | ✅ preservado | ❌ não tocado |
| `checkMinAdvance` + `checkInPeriods` client-side em `_components/agenda-validation.ts` | ✅ preservado | ❌ não tocado (R1 só adicionou call-site server-side) |
| `ConflictDetailEntry` em `appointment.actions.ts:133` populado com `professionalName`+`subjectName` | ✅ preservado | ❌ não tocado |
| `_form.tsx` step 2 select de profissional + auto-conflict | ✅ preservado | extensão: select de sala adicionado abaixo, não substitui |

**Status**: zero regressão de funcionalidade pré-existente.

## C8 · Tests / typecheck

| Comando | Resultado |
|---------|-----------|
| `pnpm --filter @clinicai/repositories typecheck` | ✅ PASS |
| `pnpm --filter @clinicai/lara typecheck` | ✅ PASS |
| `git diff --check` | ✅ exit 0 (só warning de CRLF) |
| Unit tests | ⏸ não executados (Fase C não exigiu obrigatório · escopo audit) |
| E2E `crm-agenda-foundation` | ⏸ não rodado (precisa TEST_SUPABASE envs + migrations aplicadas) |
| Spec compila / é detectável | ✅ arquivo em `apps/lara/e2e/authed/crm-agenda-foundation.spec.ts` · 5 cenários (R1.1-R1.5) |

## C9 · Safety checks

| Check | Resultado |
|-------|-----------|
| Worker 71 OFF | ⚠ NOT_CHECKED_DB_UNAVAILABLE (sem credenciais ativas nesta sessão) · diff zero em cron.job |
| wa_outbox unchanged | ⚠ NOT_CHECKED_DB_UNAVAILABLE · diff zero em wa_outbox table refs |
| Provider calls (Evolution/Meta) | ✅ zero em diff (grep no diff = 0 matches) |
| Cron touched | ✅ zero (nenhuma `cron.schedule` / `cron.alter_job` no diff) |
| Env / secrets | ✅ zero em diff |
| RLS leak | ✅ migrations 188-190 não alteram policies · herdam existentes |

## C10 · Verdict + Next step

### Verdict: **PARTIAL_CRM_PARITY_R1_PHASE_C_BLOCKED_BY_PREEXISTING_RPC_RISK**

R1 patches estão sólidos · typecheck verde · falsos positivos preservados · escopo enxuto.

Bloqueio pré-existente: mig 65 `appointment_attend` RPC contém SQL residual `UPDATE leads SET phase='compareceu'` guardado por `_lead_phase_transition_allowed`. Pós mig 150, esse path deveria ser dead-code (CHECK constraint rejeitaria), MAS:
- Sem patch versionado da função `_lead_phase_transition_allowed` em db/migrations/* posterior a mig 65
- Sem DB access nesta sessão, não posso confirmar se foi patchado out-of-band em prod
- E2E `appointment-attend-finalize.spec.ts:163` confirma canon-compliant runtime, mas requer DB para executar

### Próximo passo · 2 opções

**Opção A** (recomendada): aceitar PARTIAL → seguir para `GO CRM_PARITY_R1_PHASE_D_COMMIT_PUSH_DEPLOY_CONTROLLED`. Após R1 mergeado, criar mini-round dedicado para hot-fix mig 65 (`_lead_phase_transition_allowed` + `appointment_attend`) seguindo padrão da mig 187.

**Opção B**: bloquear R1 até criar a hot-fix migration agora (1 .sql + 1 .down.sql) + atualizar typecheck. Sobe escopo R1 em ~80 linhas SQL.

Aguardando GO explícito do usuário. Branch viva, zero commit.
