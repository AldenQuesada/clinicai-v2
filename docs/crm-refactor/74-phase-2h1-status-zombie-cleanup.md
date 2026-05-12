# CRM_PHASE_2H.1 · Status Zombie Cleanup

> **Data:** 2026-05-12
> **Status:** runtime TS corrigido · typecheck PASS · zero migration · zero envio
> **HEAD inicial:** `a3f3454` · HEAD final esperado: commit local 2H.1
> **Verdict alvo:** `PASS_CRM_PHASE_2H1_STATUS_ZOMBIE_CLEANUP_READY_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Refactor cosmético cross-cutting · remove os status zumbi `pre_consulta` e `em_consulta` do runtime TypeScript (UI + helpers + schemas) e ajusta phase labels legacy (`reagendado`, `compareceu`). Esses termos **nunca foram aceitos** pelo `CHECK constraint` do DB nem pela RPC canônica `_appointment_status_transition_allowed`, mas estavam espalhados em ~10 arquivos TS, causando dead-code paths e potenciais regressões silenciosas se alguém tentasse usar.

**Zero migration · zero envio · zero alteração de banco.** Apenas alinhamento TS ↔ DB.

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `a3f3454be88c7d1b334c4b91fe27bbe5d0be9e59` |
| Working tree | limpo |
| Worker 71 | OFF ✅ |
| DB · `appt_status` zumbi | 0 (CHECK constraint sempre rejeitou) |
| DB · `phase='perdido'` | 0 (Fase 1C moveu para lifecycle) |
| TS · `AppointmentStatus` zumbis | 2 (`pre_consulta`, `em_consulta`) |
| TS · phase labels legacy | 2 (`reagendado`, `compareceu`) |

---

## 3 · Termos zumbis auditados

| Termo | Origem | Status no DB | Status no TS antes 2H.1 |
|---|---|---|---|
| `pre_consulta` | Mig inicial · removido em 65/72 | NÃO aceito (CHECK rejeita) | Presente em 8 arquivos |
| `em_consulta` | Mig inicial · removido em 65/72 | NÃO aceito (CHECK rejeita) | Presente em 7 arquivos |
| `compareceu` | Phase legado (Fase 1B) | Phase canônica não tem (Fase 1C) | Label residual em 3 arquivos |
| `reagendado` | Phase legado (Fase 1B) | Phase canônica não tem (Fase 1C) | Label residual em 2 arquivos |
| `attending` | Vocabulário en-US legacy | NÃO usado | Zero matches runtime |
| `converted` | Vocabulário en-US legacy | NÃO usado | Zero matches runtime |
| `perdido` como phase | Fase 1B legado | Phase canônica não tem (Fase 1C · virou lifecycle) | Já corrigido em 2J/2J.1 (zero regressão) |

---

## 4 · Matriz de achados

### 4.A · Runtime TS corrigido

| Arquivo | Tipo de mudança |
|---|---|
| [packages/repositories/src/types/enums.ts](../../packages/repositories/src/types/enums.ts) | `AppointmentStatus` enum · removido `pre_consulta` + `em_consulta` |
| [packages/repositories/src/helpers/appointment-state.ts](../../packages/repositories/src/helpers/appointment-state.ts) | `APPOINTMENT_STATE_MACHINE` (sem transições zumbi) · `SAME_DAY_ONLY_STATUSES` · `BLOCKS_CALENDAR` · `APPOINTMENT_STATUS_LABELS` · `APPOINTMENT_STATUS_COLORS` |
| [packages/repositories/src/appointment.repository.ts](../../packages/repositories/src/appointment.repository.ts) | Switch case agregador (linha 564-) removeu cases zumbi |
| [packages/ui/src/components/badge.tsx](../../packages/ui/src/components/badge.tsx) | `AppointmentStatus` local + `APPT_STATUS_MAP` · removidas entradas zumbi |
| [apps/lara/src/app/crm/_schemas/appointment.schemas.ts](../../apps/lara/src/app/crm/_schemas/appointment.schemas.ts) | `z.enum AppointmentStatus` · removidos zumbis |
| [apps/lara/src/app/crm/_actions/appointment.actions.ts](../../apps/lara/src/app/crm/_actions/appointment.actions.ts) | `ChangeStatusSchema z.enum` · removido `pre_consulta` + comentário `phase=compareceu` atualizado |
| [apps/lara/src/app/crm/agenda/novo/_form.tsx](../../apps/lara/src/app/crm/agenda/novo/_form.tsx) | `STATUS_OPTIONS` array + type cast · removido `pre_consulta` |
| [apps/lara/src/app/crm/agenda/_components/_drag-utils.ts](../../apps/lara/src/app/crm/agenda/_components/_drag-utils.ts) | `DRAGGABLE_STATUSES` set · removido `pre_consulta` |
| [apps/lara/src/app/crm/agenda/_components/month-view.tsx](../../apps/lara/src/app/crm/agenda/_components/month-view.tsx) | `STATUS_TO_DOT` map · removidas entradas zumbi |
| [apps/lara/src/app/(authed)/conversas/components/StatusBadge.tsx](../../apps/lara/src/app/(authed)/conversas/components/StatusBadge.tsx) | `PHASE_LABELS` (sem `reagendado`/`compareceu`/`perdido` órfãos) + `STATUS_LABELS` + `STATUS_COLORS` (sem zumbis) |
| [apps/lara/src/app/(authed)/conversas/components/SecretariaQuickActions.tsx](../../apps/lara/src/app/(authed)/conversas/components/SecretariaQuickActions.tsx) | `inProgress` array · removidos zumbis + comentário atualizado. `ACTIONS.pre_consulta` (ID de botão UI · não enum) preservado |
| [apps/lara/src/app/(authed)/leads/[id]/LeadDetailClient.tsx](../../apps/lara/src/app/(authed)/leads/[id]/LeadDetailClient.tsx) | `map` color/bg para labels · removidas entradas `reagendado`/`compareceu` órfãs |

### 4.B · Mantido por contexto (não-zumbi)

| Arquivo / texto | Razão |
|---|---|
| `"Não compareceu"` (label PT-BR) em StatusBadges | Label PT-BR do enum `no_show` · texto humano, não enum |
| `ACTIONS.pre_consulta` em SecretariaQuickActions | ID de **botão UI** (envia orientação pré-consulta) · não é appointment status |
| Comentários explicativos em LeadFiltersPanel, lead.schemas.ts | Documentam decisão da Fase 1C · ajudam manutenção |
| `b2b-attribution.repository.ts`, `b2b-scout.repository.ts`, etc | Hits em variáveis tipo `converted` (boolean B2B) ou comentários · não related a status |
| `apps/lara/public/legacy/js/**` | Legacy vanilla JS (substituído pelo Next.js TS) · não-runtime |

### 4.C · Build outputs ignorados

- `packages/repositories/src/**/*.d.ts`
- `packages/repositories/src/**/*.js`
- `packages/supabase/src/types.ts` (gerado via `pnpm db:types`)

Esses são regenerados em build · sem alteração manual.

### 4.D · Migrations históricas mantidas

`db/migrations/*` antigas referenciam zumbis em comentários ou estados intermediários. **NÃO alteradas** · servem como histórico do que foi feito antes da Fase 1C.

### 4.E · Risco residual

- **`pg_proc.prosrc`** ainda contém algumas RPCs com `em_consulta` em fallbacks ou validações. Como o CHECK do banco já rejeita, esses paths são dead code. Cleanup direto via `CREATE OR REPLACE FUNCTION` ficaria para fase futura (cosmético).

---

## 5 · Correções aplicadas · resumo numérico

- **12 arquivos** modificados em runtime TS
- **~30 ocorrências** de `pre_consulta` / `em_consulta` removidas
- **5 ocorrências** de `reagendado` / `compareceu` removidas (em phase color maps que nunca casavam)
- **Zero ocorrências** de `phase='perdido'` introduzidas (regressão evitada)
- **2 comentários** explicativos adicionados (`CRM_PHASE_2H.1 cleanup`)

---

## 6 · Itens mantidos por histórico

- Migrations antigas (`db/migrations/2026080000006*` e anteriores)
- Doc histórico em `docs/crm-refactor/03-current-state-machine.md`, etc
- Comentários `// `phase=compareceu` derrogada · ...` que documentam decisão Fase 1C
- Build outputs (regenerados automaticamente)

---

## 7 · Riscos residuais

1. **RPCs SQL legadas** (não auditadas exaustivamente) podem ter switch cases com `em_consulta`/`pre_consulta` em fallback. Como DB rejeita por CHECK, paths são unreachable em produção. Cleanup adicional cosmético para futura fase 2H.2 se necessário.
2. **Build outputs (`.d.ts`, `.js`)** ainda contêm os zumbis até próximo build/typecheck completo. Regeneração automática no CI ou `pnpm build` resolve.
3. **`packages/supabase/src/types.ts`** (Supabase types autogerados) ainda tem zumbis · regenerar via `pnpm db:types` quando aplicar próxima migration.
4. **Sem migration cosmética** para tirar `em_consulta`/`pre_consulta` de comentários SQL antigos · fora do escopo.

---

## 8 · Validation SQL

[sql/phase-2h1-status-zombie-cleanup-validation.sql](sql/phase-2h1-status-zombie-cleanup-validation.sql) · 5 blocos READ-ONLY:
- `00_safety` (jobs/outbox)
- `01_appointment_status` (distribuição + counts zumbi expected 0)
- `02_lead_phase` (phase canônica + lifecycle dist)
- `03_function_source_scan` (pg_proc.prosrc grep informativo)
- `04_state_machine_alignment` (`_appointment_status_transition_allowed` rejeita transições zumbi)
- `99_final_flags`

Esperado:
- `invalid_appointment_status_count = 0`
- `pre_consulta_count = 0`
- `em_consulta_count = 0`
- `phase_perdido_count = 0`
- `runtime_zombie_terms_expected_zero = true`
- `can_continue = true`

---

## 9 · Typecheck

```
pnpm --filter @clinicai/repositories run typecheck → PASS ✅
pnpm --filter @clinicai/lara run typecheck → PASS ✅
```

Zero erros TypeScript após cleanup.

---

## 10 · Confirmações negativas

- ✅ Zero migration nova
- ✅ Zero `db push` / `migration repair`
- ✅ Zero cron alter
- ✅ Zero job 71 activation
- ✅ Zero WhatsApp/Evolution/Meta call
- ✅ Zero provider call
- ✅ Zero envio real
- ✅ Zero env/secrets
- ✅ Zero deploy manual
- ✅ Zero alteração runtime em comportamento UI (só limpeza de paths inalcançáveis)
- ✅ Zero regressão `phase='perdido'`
- ✅ Zero reintrodução de `perdido` no FinalizeWizard

---

## 11 · Próxima fase recomendada

Consultar [75-next-prompt-after-2h1.md](75-next-prompt-after-2h1.md):

1. **CRM_PHASE_2AUX · Modal agendamento completo** (wizard rich · item #7 matriz)
2. **CRM_PHASE_2R.2 · No-show/cancel/remark refinement**
3. **CRM_PHASE_2RC · Recuperação comercial** (consome `perdidos` table)
4. **CRM_PHASE_2L.2.1 · Template approval mirror** (gated por Meta readiness)
