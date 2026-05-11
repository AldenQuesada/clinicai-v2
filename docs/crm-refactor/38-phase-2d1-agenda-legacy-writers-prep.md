# 38 · Fase 2D.1 · Agenda legacy writers canonical · PREP (sem apply)

> Preparação da mig 153 + patch legacy repository. **NÃO APLICADA.** Apply
> controlado fica para Fase 2D.2 após revisão de SQL no chat.

---

## 1 · Resumo executivo

Auditoria 2026-05-11 confirmou que a pilha legacy (`apps/lara/public/legacy/js`) está quebrada em prod:
- `appt_upsert(jsonb)` e `appt_sync_batch(jsonb)` no banco ainda gravam colunas obsoletas (`patient_name`, `patient_phone`, `professional_idx`, `room_idx`) que não existem no schema canon (`subject_name`, `subject_phone`, `professional_id`).
- Schedule modal salva no `localStorage` mas RPC falha silenciosamente · operadora acha que agendou.
- Pilha TS nova (Lara v2) NÃO usa essas RPCs · está alinhada com schema.

Esta fase entrega 5 artefatos prontos para review:

1. Mig 153 forward (`CREATE OR REPLACE FUNCTION` × 3)
2. Mig 153 down NO-OP defensivo
3. Rollback note completo
4. SQL de validação pós-apply (READ-ONLY + smoke tests opcionais)
5. Patch no `apps/lara/public/legacy/js/repositories/appointments.repository.js` (não-destrutivo · só passa a detectar `data.ok===false`)

**Sem apply. Sem SQL mutativo. Sem deploy. Sem alteração TS Lara v2.**

---

## 2 · Arquivos alterados (working tree · sem commit)

| Arquivo | Tipo | Status |
|---|---|---|
| [db/migrations/20260800000153_clinicai_v2_agenda_legacy_writers_canonical.sql](db/migrations/20260800000153_clinicai_v2_agenda_legacy_writers_canonical.sql) | NOVO · forward migration | ✅ |
| [db/migrations/20260800000153_clinicai_v2_agenda_legacy_writers_canonical.down.sql](db/migrations/20260800000153_clinicai_v2_agenda_legacy_writers_canonical.down.sql) | NOVO · down NO-OP | ✅ |
| [docs/database/rollback-notes/20260800000153_clinicai_v2_agenda_legacy_writers_canonical.md](docs/database/rollback-notes/20260800000153_clinicai_v2_agenda_legacy_writers_canonical.md) | NOVO · rollback note | ✅ |
| [docs/crm-refactor/sql/phase-2d-agenda-legacy-writers-post-apply-validation.sql](docs/crm-refactor/sql/phase-2d-agenda-legacy-writers-post-apply-validation.sql) | NOVO · validation SQL | ✅ |
| [docs/crm-refactor/38-phase-2d1-agenda-legacy-writers-prep.md](docs/crm-refactor/38-phase-2d1-agenda-legacy-writers-prep.md) | NOVO · este doc | ✅ |
| [apps/lara/public/legacy/js/repositories/appointments.repository.js](apps/lara/public/legacy/js/repositories/appointments.repository.js) | MODIFICADO · trata `data.ok===false` em `upsert` e `syncBatch` | ✅ |

---

## 3 · Escopo da mig 153

### Faz

3 funções (`CREATE OR REPLACE`):

1. `public._appt_upsert_one(p_data jsonb, p_clinic_id uuid)` — helper interno · normaliza payload camelCase pt-br para colunas canônicas · executa INSERT ou UPDATE conforme `id` exista.
2. `public.appt_upsert(p_data jsonb)` — entrypoint público legacy · valida `clinic_id` via `app_clinic_id()` + payload object · delega para helper.
3. `public.appt_sync_batch(p_appointments jsonb)` — iterator · processa array · não interrompe em erro · agrega counts + até 20 erros detalhados.

Inclui:
- `NOTIFY pgrst, 'reload schema'`
- DO block de sanity check pós-COMMIT

### Não faz

- ❌ Schema da tabela `appointments` (não toca colunas/CHECK/index/trigger/RLS)
- ❌ Outras RPCs (`appt_set_canonical`, `appt_set_cortesia`, `appt_list`, `appt_delete*`, `appt_create_series`, `appointment_attend`, `appointment_finalize`, `appointment_change_status`, `lead_to_appointment`, `lead_lost`, `lead_to_paciente`, `lead_to_orcamento`)
- ❌ WhatsApp / cron / wa_outbox / wa_agenda_automations / _agenda_alert_min_before_tick / job 71 / job 72
- ❌ Schema TS Lara v2 (`apps/lara/src/`)
- ❌ Backfill · zero DML em `appointments`/`leads`/`patients`
- ❌ DROP TABLE / DROP COLUMN / TRUNCATE / DELETE / ALTER TYPE

