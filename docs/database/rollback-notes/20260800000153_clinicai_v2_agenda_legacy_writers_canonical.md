# Rollback Note · Mig 153 · agenda legacy writers canonical

**Migration:** `20260800000153_clinicai_v2_agenda_legacy_writers_canonical.sql`
**Tipo:** CIRÚRGICA · forward-only · 3 `CREATE OR REPLACE FUNCTION` (helper + 2 públicas)
**Data alvo de apply:** TBD (Fase 2D.2 · controlado · review prévio do SQL)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Eliminar a falha P0 onde o legacy schedule modal (`apps/lara/public/legacy/js/components/schedule-modal.js`) salva appointments no `localStorage` do operador mas a RPC `appt_upsert(jsonb)` falha silenciosamente no banco, porque ainda tenta gravar colunas obsoletas (`patient_name`, `patient_phone`, `professional_idx`, `room_idx`) que não existem mais no schema canon de `public.appointments` (mig 062 + 151 + 152).

A mig 153 recria 2 RPCs públicas + 1 helper interno, aceitando o payload camelCase pt-br exatamente como o legacy envia hoje, mas gravando no schema canônico (`subject_name`, `subject_phone`, `professional_id`, `professional_name`, `scheduled_date`, `start_time`, `end_time`, `procedure_name`, etc).

---

## 2 · Funções alteradas

| Função | Tipo | GRANT |
|---|---|---|
| `public._appt_upsert_one(jsonb, uuid)` | Helper interno (NOVA) | Sem GRANT explícito · só chamada por funções `public.*` SECURITY DEFINER |
| `public.appt_upsert(jsonb)` | Pública · CREATE OR REPLACE | `authenticated`/`service_role` preservados via CREATE OR REPLACE |
| `public.appt_sync_batch(jsonb)` | Pública · CREATE OR REPLACE | `authenticated`/`service_role` preservados via CREATE OR REPLACE |

---

## 3 · Mapeamentos canon (camelCase legacy → snake_case banco)

| Payload legacy | Coluna `appointments` |
|---|---|
| `pacienteNome` | `subject_name` (obrigatório) |
| `pacientePhone` (fallback `pacienteTelefone`) | `subject_phone` |
| `pacienteId` | `lead_id` OU `patient_id` (resolvido contra `public.leads`/`public.patients`) |
| `_professionalId` | `professional_id` |
| `profissionalNome` | `professional_name` |
| `data` | `scheduled_date` (obrigatório) |
| `horaInicio` / `horaFim` | `start_time` / `end_time` (obrigatórios · `end > start`) |
| `procedimento` | `procedure_name` |
| `tipoConsulta` / `tipoAvaliacao` | `consult_type` / `eval_type` |
| `valor` | `value` (`>= 0`) |
| `formaPagamento` | `payment_method` |
| `statusPagamento` | `payment_status` (default `'pendente'` · contrato 5 valores · ver mig 152) |
| `status` | `status` (default `'agendado'` · contrato 13 valores · ver mig 062) |
| `origem` | `origem` |
| `obs` | `obs` |
| `consentimentoImagem` (fallback `consentimento_img`) | `consentimento_img` (default `'pendente'` · contrato 4 valores · ver mig 062) |
| `recurrence_*` / `recurrenceCamelCase` | `recurrence_*` (5 colunas) |

---

## 4 · Validações server-side

A função aborta com `{ ok:false, error:'...' }` antes de qualquer write se:

| Erro | Causa |
|---|---|
| `no_clinic_in_jwt` | `app_clinic_id()` retornou NULL |
| `invalid_payload` | payload não é jsonb object |
| `invalid_payload_expected_array` | sync_batch recebeu não-array |
| `forbidden_role` | role não está em `owner/admin/receptionist/therapist` |
| `id_required` | payload sem `id` |
| `subject_name_required` | payload sem `pacienteNome` |
| `scheduled_date_required` | payload sem `data` |
| `start_time_required` | payload sem `horaInicio` |
| `end_time_required` | payload sem `horaFim` |
| `invalid_date_or_time` | parse failure |
| `end_time_must_be_after_start_time` | `end <= start` |
| `invalid_lead_or_patient_id` | `pacienteId` não existe em `leads` nem `patients` para o tenant |
| `subject_required` | sem `pacienteId` e `status <> 'bloqueado'` |
| `invalid_status` | status fora dos 13 canônicos |
| `invalid_value_negative` | `valor < 0` |
| `invalid_payment_status` | fora do contrato 5 valores |
| `invalid_consentimento_img` | fora do contrato 4 valores |

Validações server-side > client-side. A UI legacy verá strings claras em `result.data.error`.

---

## 5 · Remap de ID legacy

- Se `p_data->>'id'` é UUID válido → usa direto como `id`.
- Se é id legacy (`appt_<ts>_<rand>`) → gera `gen_random_uuid()` novo e retorna:
  ```json
  {
    "ok": true,
    "id": "<novo_uuid>",
    "id_remapped": true,
    "id_legacy_input": "appt_<ts>_<rand>",
    "action": "inserted"
  }
  ```
