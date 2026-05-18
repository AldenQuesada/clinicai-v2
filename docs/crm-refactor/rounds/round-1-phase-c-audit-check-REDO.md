# Round 1 · Phase C · Audit-Check REDO after Canonical Hotfix

> CRM_PARITY_R1_PHASE_C_AUDIT_CHECK_REDO_AFTER_CANON_HOTFIX · branch `crm/parity-r1-agenda-foundation` · zero commit · 2026-05-18

## Verdict

**`PASS_CRM_PARITY_R1_PHASE_C_AUDIT_CHECK_READY`**

Mig 191 resolveu o bloqueio canônico pré-existente. R1 inteiro está limpo, callers compatíveis, falsos positivos preservados, typecheck verde em ambos pacotes. Pronto para Phase D commit/push/deploy controlado.

## C0 · Precheck

- Branch: `crm/parity-r1-agenda-foundation`
- HEAD: `2b157f9` · zero commit
- Working tree esperado:
  - 16 modified (TS/TSX backend + UI + comments)
  - 8 new migration files (188 up/down + 189 up/down + 190 up/down + 191 up/down)
  - 1 new E2E spec (`crm-agenda-foundation`)
  - 1 new repository (`room.repository.ts`)
  - 3 new docs (rounds/round-1-* x3)
- Diff stat: 16 files, +474 / -34

## C1 · MIG_191_CANON_AUDIT

| Item | Status | Evidência | Risco |
|------|--------|-----------|-------|
| Não edita migrations históricas | ✅ | `git status` zero "M" em mig 65/72/150/151/167/187 | nenhum |
| `CREATE OR REPLACE FUNCTION` × 3 | ✅ | `_lead_phase_transition_allowed`, `appointment_attend`, `lead_to_paciente` | nenhum |
| Assinatura `appointment_attend(uuid, timestamptz)` preservada | ✅ | linha 138-140 da mig | nenhum |
| Assinatura `lead_to_paciente(uuid, numeric, ts, ts, text)` preservada | ✅ | linha 219-224 | nenhum |
| Return shape compatível com callers | ✅ | `jsonb_build_object('ok', ..., 'appointment_id', ..., 'idempotent_skip', ..., 'status_after', ...)` mantido | nenhum |
| SECURITY DEFINER + search_path | ✅ | linhas 145-146 (attend) + 227-228 (lead_to_paciente) · `LANGUAGE sql IMMUTABLE` para helper (107-109) | nenhum |
| GRANTs não quebrados | ✅ | `CREATE OR REPLACE` preserva grants existentes (mig 65 + 187 padrão) | nenhum |
| `_lead_phase_transition_allowed` NÃO aceita compareceu | ✅ | grep no body retorna 0 (matriz só 4 phases canon) | nenhum |
| `_lead_phase_transition_allowed` NÃO aceita reagendado | ✅ | idem | nenhum |
| `_lead_phase_transition_allowed` `→ perdido` aceito | ✅ | linhas 117-122 · documentado como legacy compat (lifecycle real via lead_lost) | aceitável |
| `appointment_attend` NÃO contém `UPDATE leads SET phase` | ✅ | grep no body do bloco BEGIN..END retorna 0 | nenhum |
| `appointment_attend` NÃO contém `compareceu` em runtime | ✅ | apenas em comment header e canon-flag inline (linha 195) | nenhum |
| `appointment_attend` não toca wa_outbox/pg_net/provider | ✅ | grep no body · zero matches | nenhum |
| `lead_to_paciente` gate canônico | ✅ | linhas 256-262: `IF v_lead.phase NOT IN ('lead', 'agendado') THEN illegal_transition` · `IF v_lead.lifecycle_status IS DISTINCT FROM 'ativo' THEN lifecycle_locked` | nenhum |
| Down script tem aviso `DO NOT USE FOR PRODUCTION` | ✅ | linha 5 do down | nenhum |
| Down script não é auto-executado | ✅ | naming `.down.sql` separado · não é incluído pelo apply script default | nenhum |

## C2 · Canon grep final

### Runtime TS (`apps/lara/src/**/*.ts` + `packages/repositories/src/**/*.ts`)
- `phase = 'compareceu'` ou `phase='compareceu'` em runtime: **0 matches**
- `phase = 'perdido'` em runtime: **0 matches**

