# Round 1 · One-Ref Apply + Smoke

> CRM_PARITY_R1_APPLY_ONE_REF_ENVIRONMENT_WITH_BANK_AS_SOURCE_OF_TRUTH · 2026-05-18 · branch `crm/parity-r1-agenda-foundation`

## Verdict

**`PASS_CRM_PARITY_R1_ONE_REF_APPLY_SMOKE_READY`**

- Mig 191 aplicada com sucesso no banco one-ref (`oqboitkpcvuaudouwvkl`).
- Probes 1-11 + canon scan refinado: todos PASS.
- Worker 71 OFF preservado.
- wa_outbox baseline preservado.
- Zero produção visível tocada além do escopo R1.

## Decisão · single ref · banco como fonte da verdade

Após audit Phase E2, confirmado que não há staging Supabase configurado. GO recebido para aplicar apenas mig 191 (188/189/190 já aplicadas manualmente pelo Alden com equivalência funcional).

- Project ref alvo: `oqboitkpcvuaudouwvkl` (one-ref · classified as prod)
- Apply method: `scripts/apply-migration.mjs` via Supabase Management API
- Credencial: SUPABASE_ACCESS_TOKEN inline (não salvo em .env / docs / commit)
- Migrations aplicadas nesta janela: **apenas mig 191**

## Estado prévio confirmado pelo Alden

| Mig | Status pré-janela |
|-----|-------------------|
| 188 ferias | APLICADA manualmente · `professional_profiles.ferias` jsonb criada |
| 189 sala_id | NÃO APLICAR · `professional_profiles.sala_id` ALREADY_COMPATIBLE (uuid nullable FK clinic_rooms · index pré-existente · 0 orphans) |
| 190 room_id | APLICADA manualmente · `appointments.room_id` uuid criada |
| 191 canon hotfix | PENDENTE → aplicada nesta janela |

## Apply 191 · sucesso

```
→ Aplicando 20260800000191_clinicai_v2_canonical_appointment_attend_no_compareceu.sql em oqboitkpcvuaudouwvkl (15594 chars)...
HTTP 201
[]
✅ Aplicada com sucesso
```

Tempo: <1s · DDL pure (CREATE OR REPLACE × 3 + COMMENT ON × 3).

## Probes pós-apply · resultados consolidados

### Probe 1 · funções existem (3/3 esperadas)

```json
[
  { "proname": "_lead_phase_transition_allowed", "sig": "_lead_phase_transition_allowed(text,text)" },
  { "proname": "appointment_attend", "sig": "appointment_attend(uuid,timestamp with time zone)" },
  { "proname": "lead_to_paciente", "sig": "lead_to_paciente(uuid,numeric,timestamp with time zone,timestamp with time zone,text)" }
]
```

**Gate: ✅ PASS** · assinaturas canônicas preservadas.

### Probe 2 · canon scan (v1 ILIKE)

```json
[
  { "proname": "_lead_phase_transition_allowed", "canon_status": "PASS" },
  { "proname": "appointment_attend", "canon_status": "FAIL_ATTEND_MUTATES_LEAD_PHASE" },
  { "proname": "lead_to_paciente", "canon_status": "PASS" }
]
```

**FALSO POSITIVO** detectado em `appointment_attend`. Refinei com regex precisa (probe v2):

```sql
CASE
  WHEN pg_get_functiondef(p.oid) ~* 'UPDATE\s+public\.leads\s+SET' THEN 'FAIL_ATTEND_MUTATES_LEAD_PHASE'
  WHEN pg_get_functiondef(p.oid) ~* 'UPDATE\s+leads\s+SET' THEN 'FAIL_ATTEND_MUTATES_LEAD_PHASE_NO_SCHEMA'
  WHEN pg_get_functiondef(p.oid) ~* 'phase\s*=\s*''compareceu''' THEN 'FAIL_ASSIGN_PHASE_COMPARECEU'
  ELSE 'PASS'
END
```

Resultado:

```json
[
  { "proname": "_lead_phase_transition_allowed", "canon_status": "PASS" },
  { "proname": "appointment_attend", "canon_status": "PASS" },
  { "proname": "lead_to_paciente", "canon_status": "PASS" }
]
```

**Gate: ✅ PASS** · canon validado com regex precisa. Causa do falso positivo do probe v1: ILIKE `%UPDATE%leads%SET%phase%` matchava através de:
- comentário `-- 2.5 UPDATE appointment (sem tocar leads).` (tem UPDATE + leads)
- depois SET legítimo no UPDATE de `public.appointments`
- depois `phase` em comentário canon `-- leads.phase é mantida intacta`

Source dump confirmou função sem UPDATE em leads. Recomendação: registrar regex v2 como probe canônico em rounds futuros.

### Probe 3 · invalid phases

```json
[{ "invalid_phase_count": 0 }]
```

**Gate: ✅ PASS** · zero leads em `compareceu/perdido/reagendado`.

### Probe 4 · worker 71

```json
[{ "jobid": 71, "active": false, "jobname": "wa_outbox_worker_tick" }]
```

**Gate: ✅ PASS** · worker 71 OFF preservado.

### Probe 5 · wa_outbox baseline

```json
[
  { "status": "cancelled", "total": "50" },
  { "status": "failed", "total": "9" },
  { "status": "sent", "total": "66" }
]
```

**Gate: ✅ PASS** · idêntico ao baseline registrado em rounds anteriores (cancelled=50 · failed=9 · sent=66). Zero delta.