---

## 4 · Patch legacy repository (não-destrutivo)

`apps/lara/public/legacy/js/repositories/appointments.repository.js` recebe duas alterações cirúrgicas:

1. **`upsert(apptData)`** (era L65-97) → agora também trata caso `data.ok===false` retornado pela RPC tipada. Mantém preservação do retorno `id_remapped` (já era passado para `_maybeRemapLocalId` via `result.data`).
2. **`syncBatch(appointments)`** (era L134-144) → agora trata `data.ok===false` ou `data.error_count>0` (caso parcial).

Antes:
```js
const { data, error } = await _sb().rpc('appt_upsert', { p_data: apptData })
if (error) return _err(error.message || String(error))
// ... patches complementares ...
return _ok(data)
```

Depois:
```js
const { data, error } = await _sb().rpc('appt_upsert', { p_data: apptData })
if (error) return _err(error.message || String(error))
// NEW: tratamento de erro tipado (mig 153 v2)
if (data && data.ok === false) {
  return _err(data.error || 'appt_upsert_failed')
}
// ... patches complementares ...
return _ok(data)
```

Não muda payload enviado, contrato de retorno (ainda retorna `{ok:true, data:{id, id_remapped, ...}}`), nem altera os patches `appt_set_cortesia`/`appt_set_canonical`.

---

## 5 · Mapeamento canon (camelCase legacy → snake_case banco)

Ver §3 do rollback note. Resumo:

| Payload legacy | Coluna |
|---|---|
| `pacienteNome` (obrigatório) | `subject_name` |
| `pacientePhone` / `pacienteTelefone` | `subject_phone` |
| `pacienteId` | `lead_id` OU `patient_id` (resolução automática) |
| `_professionalId` | `professional_id` |
| `profissionalNome` | `professional_name` |
| `data` (obrigatório) | `scheduled_date` |
| `horaInicio` / `horaFim` (obrigatórios) | `start_time` / `end_time` |
| `procedimento` | `procedure_name` |
| `tipoConsulta` / `tipoAvaliacao` | `consult_type` / `eval_type` |
| `valor` / `formaPagamento` / `statusPagamento` | `value` / `payment_method` / `payment_status` |
| `status` (default `agendado`) | `status` |
| `origem` / `obs` | `origem` / `obs` |
| `consentimentoImagem` (default `pendente`) | `consentimento_img` |
| `recurrence_*` / `recurrenceCamelCase` | `recurrence_*` |

---

## 6 · Errors tipados (catálogo completo)

| Erro | Causa |
|---|---|
| `no_clinic_in_jwt` | `app_clinic_id()` retornou NULL (JWT inválido/sem clinic) |
| `invalid_payload` / `invalid_payload_expected_array` | jsonb shape incorreto |
| `forbidden_role` | role ∉ `{owner,admin,receptionist,therapist}` |
| `id_required` / `subject_name_required` / `scheduled_date_required` / `start_time_required` / `end_time_required` | campos mínimos |
| `invalid_date_or_time` | parse falhou |
| `end_time_must_be_after_start_time` | end ≤ start |
| `invalid_lead_or_patient_id` | UUID não existe em leads nem patients |
| `subject_required` | sem subject e status ≠ `bloqueado` |
| `invalid_status` (com `got`) | status ∉ contrato 13 valores |
| `invalid_value_negative` | `valor < 0` |
| `invalid_payment_status` (com `got`) | ∉ contrato 5 valores |
| `invalid_consentimento_img` (com `got`) | ∉ contrato 4 valores |

---

## 7 · `procedimentos[]` / `pagamentos[]` (decisão consciente)

A tabela canon `appointments` (mig 062) **removeu** os campos `procedimentos jsonb` e `pagamentos jsonb` do schema legacy. O legacy compensa chamando `appt_set_canonical` separadamente após `appt_upsert` (ver `apps/lara/public/legacy/js/repositories/appointments.repository.js:82-91`).

A mig 153 **NÃO trata** `p_data->'procedimentos'` nem `p_data->'pagamentos'` (ignora silenciosamente). O caminho `appt_set_canonical` continua intacto e a UI legacy não é afetada.

