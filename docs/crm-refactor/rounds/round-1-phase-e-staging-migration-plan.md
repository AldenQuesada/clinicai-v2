# Round 1 · Phase E · PR Review + Staging Migration Plan

> CRM_PARITY_R1_PHASE_E · PR #39 reviewed · 4 migrations pronto para apply staged · **zero apply até GO E2** · 2026-05-18

## Verdict

**`PASS_CRM_PARITY_R1_PHASE_E_PR_REVIEW_READY_FOR_STAGING_APPLY`**

PR #39 está MERGEABLE com ambos CI checks SUCCESS. Plano staging preparado. Aguarda GO explícito para apply.

## E1 · PR snapshot

| Item | Valor |
|------|-------|
| PR | [#39](https://github.com/AldenQuesada/clinicai-v2/pull/39) |
| State | OPEN |
| Draft | false |
| Mergeable | **MERGEABLE** |
| Head | `crm/parity-r1-agenda-foundation` @ `752859c` |
| Base | `main` |
| Files changed | 30 |
| Commits | 4 |
| Additions | 2493 |
| Deletions | 34 |
| Review decision | (none yet) |

### CI checks

| Check | Workflow | Status | Duration |
|-------|----------|--------|----------|
| typecheck + lint + build | CI | ✅ **SUCCESS** | ~4min 16s |
| Playwright (chromium) | Lara E2E (Playwright) | ✅ **SUCCESS** | ~1min 35s |

Vercel preview: **PREVIEW_NOT_AVAILABLE** (não detectado em PR comments · repo usa GitHub Actions, não Vercel pra preview · CI nativa cobre typecheck+lint+build+E2E).

## E2 · Diff review by group

| Grupo | Files | Scope | Veredito |
|-------|-------|-------|----------|
| 1 · migrations 188-190 | 6 (3 up + 3 down) | ferias + sala_id + room_id | ✅ escopo R1 · idempotente |
| 2 · migration 191 | 2 (up + down) | canon hotfix (attend + matrix + lead_to_paciente) | ✅ alinhamento canon Phase 1C · down com aviso |
| 3 · backend/UI | 13 | DTO/Input/Mapper/Repos/Schemas/Actions/Page/Form/Edit page | ✅ apenas R1 backend+UI · zero pagamentos / multi-proc / finalize |
| 4 · tests/docs | 5 | E2E spec + 4 round-1 docs | ✅ |

**Confirmações de escopo:**
- ✅ zero pagamento / multi-procedimento / finalize / post-actions
- ✅ zero provider / WhatsApp / cron / env / secret
- ✅ zero edit em migrations históricas (65/72/150/151/167/187)
- ✅ zero `appointment_finalize` (mig 151) runtime change
- ✅ zero hard gate (mig 167) change

## E3 · Canon final guard

| Probe | Resultado |
|-------|-----------|
| `phase = 'compareceu'` em runtime TS | ✅ **zero matches** |
| `UPDATE/SET phase='compareceu'` em SQL forward (up migrations R1) | ✅ apenas 1 match em mig 191 header comment line 12 (canon-flagged · descreve mig 65 legacy) |
| Mig 191 down rollback compareceu refs | ✅ aceitável · header tem aviso **DO NOT USE FOR PRODUCTION** |
| `appointment_finalize` runtime alterado | ✅ Não · git diff vs origin/main mostra zero changes em mig 151/167 |
| Callers compatíveis | ✅ wrapper `attend()` + `toPaciente()` mantém assinatura |

## E4 · Local checks

| Check | Resultado |
|-------|-----------|
| `git diff origin/main...HEAD --check` | ✅ exit 0 |
| `pnpm --filter @clinicai/repositories typecheck` | ✅ PASS |
| `pnpm --filter @clinicai/lara typecheck` | ✅ PASS |
| Unit tests | ⏸ delegado ao CI do PR (já SUCCESS) |
| Build | ⏸ delegado ao CI (já SUCCESS) |
| E2E `crm-agenda-foundation` (5 cenários R1.1-R1.5) | ⏸ NOT_RUN_ENV_UNAVAILABLE local · spec compila · CI Playwright rodou outras specs SUCCESS |
| E2E `appointment-attend-finalize` (canon proof) | ⏸ NOT_RUN_ENV_UNAVAILABLE local · spec compila |

## E5 · Preview smoke

**PREVIEW_NOT_AVAILABLE** · Repo não tem Vercel bot configurado · CI nativa GitHub Actions cobre o que importa (typecheck + lint + build + E2E Playwright SUCCESS).

Não há preview deployable URL para validar manual. Decisão: não bloquear · CI verde substitui smoke de preview neste caso.

## E6 · Staging migration apply plan · NÃO APLICAR AINDA

### Apply order (gated pelo GO E2)

```
1. db/migrations/20260800000188_clinicai_v2_professional_profiles_ferias.sql
2. db/migrations/20260800000189_clinicai_v2_professional_profiles_sala_id.sql
3. db/migrations/20260800000190_clinicai_v2_appointments_room_id.sql
4. db/migrations/20260800000191_clinicai_v2_canonical_appointment_attend_no_compareceu.sql
```

Ordem importa: 189 e 190 referenciam `clinic_rooms(id)` · clinic_rooms existe legacy. 191 recreate funções · não depende de 188-190.

### Precheck SQL staging (rodar ANTES de apply)

```sql
-- a) Confirmar projeto/clinic
SELECT current_database(), inet_server_addr(), current_user;

-- b) Confirmar migrations 188-191 ainda não aplicadas
SELECT NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='professional_profiles'
    AND column_name='ferias'
) AS mig_188_pending,
NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='professional_profiles'
    AND column_name='sala_id'
) AS mig_189_pending,
NOT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='appointments'
    AND column_name='room_id'
) AS mig_190_pending;

-- c) Confirmar clinic_rooms existe (pre-requisito FK mig 189+190)
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema='public' AND table_name='clinic_rooms'
) AS clinic_rooms_exists;

-- d) Confirmar canon Phase 1C ativo (chk_leads_phase = 4 phases)
SELECT pg_get_constraintdef(c.oid) AS chk_leads_phase_def
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
WHERE t.relname = 'leads'
  AND c.conname = 'chk_leads_phase';
-- expected: CHECK (phase IN ('lead','agendado','paciente','orcamento'))

-- e) Confirmar funções existentes pré mig 191
SELECT proname,
       prokind,
       provolatile,
       prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND proname IN ('appointment_attend','_lead_phase_transition_allowed','lead_to_paciente')
ORDER BY proname;
-- expected: 3 rows (all 3 functions exist pre-191)

-- f) Worker 71 está OFF
SELECT jobid, jobname, active
FROM cron.job
WHERE jobid = 71;
-- expected: active=false (não deve ser ativado por R1)
```

**STOP conditions no precheck:**
- Qualquer `mig_188_pending`/`mig_189_pending`/`mig_190_pending` = false → migration já aplicada · STOP_APPLY_DUPLICATE
- `clinic_rooms_exists` = false → STOP_MISSING_PREREQ_LEGACY_TABLE
- `chk_leads_phase` não = 4-phase canon → STOP_CANON_NOT_APPLIED · investigar mig 150 retroapply state
- Worker 71 active=true → STOP_WORKER_71_ON · reportar antes de qualquer apply

### Apply command (placeholder · executar SOMENTE em GO E2)

```powershell
# clinicai-v2 staging apply (apply controlado · uma migration por vez)
$env:SUPABASE_ACCESS_TOKEN = "sbp_..."  # token staging
node scripts/apply-migration.mjs db/migrations/20260800000188_clinicai_v2_professional_profiles_ferias.sql
# ... rodar probes (ver E7)
node scripts/apply-migration.mjs db/migrations/20260800000189_clinicai_v2_professional_profiles_sala_id.sql
node scripts/apply-migration.mjs db/migrations/20260800000190_clinicai_v2_appointments_room_id.sql
# ... rodar probes
node scripts/apply-migration.mjs db/migrations/20260800000191_clinicai_v2_canonical_appointment_attend_no_compareceu.sql
# ... rodar probes finais (E7)
```

### Rollback plan staging

Se qualquer probe pós-apply falhar:

1. Aplicar down na **ordem reversa**:
   ```
   191.down.sql  → 190.down.sql → 189.down.sql → 188.down.sql
   ```
2. **191.down restaura mig 65 legacy** · só usar em staging dentro desta janela. Já tem aviso `DO NOT USE FOR PRODUCTION` no header.
3. Pós-rollback: validar canon retornou ao estado pre-apply (pg_get_functiondef + chk_leads_phase).

## E7 · Staging validation probes · preparadas para GO E2

### Probe 1 · Colunas criadas

```sql
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='professional_profiles' AND column_name='ferias') AS professional_ferias_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='professional_profiles' AND column_name='sala_id') AS professional_sala_id_exists,
  EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='appointments' AND column_name='room_id') AS appointment_room_id_exists;
-- expected: all true
```

### Probe 2 · FK constraints

```sql
SELECT conname,
       conrelid::regclass AS table_name,
       confrelid::regclass AS ref_table,
       pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conname ILIKE '%sala_id%'
   OR conname ILIKE '%room_id%';
-- expected: 2 rows · both ON DELETE SET NULL referencing clinic_rooms(id)
```

### Probe 3 · Canon function source

```sql
SELECT proname,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND proname IN ('appointment_attend','_lead_phase_transition_allowed','lead_to_paciente');
-- expected:
-- - appointment_attend source NÃO contém "UPDATE public.leads" nem "phase = 'compareceu'"
-- - _lead_phase_transition_allowed source NÃO contém 'compareceu' nem 'reagendado' em paths positivos
-- - lead_to_paciente body contém "phase NOT IN ('lead', 'agendado')" no gate
```

### Probe 4 · Distribuição de phases (canon)

```sql
SELECT phase, count(*)
FROM public.leads
GROUP BY phase
ORDER BY phase;
-- expected: somente lead/agendado/paciente/orcamento
```

### Probe 5 · Zero phase legacy

```sql
SELECT count(*) AS invalid_phase_count
FROM public.leads
WHERE phase IN ('compareceu','perdido','reagendado');
-- expected: 0
```

### Probe 6 · Worker 71 + wa_outbox baseline

```sql
-- Worker 71 ainda OFF?
SELECT jobid, jobname, active FROM cron.job WHERE jobid = 71;
-- expected: active=false

-- wa_outbox sem delta anormal
SELECT status, count(*) FROM public.wa_outbox GROUP BY status ORDER BY status;
-- expected: baseline (sem novos enqueues durante apply)
```

### Probe 7 · Index health

```sql
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname='public'
  AND (indexname LIKE 'idx_prof_profiles_ferias_gin'
    OR indexname LIKE 'idx_prof_profiles_sala_id'
    OR indexname LIKE 'idx_appointments_room%');
-- expected: 4 rows
```

### Probe 8 · CHECK constraints ferias

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname='chk_prof_profiles_ferias_array';
-- expected: 1 row · CHECK (jsonb_typeof(ferias) = 'array')
```

## E8 · Próximo GO preparado (não executar agora)

```
GO CRM_PARITY_R1_PHASE_E2_APPLY_MIGRATIONS_TO_STAGING_AND_SMOKE
```

Esse GO deve:
1. Rodar precheck SQL staging (E6)
2. Aplicar 188 → probes → 189 → probes → 190 → probes → 191 → probes
3. Rodar E2E `crm-agenda-foundation` + `appointment-attend-finalize` contra staging
4. Smoke manual `/crm/agenda/novo` (criar com sala · profissional em férias · antecedência)
5. Confirmar appointment_attend canon (lead.phase permanece 'agendado')
6. **NÃO** tocar produção
7. **NÃO** mergear PR ainda
8. Reportar PASS/FAIL com SQL probe results

## E9 · Confirmações negativas

- ✅ Zero merge · PR #39 ainda OPEN
- ✅ Zero migration aplicada (188-191 versionadas no PR, apply em E2)
- ✅ Zero production deploy
- ✅ Zero WhatsApp · zero `wa_outbox` mutação
- ✅ Zero provider (Evolution/Meta/pg_net/http_post)
- ✅ Worker 71 intocado · zero `cron.*` em diff PR
- ✅ Zero env / secrets em diff
- ✅ Zero edit em migrations históricas (65/72/150/151/167/187)
- ✅ Zero `appointment_finalize` runtime change
- ✅ Zero hard gate (mig 167) change
- ✅ Zero Round 2 work

## Bloqueios para Phase E2 / merge

Nenhum bloqueio técnico. Esperando:
- (opcional) Review humano do PR #39
- GO explícito `CRM_PARITY_R1_PHASE_E2_APPLY_MIGRATIONS_TO_STAGING_AND_SMOKE`

PR está pronto para apply em staging quando você der o sinal.