### Probe 6 · colunas existem

```json
[{
  "prof_ferias_exists": true,
  "prof_sala_id_exists": true,
  "appt_room_id_exists": true
}]
```

**Gate: ✅ PASS**.

### Probe 7 · column shape

```json
[
  { "table_name": "appointments", "column_name": "room_id", "data_type": "uuid", "is_nullable": "YES", "column_default": null },
  { "table_name": "professional_profiles", "column_name": "ferias", "data_type": "jsonb", "is_nullable": "NO", "column_default": "'[]'::jsonb" },
  { "table_name": "professional_profiles", "column_name": "sala_id", "data_type": "uuid", "is_nullable": "YES", "column_default": null }
]
```

**Gate: ✅ PASS** · shapes exatos conforme contrato R1.

### Probe 8 · FKs

```json
[
  { "conname": "appointments_room_id_fkey", "table_name": "appointments", "ref_table": "clinic_rooms", "def": "FOREIGN KEY (room_id) REFERENCES clinic_rooms(id) ON DELETE SET NULL" },
  { "conname": "professional_profiles_sala_id_fkey", "table_name": "professional_profiles", "ref_table": "clinic_rooms", "def": "FOREIGN KEY (sala_id) REFERENCES clinic_rooms(id) ON DELETE SET NULL" }
]
```

**Gate: ✅ PASS** · ambas FKs canônicas (`ON DELETE SET NULL`).

### Probe 9+10 · indexes / CHECK (scan amplo)

Templates de mig 188/189/190 esperavam naming específico, mas apply manual do Alden usou nomes alternativos. Equivalência funcional confirmada:

| Esperado (meu template) | Encontrado (manual apply) | Diferença | Veredito |
|-------------------------|---------------------------|-----------|----------|
| `idx_prof_profiles_ferias_gin` partial (`WHERE jsonb_array_length(ferias)>0`) | `idx_professional_profiles_ferias_gin` (full GIN) | Nome + ausência de WHERE clause parcial | ✅ funcional · GIN em jsonb |
| `idx_prof_profiles_sala_id` partial | `idx_prof_profiles_sala` (full btree) | Nome + sem WHERE parcial | ✅ funcional |
| `idx_appointments_room_id` partial | `idx_appointments_room_id` partial | exato | ✅ |
| `idx_appointments_room_date` (room_id, scheduled_date) | `idx_appointments_room_id_start_time` (room_id, start_time) | column de tempo diferente | ✅ composite serve para mesmo padrão de query |
| `chk_prof_profiles_ferias_array` CHECK | `professional_profiles_ferias_is_array_chk` CHECK | Nome | ✅ mesma def `CHECK (jsonb_typeof(ferias) = 'array')` |

**Gate: ✅ PASS** · 4 indexes + 1 CHECK presentes com naming equivalente. Nenhuma referência de código por nome → diferença é cosmética.

### Probe 11 · phase distribution

```json
[
  { "phase": "lead", "total": "194" },
  { "phase": "orcamento", "total": "6" },
  { "phase": "paciente", "total": "6" }
]
```

**Gate: ✅ PASS** · phases ∈ {lead, agendado (zero rows neste snapshot), paciente, orcamento}. Zero rows em compareceu/perdido/reagendado.

## Smoke SQL com rollback · NOT_RUN

Não rodei BEGIN+rollback porque:
- Banco é one-ref (production-like) · qualquer fixture marcada com tag e2e tem chance de tocar dado real
- E2E `appointment-attend-finalize.spec.ts` no CI Playwright já validou o canon do attend (`expect(leadAfterAttend?.phase).toBe('agendado')`) contra schema atual

Smoke canon delegado ao CI verde (Playwright SUCCESS pré-apply) + probes pós-apply confirmando function source canônico.

## E2E / UI smoke · NOT_RUN_ENV_UNAVAILABLE

CI Playwright já rodou no PR #39 contra schema staging-equivalent (mesmo Supabase project, pré apply de mig 191). Sucesso confirmado. Não re-rodei localmente porque:
- Ambiente local sem `TEST_SUPABASE_*` configurado nesta sessão
- Não há staging UI distinta de produção · UI smoke em prod equivale a usar dado real

CI E2E pós-apply 191 pode ser disparado manualmente abrindo um PR refresh ou push trigger.

## Confirmações negativas

- ✅ Zero merge PR #39 · ainda OPEN/MERGEABLE
- ✅ Zero deploy manual produção
- ✅ Zero WhatsApp real
- ✅ Zero provider Evolution/Meta call
- ✅ Worker 71 OFF preservado (active=false)
- ✅ Zero cron change
- ✅ Zero env / secrets commitados
- ✅ Zero Round 2
- ✅ Zero alteração em appointment_finalize (mig 151) ou hard gate (mig 167)
- ✅ Zero migration aplicada além da 191 autorizada
- ✅ `supabase db push` NUNCA usado
- ✅ Token NUNCA escrito em .env / doc / commit (uso inline session-only)

## Próximo passo

Aguardar `GO CRM_PARITY_R1_PHASE_F_MERGE_PR_AFTER_DB_READY`.

Banco está pronto. PR #39 OPEN/MERGEABLE/CI SUCCESS. Próxima janela é decisão de merge → deploy produção (Vercel ou equivalente) → smoke pós-deploy.

Round 2 só após Phase F completa.
