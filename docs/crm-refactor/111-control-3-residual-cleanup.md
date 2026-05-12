# CRM_PHASE_CONTROL.3 · Residual cleanup audit (Trilha A · audit-only)

> Trilha A escolhida. Sistema está sano · zero zombie em runtime · grants
> Alexa já estavam sem `authenticated`/`anon` (CONTROL.2 tratou). Resíduos
> remanescentes têm dados/dependências indiretas que tornam DROP arriscado
> sem fase dedicada. Esta fase **documenta** o que existe e classifica
> cada objeto, sem alterar banco.

---

## 1 · Objetivo

Auditar resíduos legados (Alexa · appointments sem `professional_id` ·
status zumbi · `phase='perdido'`) e classificar cada item entre limpo
agora / mantido / precisa fase dedicada.

Sem migration. Sem DROP. Sem REVOKE. Sem backfill.

---

## 2 · Contexto

| Item | Estado |
|---|---|
| Branch · HEAD inicial | `main` · `25ac17d` |
| Worker 71 | OFF |
| `wa_outbox` unsafe | 0 |
| `phase='perdido'` em leads | 0 |
| Status inválidos em appointments | 0 |
| Hard gate (`appointment_finalize` etc) | 5/5 presentes |
| CONTROL.2 (anterior) | revogou EXECUTE `authenticated` das 2 RPCs Alexa |

---

## 3 · Preflight read-only · achados completos

### 3.1 Alexa legacy

**Tabelas (3):**

| Tabela | Rows | Dependências externas | Decisão |
|---|---:|---|---|
| `clinic_alexa_config` | 1 | 0 (pkey/unique próprias) | **KEEP_FOR_ROLLBACK** · contém configuração da clínica · drop perderia info histórica |
| `clinic_alexa_devices` | 5 | 0 (pkey próprio) | **KEEP_FOR_ROLLBACK** · 5 devices configurados |
| `clinic_alexa_log` | 0 | 0 | **DROP_SAFE** (tecnicamente) · mas mantido para fase dedicada futura |

**Funções (2):**

| Função | Args | Grants ativos | Dependências | Decisão |
|---|---|---|---|---|
| `get_alexa_config()` | — | `postgres`, `service_role` | 0 | **REVOKE_DONE_PRIOR_PHASE** · sem `authenticated`/`anon` (CONTROL.2 tratou) |
| `upsert_alexa_config(...)` | webhook/device/template/etc | `postgres`, `service_role` | 0 | **REVOKE_DONE_PRIOR_PHASE** |

**Colunas Alexa em outras tabelas (3):**

| Tabela | Coluna | Rows da tabela | Decisão |
|---|---|---:|---|
| `clinic_rooms` | `alexa_device_name` | (tabela ativa) | **NEEDS_REVIEW** · `clinic_rooms` é tabela canônica · DROP de coluna em tabela viva é alto risco · avaliar em fase dedicada |
| `wa_agenda_automations` | `alexa_message` | 93 | **NEEDS_REVIEW** · tabela com 93 rows · drop pode quebrar UI/automações |
| `wa_agenda_automations` | `alexa_target` | 93 | **NEEDS_REVIEW** |

**Grants perigosos remanescentes:** **0** (`alexa_authenticated_execute_grants=0`).

### 3.2 Appointments sem `professional_id`

`appointments_without_professional_count = 3` · **todos com `status='finalizado'`**.

| id (8 chars) | Data | Procedure | Created at |
|---|---|---|---|
| c7eba4af | 2026-05-03 | Avaliação Full Face | 2026-05-02 |
| 8524216b | 2026-05-02 | Consulta teste | 2026-05-01 |
| 22222222 | 2026-05-02 | (vazio) | 2026-05-02 |

**Decisão:** `LEGACY_ACCEPTED`. São registros históricos finalizados antes do
`CRM_PHASE_2AUX.2` (que tornou `professional_id` FK first-class). Backfill
exigiria saber qual profissional realizou cada atendimento · sem evidência,
zero backfill. UUID `22222222-2222...` parece seed/teste.

### 3.3 Status zumbi em runtime

| Termo | Em `appointments.status` | Em `leads.phase` | Em `pg_proc` (public) |
|---|---:|---:|---:|
| compareceu | 0 | 0 | 0 |
| pre_consulta | 0 | n/a | 0 |
| em_consulta | 0 | n/a | 0 |
| attending | 0 | 0 | 0 |
| converted | 0 | 0 | 0 |
| perdido | n/a | 0 | n/a |

**Decisão:** **TOTAL = 0**. Sistema está limpo em runtime.

### 3.4 phase = 'perdido' em runtime

- `leads.phase='perdido'` count: **0**
- Código TS verificado: todas as referências a `'perdido'` no app são para
  **`lifecycleStatus='perdido'`** (canônico correto), nunca `phase='perdido'`.