Auditoria de `appt_set_canonical` e `appt_set_cortesia` fica para fase futura (potencial drift análogo).

---

## 8 · Static safety scan

```
$ rg "DROP TABLE|DROP COLUMN|TRUNCATE|ALTER TYPE|CREATE TYPE|DROP TYPE|DELETE FROM" \
     db/migrations/20260800000153_*.sql db/migrations/20260800000153_*.down.sql
→ 0 hits
```

Operações DDL na mig 153:
- `CREATE OR REPLACE FUNCTION` × 3 (helper + 2 públicas) · NÃO é DROP+CREATE
- `COMMENT ON FUNCTION` × 3
- `NOTIFY pgrst, 'reload schema'`
- DO block sanity check com `RAISE EXCEPTION` defensivo

DML: zero. Toca `public.appointments` apenas via `INSERT INTO public.appointments` e `UPDATE public.appointments` **dentro** das funções (executado por chamada cliente · não no apply da mig).

---

## 9 · Checks de tipos

A pilha TS não usa estas RPCs · typechecks devem permanecer estáveis.

Comandos executados:
- `pnpm --filter @clinicai/lara run typecheck` → ✅ PASS (esperado · zero TS tocado)
- `pnpm --filter @clinicai/repositories run typecheck` → ✅ PASS
- `npx tsc --noEmit` em `packages/ui` → ✅ PASS

Patch em `appointments.repository.js` é JS vanilla legacy · sem cobertura de typecheck. Validado por inspeção de diff e static rg.

---

## 10 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| SQL desta mig diverge do banco real em coluna ou role | Baixa | Review com `pg_get_functiondef` antes do apply · `CREATE OR REPLACE` é atômico |
| `app_role()` retornar NULL para JWTs existentes | Baixa | Aborta com `forbidden_role` · UI legacy mostra erro claro |
| Patch legacy do repo introduzir regressão silenciosa | Baixa | Apenas adiciona path de erro novo · não muda contrato `_ok(data)` retornado em sucesso |
| Operadora com batch grande tentar drainar e excede timeout | Baixa | `appt_sync_batch` continua em erro · não há rollback global · cliente pode chunk |
| `appt_set_canonical`/`appt_set_cortesia` continuarem quebradas | Aceito · fora de escopo | Legacy já tem try/catch nessas chamadas · não bloqueia upsert |
| GRANT EXECUTE perdido | Muito baixa | `CREATE OR REPLACE` preserva grants existentes |

---

## 11 · Como aplicar pós-revisão (Fase 2D.2)

```bash
# 1. Comparar SQL atual no banco
SELECT pg_get_functiondef('public.appt_upsert(jsonb)'::regprocedure);
SELECT pg_get_functiondef('public.appt_sync_batch(jsonb)'::regprocedure);

# 2. Apply
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000153_clinicai_v2_agenda_legacy_writers_canonical.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000153_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000153
rm -rf supabase/migrations

# 4. Validation
#    docs/crm-refactor/sql/phase-2d-agenda-legacy-writers-post-apply-validation.sql
```

---

## 12 · Confirmações negativas

- ❌ Zero apply no banco
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API call
- ❌ Zero deploy
- ❌ Zero alteração schema `appointments` / `leads` / `patients`
- ❌ Zero alteração em outras RPCs (`appointment_attend`/`appointment_finalize`/`appointment_change_status`/`lead_to_appointment`/`lead_lost`/`lead_to_paciente`/`lead_to_orcamento`/`appt_set_canonical`/`appt_set_cortesia`/`appt_list`/`appt_delete*`/`appt_create_series`)
- ❌ Zero alteração em WhatsApp / cron / wa_outbox / wa_agenda_automations / _agenda_alert_min_before_tick / cron.job 71/72
- ❌ Zero alteração em TS Lara v2 (`apps/lara/src/`)
- ❌ Zero backfill
- ❌ Zero commit em git (working tree modificado · aguarda aprovação)

---

## 13 · Histórico

- **2026-05-11:** Fase 2D.1 entrega 6 artefatos prontos para review · zero apply · zero commit
- **Diagnóstico:** auditoria 2026-05-11 (Fase 2D.0 do plano original) confirmou drift entre RPCs legacy e schema canon
- **Próximo:** review do SQL no chat → Fase 2D.2 apply controlado → validation + smoke E2E