### SQL migrations
- `UPDATE.*phase.*=.*'compareceu'`:
  - mig 191 up:12 — comment header explicando o que mig 65 ainda contém ✅
  - mig 191 down:11 — aviso de rollback ✅
  - mig 191 down:104 — corpo do rollback (intencional) ✅
  - **Zero em mig 188/189/190**

### Build artifacts `.d.ts`
- 4 hits stale (regeneram em próximo build) · não-bloqueante

### Docs / SQL validation scripts
- Hits históricos canon-flagged (audit pré-correção · não funcional)

**Veredito grep**: zero violação em runtime · todas as menções em código TS são docstrings canon-flagged · todas as menções em SQL são canon-flagged ou rollback.

## C3 · RPC_CALLER_COMPAT_AUDIT

| Caller TS | Path | Assinatura usada | Compat com mig 191? |
|-----------|------|-------------------|------------------------|
| `repos.appointments.attend()` | `packages/repositories/src/appointment.repository.ts:350` | `supabase.rpc('appointment_attend', {p_appointment_id, p_chegada_em})` | ✅ |
| `attendAppointmentAction` | `apps/lara/src/app/crm/_actions/appointment.actions.ts:539-588` | via wrapper `.attend(appointmentId, chegadaEm)` | ✅ |
| `markArrivedFromMesaAction` | `apps/lara/src/app/crm/mesa-operacional/_actions.ts:162-206` | via wrapper `.attend(appointmentId)` | ✅ |
| `repos.leads.toPaciente()` | `packages/repositories/src/lead.repository.ts:629-649` | `supabase.rpc('lead_to_paciente', {p_lead_id, p_total_revenue, p_first_at, p_last_at, p_notes})` | ✅ |
| `promoteToPatientAction` | `apps/lara/src/app/crm/_actions/patient.actions.ts` | via wrapper `.toPaciente()` | ✅ |
| `appointment_finalize` (SQL · mig 151) chama lead_to_paciente | DB-level call | mesma assinatura | ✅ desbloqueado (aceita agendado agora) |

**E2E proof** (canon · NOT_RUN_ENV_UNAVAILABLE neste turno):
- `apps/lara/e2e/authed/appointment-attend-finalize.spec.ts:163` — `expect(leadAfterAttend?.phase).toBe('agendado')` · valida que post-attend lead.phase permanece agendado · canon que mig 191 garante.
- Spec detectado · compila · 4 tests dentro do describe (3 fluxos canônicos R1).

**Comentário stale residual**: `apps/lara/src/app/crm/pacientes/_actions.ts:281` ainda diz "lead_to_paciente quando compareceu (workflow normal)". É comment narrativo sobre fluxo conceitual antigo, não trata phase como valor. Tolerável · não bloqueia. Pode ser atualizado em round de cleanup futuro.

## C4 · Migrations 188-190 reaudit

Confirmado (sem mudanças desde Phase C original):

| Item | 188 | 189 | 190 |
|------|-----|-----|-----|
| BEGIN/COMMIT | ✅ | ✅ | ✅ |
| IF NOT EXISTS | ✅ | ✅ | ✅ |
| Sem destructive up | ✅ | ✅ | ✅ |
| Down script | ✅ | ✅ | ✅ |
| FK clinic_rooms · ON DELETE SET NULL | n/a | ✅ | ✅ |
| Index parcial | ✅ GIN | ✅ btree | ✅ btree + composite |
| RLS/anon write | ✅ herda · zero novos GRANT | ✅ | ✅ |
| Compat com dados | ✅ default seguro | ✅ nullable | ✅ nullable · `room_idx` preservado |

## C5 · ROOM_ID_FLOW_AUDIT (22 pontos)

Sem mudanças desde Phase C original · todos os 22 pontos do flow continuam ✅:
- DTO `AppointmentDTO.roomId` (`dtos.ts:239`)
- Input `CreateAppointmentInput.roomId` + `UpdateAppointmentInput.roomId` (`inputs.ts`)
- Mapper `mappers/appointment.ts:24`
- `APPT_COLUMNS` inclui `room_id`
- Repo create/update persistem; checkConflicts aceita roomId · prioriza FK sobre roomIdx legacy
- Zod schemas (Create/Update/Conflict)
- Actions create/update/check passam roomId
- `page.tsx` server fetch via `repos.rooms.listActive()`
- `_form.tsx` props · auto-link · select condicional · submit · edit prefill
- Repos factory + barrel · `RoomRepository` registrado

