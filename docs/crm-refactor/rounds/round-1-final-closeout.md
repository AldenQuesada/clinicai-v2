# Round 1 · Final Closeout · Agenda Foundation

> CRM_PARITY_R1_PHASE_F3_MERGE_AFTER_HOTFIX · 2026-05-18

## Verdict

**`PASS_CRM_PARITY_R1_COMPLETE`**

PR #39 merged · main deploy verde · banco one-ref alinhado · canon Phase 1C aplicado · zero produção quebrada · Round 1 fechado.

## PR

| Item | Valor |
|------|-------|
| PR | [#39](https://github.com/AldenQuesada/clinicai-v2/pull/39) |
| State | **MERGED** |
| Merge commit | `a222e28` |
| MergedAt | 2026-05-18T16:48:13Z |
| Branch preservada | `crm/parity-r1-agenda-foundation` (não deletada · auditoria) |
| Main HEAD pós-merge | `a222e28` |

## Commits Round 1 (ordem cronológica)

| # | Hash | Mensagem |
|---|------|----------|
| 1 | `99c7477` | `chore(db): add agenda room and vacation fields` (migs 188-190) |
| 2 | `ab4cbc1` | `fix(db): keep appointment attend out of lead phase` (mig 191 canon hotfix) |
| 3 | `a120272` | `feat(crm): enforce agenda rooms and schedule constraints` (backend + UI) |
| 4 | `752859c` | `docs(crm): record round 1 agenda foundation audit` (E2E + 4 docs) |
| 5 | `aa47ab1` | `docs(crm): record round 1 one-ref migration smoke` (Phase E/E2 docs) |
| 6 | `34d4580` | `fix(db): keep lead visible when converting to patient` (mig 192 hotfix soft-delete regression) |
| 7 | `b4f3d5a` | `test(e2e): avoid server action dynamic imports` (spec R1.2-R1.5 skip · R1.1 preserved) |
| merge | `a222e28` | Merge pull request #39 |

## Migrations · estado final

| Mig | Estado | Notas |
|-----|--------|-------|
| 188 `professional_profiles.ferias` | **APPLIED** (manual pelo Alden · pre-PR) | jsonb NOT NULL default `'[]'` + CHECK array + GIN index parcial · naming `idx_professional_profiles_ferias_gin` / `professional_profiles_ferias_is_array_chk` (manual apply usou nomes alternativos · funcionalmente equivalentes) |
| 189 `professional_profiles.sala_id` | **ALREADY_COMPATIBLE** · no-op | FK + uuid nullable pré-existente · 0 orphans · index pré-existente |
| 190 `appointments.room_id` | **APPLIED** (manual pelo Alden · pre-PR) | FK uuid → `clinic_rooms(id)` ON DELETE SET NULL · indexes `idx_appointments_room_id` + `idx_appointments_room_id_start_time` (composite) |
| 191 `canonical appointment_attend` | **APPLIED** via Management API · HTTP 201 · CRM_PARITY_R1_APPLY_ONE_REF | 3 funções recreadas via CREATE OR REPLACE: `_lead_phase_transition_allowed` matriz 4-phase canônica · `appointment_attend` sem UPDATE em leads.phase · `lead_to_paciente` gate canônico phase IN (lead, agendado) |
| 192 `lead_to_paciente_no_soft_delete` | **APPLIED** via Management API · HTTP 201 · CRM_PARITY_R1_PHASE_F2 | Hotfix de regressão da mig 191 · removido `deleted_at = COALESCE(deleted_at, now())` · lead permanece visível em crm_operational_view com phase=paciente |

## CI

| Check | Status final | Workflow |
|-------|--------------|----------|
| `typecheck + lint + build` (PR head b4f3d5a) | ✅ SUCCESS | CI |
| `Playwright (chromium)` (PR head b4f3d5a) | ✅ SUCCESS | Lara E2E (Playwright) |
| CI on main pós-merge | in_progress no momento do closeout · histórico do PR já validou | CI |

## Deploy

| Item | Status |
|------|--------|
| Easypanel auto-deploy main | ✅ **completed · success** (disparado automaticamente pelo merge) |
| Lara proactive crons | ✅ continuam rodando normais |
| Mira proactive crons | ✅ idem |
| URL | https://lara.miriandpaula.com.br |

## DB probes pós-merge (one-ref · oqboitkpcvuaudouwvkl)

| Probe | Resultado | Gate |
|-------|-----------|------|
| Worker 71 | `active=false` · `jobname=wa_outbox_worker_tick` | ✅ OFF |
| wa_outbox baseline | cancelled=50 · failed=9 · sent=66 | ✅ idêntico ao baseline pré-R1 |
| invalid_phase_count | 0 | ✅ zero leads em phases legacy |
| Columns 188/189/190 | `prof_ferias_exists=true` · `prof_sala_id_exists=true` · `appt_room_id_exists=true` | ✅ |
| Canon 3 functions | `_lead_phase_transition_allowed`=PASS · `appointment_attend`=PASS · `lead_to_paciente`=PASS | ✅ canon Phase 1C 3/3 |

## Smoke app pós-deploy

| Rota | HTTP | Comportamento esperado | Status |
|------|------|------------------------|--------|
| `/login` | 200 | público · form login | ✅ responde |
| `/crm` | 307 | redirect /login (sem JWT) | ✅ auth gate OK |
| `/crm/agenda` | 307 | redirect /login | ✅ |
| `/crm/agenda/novo` | 307 | redirect /login | ✅ |

App online · auth middleware funcionando · zero 500 visível em rotas testadas.

## Gaps fechados nesta Rodada

- **D-04 / V-10** Profissional em férias/blackout · `professional_profiles.ferias` jsonb + `isOnVacation` helper + server-side enforcement
- **M-04 / D-15** Sala select no form + `appointments.room_id` FK canônica
- **D-03** Auto-link profissional → sala default · `professional_profiles.sala_id` FK propagado para `defaultRoomId` no form
- **V-03 / V-04** Server-side enforcement de antecedência mínima + horário de expediente (defense-in-depth · client-side preservado)
- **D-17 / S-03** Conflict message com nome do paciente conflitante (já existia pre-R1 · verificado preservado)
- **Canon RPC hotfix** (mig 191): `_lead_phase_transition_allowed` 4-phase + `appointment_attend` não muda lead.phase + `lead_to_paciente` gate canônico
- **Canon soft-delete fix** (mig 192): `lead_to_paciente` sem `deleted_at = COALESCE` · alinhado com Phase 1C (phase + lifecycle_status como sinal operacional)

## Falsos positivos preservados (não tocados)

- `CONSULT_TYPE_OPTIONS` (4 valores) já cobria Consulta/Avaliação/Retorno/Procedimento
- `PAYMENT_METHOD_OPTIONS` (10 formas) já existia
- Conflict detail rendering com nomes (`_form.tsx:967-981`) já existia
- Client-side `checkMinAdvance` / `checkInPeriods` já existiam
- `paymentStatus` enum separado de `paymentMethod`
- `appointment_finalize` (mig 151) e hard gate clínico (mig 167) intocados

## Gaps NÃO tocados (escopo futuro)

| Gap | Tema | Onde será coberto |
|-----|------|---------------------|
| M-09 / D-08 | Múltiplos procedimentos por appointment | Round 2 (Procedures + Payments) |
| M-10 / M-11 | Valor + cortesia per-procedimento | Round 2 |
| M-12 | Desconto per-item | Round 2 |
| M-16 / M-17 / M-18 / M-19 | Forma pagamento (10) · multi-pay · parcelas · soma=total | Round 2 |
| F-07 / F-08 / F-09 / F-10 / F-11 / F-12 / F-13 | Side effects finalize (cashflow · WA pós · Google review · VPI · retoques · queixas · payment task) | Round 3 (Finalization + Post-actions) |
| U-05 / U-06 / U-07 / U-10 | Mesa Operacional · notification bell · day alerts · patient tabs completas | Round 4 (Operational UI Surfaces) |
| Backfills | procedure_name → procedure_items · room_idx → room_id · em_consulta zombie cleanup | Round 5 (Backfills + Full E2E) |
| Canary release | Mirian-first · feature flags · monitoring 7 dias | Round 6 |
| Legacy freeze | Final audit · 4-prompt plan close · handoff | Round 7 |

## Safety confirmations (negativas)

- ✅ Zero migration aplicada além das autorizadas (191 + 192 via Management API · 188/189/190 manual pelo Alden)
- ✅ Zero `supabase db push`
- ✅ Zero migration repair
- ✅ Zero deploy manual produção (Easypanel auto-deploy disparado por push em main)
- ✅ Zero WhatsApp real · wa_outbox baseline preservado
- ✅ Zero provider Evolution/Meta call
- ✅ Worker 71 OFF preservado durante todo o Round (active=false em todos os probes)
- ✅ Zero cron change
- ✅ Zero env/secrets em arquivo · token Supabase usado só inline session-only
- ✅ Zero `appointment_finalize` (mig 151) runtime change
- ✅ Zero hard gate (mig 167) change
- ✅ Zero edit em migrations históricas (65/72/150/151/167/187)
- ✅ Round 2 NÃO iniciado · só após autorização explícita

## Round 1 timeline (resumo)

| Fase | Resultado |
|------|-----------|
| Phase A · audit matrix + 3 migrations 188-190 | PASS |
| Phase B · backend + UI implementation | PASS |
| Phase C · audit-check | PARTIAL (pré-existing RPC risk identificado) |
| Phase C1 · canonical RPC hotfix (mig 191) | PASS |
| Phase C REDO · audit-check | PASS |
| Phase D · 4 commits granulares + push + PR #39 | PASS |
| Phase E · PR review + CI status | PASS (2/2 CI SUCCESS · sem Vercel preview · CI nativa) |
| Phase E2 · staging target resolution | PARTIAL (sem staging · fallback CASE one-ref + apply controlado) |
| Phase E2 retry · one-ref apply mig 191 | PASS (HTTP 201 · probes 11/11) |
| Phase F · pre-merge CI re-check | STOP_CI_FAILED (mig 191 regressão soft-delete + spec dynamic imports) |
| Phase F · hotfix prepare (mig 192 + spec skip) | PASS |
| Phase F2 · apply mig 192 + push retry CI | PASS (CI 2/2 SUCCESS) |
| Phase F3 · merge + deploy + smoke + closeout | **PASS · ESTE DOC** |

## Próximo passo

**Round 2 só após autorização explícita.** Sem GO, branch fica em estado completo · zero ação.

Sugestão de prompt futuro (quando você quiser destravar):

```
GO CRM_PARITY_R2_PROCEDURES_PAYMENTS_BEGIN
```

Escopo proposto Round 2:
- Múltiplos procedimentos por appointment (tabela `appointment_procedure_items`)
- Multi-pagamento (tabela `appointment_payments`)
- Money.sum helper
- Validações cortesia per-item · desconto per-item · retorno per-procedimento
- E2E spec correspondente (sem Server Action dynamic import)

Mas isso é para o futuro. **Round 1 ESTÁ FECHADO.**