- Service legacy [`_maybeRemapLocalId`](apps/lara/public/legacy/js/services/appointments.service.js#L304) já trata esse contrato.

---

## 6 · `appt_sync_batch` (batch drainer)

Iteração simples: para cada item do array, chama `_appt_upsert_one`. Não interrompe em erro · agrega counts. Retorna até **20 erros detalhados** no array `errors`:

```json
{
  "ok": true,
  "processed_count": 12,
  "success_count": 10,
  "error_count": 2,
  "remapped_count": 5,
  "errors": [
    { "index": 3, "legacy_id": "appt_xxx", "error": "subject_name_required", "result": {...} },
    { "index": 7, "legacy_id": "...", "error": "invalid_lead_or_patient_id", "result": {...} }
  ]
}
```

`auto-sync` do legacy (`agenda-smart.js:1084`) usa `localStorage.clinicai_appt_synced_v1='done'` como flag de one-shot. Após apply da mig 153 + repo patch, todos os tenants conseguirão drenar o que tiverem em localStorage.

---

## 7 · Não tratado nesta mig

- `procedimentos[]` e `pagamentos[]` (campos canon legacy) NÃO são gravados aqui. A tabela canon `appointments` removeu esses campos no clean-slate (mig 062). O legacy chama `appt_set_canonical` separado depois do `appt_upsert` para esses arrays · esse caminho não é tocado por esta mig. Auditoria separada de `appt_set_canonical`/`appt_set_cortesia` fica para fase futura.
- `appt_list` / `appt_delete` / `appt_delete_series` / `appt_create_series` · não tocadas.
- Lara v2 TS · não usa estas RPCs · zero alterações em `apps/lara/src/`.

---

## 8 · Patch legacy repository

`apps/lara/public/legacy/js/repositories/appointments.repository.js` é atualizado em paralelo para tratar o caso onde a RPC retorna `data.ok === false` (erro lógico tipado · não apenas `error` do Supabase). Sem essa mudança o repo cliente engole o erro tipado e o service não detecta falha.

---

## 9 · Down NO-OP defensivo

`.down.sql` apenas `RAISE NOTICE`. Rollback exige forward migration nova porque:
- Versão anterior (quebrada) reintroduziria o silent failure
- Dropar as funções quebraria o legacy schedule modal
- Não há versão canônica anterior versionada

---

## 10 · Como aplicar pós-revisão (Fase 2D.2 · NÃO executar agora)

```bash
# 1. Comparar SQL atual (READ-ONLY)
#    Cole no Studio:
SELECT pg_get_functiondef('public.appt_upsert(jsonb)'::regprocedure);
SELECT pg_get_functiondef('public.appt_sync_batch(jsonb)'::regprocedure);

# 2. Apply via Management API
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000153_clinicai_v2_agenda_legacy_writers_canonical.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000153_repair_marker.sql
SUPABASE_ACCESS_TOKEN=sbp_... supabase migration repair --status applied 20260800000153
rm -rf supabase/migrations

# 4. Validation (READ-ONLY)
#    docs/crm-refactor/sql/phase-2d-agenda-legacy-writers-post-apply-validation.sql

# 5. Smoke controlado (NÃO destrutivo)
#    Criar lead de teste interno → schedule-modal.js → confirmar row em appointments
```

---

## 11 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Schema canon diverge do esperado (e.g. coluna removida pós-mig 062) | Baixa | Mig 153 lê apenas colunas documentadas em mig 062 · `CREATE OR REPLACE` é atômico |
| `app_role()` retornar `null` para JWTs anônimos legítimos | Baixa | Função rejeita `forbidden_role` explicitamente · UI legacy mostra erro |
| `pacienteId` apontar pra lead/patient soft-deleted | Baixa | Mig 153 filtra `deleted_at IS NULL` · retorna `invalid_lead_or_patient_id` |
| Operadoras com `clinicai_appt_synced_v1` ainda ausente vão tentar drainar batch grande | Baixa | `appt_sync_batch` agora funciona · retorna agregado |
| Sub-call `appt_set_canonical`/`appt_set_cortesia` continuar quebrada | Aceito | Fora de escopo · legacy já trata em try/catch · não bloqueia upsert |
| GRANT EXECUTE perdido após CREATE OR REPLACE | Muito baixa | `CREATE OR REPLACE` preserva grants existentes (não é DROP+CREATE) |

---

## 12 · Confirmações negativas (estado da prep)

- ❌ Zero apply no banco
- ❌ Zero SQL mutativo executado
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API call
- ❌ Zero deploy
- ❌ Zero alteração no schema da tabela `appointments`
- ❌ Zero alteração em `lead_to_appointment`/`appointment_attend`/`appointment_finalize`/`appointment_change_status`/`appt_set_canonical`/`appt_set_cortesia`/`appt_list`/`appt_delete`/`appt_create_series`/`_lead_phase_transition_allowed`
- ❌ Zero alteração em WhatsApp/cron/wa_outbox/wa_agenda_automations
- ❌ Zero alteração em código TS Lara v2 (`apps/lara/src/`)
- ❌ Zero backfill

---

## 13 · Histórico

- **2026-05-11:** Mig 153 PREPARADA via Fase 2D.1 (sem apply)
- **Diagnóstico:** auditoria read-only confirmou drift entre `appt_upsert`/`appt_sync_batch` (referenciam colunas legadas) e schema canon (`subject_name`/`subject_phone`/`professional_id`)
- **Próximo:** review do SQL no chat → Fase 2D.2 apply controlado → validation + smoke E2E