## C6 · Vacation + Clinic settings reaudit

Sem mudanças desde Phase C original.

| Item | Estado |
|------|--------|
| `professional_profiles.ferias` mig 188 | ✅ |
| `VacationPeriod` type + `isOnVacation` fail-safe | ✅ |
| `enforceScheduleConstraintsServerSide` chama isOnVacation | ✅ retorna `professional_on_vacation` com `{start_date, end_date, reason}` |
| `checkMinAdvance` server-side | ✅ retorna `min_advance_required` |
| `checkInPeriods` server-side | ✅ retorna `outside_working_hours` |
| Timezone risk | ⚠ documentado como pré-existente · não introduzido por R1 · não bloqueia |

## C7 · False positives preservation

| Falso positivo | Estado |
|----------------|--------|
| `CONSULT_TYPE_OPTIONS` (4 valores) `_form.tsx:242-248` | ✅ intocado |
| `PAYMENT_METHOD_OPTIONS` (10 formas) `_form.tsx:208-220` | ✅ intocado |
| Conflict detail rendering com nomes (`_form.tsx:967-981`) | ✅ intocado |
| Client validators `checkMinAdvance`/`checkInPeriods` | ✅ intocado · R1 só ADICIONOU call-site server-side |
| `paymentStatus` enum separado de `paymentMethod` | ✅ intocado |
| `appointment_finalize` (mig 151) | ✅ intocado |
| Hard gate clínico (mig 167) | ✅ intocado |

## C8 · Checks

| Check | Resultado |
|-------|-----------|
| `git diff --check` | ✅ exit 0 (warning CRLF cosmético) |
| `pnpm --filter @clinicai/repositories typecheck` | ✅ PASS |
| `pnpm --filter @clinicai/lara typecheck` | ✅ PASS |
| Unit tests | ⏸ não rodados (audit · não exigido nesta sub-fase) |
| E2E `crm-agenda-foundation` (R1.1-R1.5 detectados) | ⏸ NOT_RUN_ENV_UNAVAILABLE · spec compila |
| E2E `appointment-attend-finalize` (canon proof) | ⏸ NOT_RUN_ENV_UNAVAILABLE · spec compila · linha 163 valida canon |

## C9 · Safety final

| Item | Resultado |
|------|-----------|
| `wa_outbox` no diff | ✅ Zero (refs em mig 191 estão em comment header negativo "NÃO toca") |
| `pg_net` / `provider` / `http_post` | ✅ Zero em runtime |
| `cron.job` / `cron.alter_job` / `cron.schedule` | ✅ Zero |
| Worker 71 | ✅ Intocado |
| env / secrets | ✅ Zero |
| `appointment_finalize` runtime change | ✅ Zero (mig 151 intocada) |
| Hard gate mig 167 change | ✅ Zero |
| Edits em migrations históricas | ✅ Zero (`git status -- db/migrations/` mostra apenas `??` untracked novos) |
| Mig 65/72/150/151/167/187 modified | ✅ Zero |

## C10 · Verdict + Next step

### Verdict: **`PASS_CRM_PARITY_R1_PHASE_C_AUDIT_CHECK_READY`**

R1 inteiro está limpo:
- Migrations 188-191 prontas para apply controlado
- Repos/actions/UI completas e typechecked
- E2E spec criada
- Comentários canônicos alinhados
- Falsos positivos preservados
- Mig 191 resolve o bloqueio canônico pré-existente
- Zero impacto fora do escopo R1

### Next: aguardar `GO CRM_PARITY_R1_PHASE_D_COMMIT_PUSH_DEPLOY_CONTROLLED`

Phase D recomendada:
1. Commits granulares por fase (sugerido):
   - commit 1: mig 188 + 189 + 190 (3 migrations agenda foundation)
   - commit 2: mig 191 (canon hotfix)
   - commit 3: repos + types + actions + UI (R1 backend + UI)
   - commit 4: E2E spec + docs round-1
2. Push branch · abrir PR contra `main`
3. Aplicar migrations em staging primeiro · rodar E2E
4. Production deploy com feature flags `crm_v2_room_select_enabled` / `crm_v2_ferias_check_enabled` default OFF