- Comentários em [LeadFiltersPanel.tsx](../../apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx)
  e [leads/page.tsx](../../apps/lara/src/app/(authed)/leads/page.tsx#L103-L114) documentam o contrato.

**Decisão:** sem ação · contrato respeitado em código e dados.

### 3.5 wa / provider

- Worker 71: **OFF**
- `wa_outbox` unsafe: 0
- Cron com provider call: 0
- Jobs 12/72/89-94 ativos como esperado

**Decisão:** sem ação.

### 3.6 Hard gate clínico

5 funções presentes:

- `appointment_finalize`
- `appointment_clinical_gate_status`
- `appointment_anamnesis_upsert`
- `appointment_anamnesis_mark_complete`
- `complete_anamnesis_form`

**Decisão:** sem ação · intocadas conforme regra.

### 3.7 Código TypeScript

| Padrão buscado | Refs ativas em runtime |
|---|---|
| `clinic_alexa_config`, `get_alexa_config`, `upsert_alexa_config` | **0** em app · 1 em `packages/supabase/src/types.ts` (auto-gerado typegen · não é runtime) |
| `alexa_device_name`, `alexa_message`, `alexa_target` | **0** (idem · só typegen) |
| Status zumbi com aspas/literal | **0** |
| `phase='perdido'` | **0** (apenas comentários documentando o contrato) |

---

## 4 · Decisão da trilha

**Trilha A · audit-only.**

Razões:
1. Sistema **operacionalmente limpo** · zero zombie em dados, zero grant
   perigoso, zero ref de runtime errada.
2. Tabelas Alexa têm dados de configuração · DROP destrói histórico.
3. Colunas Alexa em `clinic_rooms`/`wa_agenda_automations` estão em
   tabelas vivas · DROP exige análise dedicada.
4. Os 3 appointments sem `professional_id` são finalizados antigos ·
   backfill sem evidência é violação de contrato.

Migrar nada agora é mais valioso do que tentar limpar algo borderline.
Esta fase é **controle**, não feature.

---

## 5 · Objetos mantidos e por quê

| Objeto | Por quê mantido |
|---|---|
| `clinic_alexa_config` (1 row) | Configuração histórica · DROP perderia info | 
| `clinic_alexa_devices` (5 rows) | Devices registrados · histórico de configuração |
| `clinic_alexa_log` (0 rows) | Tecnicamente seguro dropar · mantido para drop em fase dedicada agrupada |
| `get_alexa_config()`, `upsert_alexa_config()` | Grants `authenticated`/`anon` já zerados em CONTROL.2 · risco residual = baixo · DROP em fase dedicada |
| `clinic_rooms.alexa_device_name` | Coluna em tabela viva · DROP exige migration controlada |
| `wa_agenda_automations.alexa_message/alexa_target` | Tabela com 93 rows · DROP pode quebrar UI legacy/dashboards |
| 3 appointments sem `professional_id` | Histórico finalizado · backfill sem evidência |

---

## 6 · Objetos limpos nesta fase

**Nenhum.** Trilha A · zero alteração de banco · zero migration.

---

## 7 · Riscos

- Manter objetos Alexa não cria risco operacional ativo (grants `authenticated`
  zerados · cron sem provider call · job 71 OFF).
- Único risco residual é cosmético / dívida técnica: tipos auto-gerados em
  `packages/supabase/src/types.ts` continuam expondo as tabelas/funções
  Alexa para autocompletar. Mitigado porque app não importa essas symbols.

---

## 8 · Rollback notes

Sem alteração · rollback trivial = `git reset --hard HEAD~1` se o commit
docs precisar ser desfeito. Banco intocado em produção.

---

## 9 · Validações executadas

| Validation | Resultado |
|---|---|
| `git diff --check` | sem warnings (apenas CRLF auto) |
| SQL validation `phase-control-3-residual-cleanup-validation.sql` | final_flags green |

Typecheck não foi executado nesta fase porque **zero código TS foi alterado**
(documentação e SQL apenas).

Validation flags chave:

- `worker71_off`: true
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `hard_gate_untouched`: true
- `alexa_legacy_objects_count`: 5 (3 tabelas + 2 funções)
- `alexa_authenticated_execute_grants`: 0
- `appointments_without_professional_count`: 3
- `zumbi_function_count`: 0
- `runtime_zombie_refs_expected_zero`: 0
- `audit_only`: true
- **`can_continue`: true**

---

## 10 · Próximos passos

A combinada principal é **2L.2.1 / 2L.3 · Meta/WhatsApp real** quando
dependências externas estiverem prontas. Mas se quiser fechar o resíduo
Alexa antes:

- **CRM_PHASE_CONTROL.3B · Alexa drop final**: migration controlada para
  - `DROP TABLE clinic_alexa_log` (0 rows · sem deps);
  - `DROP FUNCTION get_alexa_config()` + `upsert_alexa_config(...)` (sem deps);
  - **MANTER** `clinic_alexa_config`, `clinic_alexa_devices` por enquanto;
  - **MANTER** colunas em `clinic_rooms`/`wa_agenda_automations` por enquanto.
- **CRM_PHASE_APPOINTMENT_PROCEDURE_FK**: aplicar `PROPOSED_appointments_procedure_fk.sql`.
- **CRM_PHASE_PATIENT_RECORD.MEDIA_VAULT**: destravar `medical_record_attachments`.

---

## 11 · Veredito

**PASS_CRM_CONTROL3_RESIDUAL_AUDIT_READY_LOCAL_COMMIT**

- Trilha A · audit-only
- Zero migration · zero DROP · zero REVOKE · zero backfill
- Hard gate intocado · job 71 OFF · sistema sano
- Commit local: docs + SQL validation
- Aguardando autorização para `git push origin main`
