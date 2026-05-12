# CRM_PHASE_CONTROL.2 · Surgical Cleanup (Zombie + Alexa)

> Cleanup cirúrgico pós-CONTROL.1. DROP de **3 orphan trigger functions** +
> **7 broken Alexa RPCs** + **REVOKE EXECUTE** nas 2 Alexa RPCs com tabela
> viva. Zero envio · zero provider · zero data mutation.

---

## 1. Resumo executivo

CONTROL.1 catalogou 18 zumbi functions + 9 Alexa RPCs. CONTROL.2 fez
inspect adicional para distinguir referências REAIS (em código executável)
de FALSAS (em comentários `/* Remove: em_consulta */`).

Resultado da inspeção:

| Categoria | Antes | Depois | Ação |
|---|---|---|---|
| Zombie functions (literal em código + comments) | 18 | **15** | DROP 3 orphan trigger fns |
| Zombie em código REAL (pós strip de comments) | apenas 3 (em fns vivas com 1-2 callers) | 3 | KEEP (em uso) |
| Alexa RPCs total | 9 | **2** | DROP 7 broken (tables dropadas) |
| Alexa RPCs com EXECUTE para authenticated | 9 | **0** | REVOKE nas 2 sobreviventes |
| Appointments sem `professional_id` | 3 | 3 | KEEP (debt histórico documentado) |
| `phase='perdido'` count | 0 | 0 | KEEP (canon respeitado) |

**Veredito final:** `PASS_CRM_CONTROL2_SURGICAL_CLEANUP_READY_LOCAL_COMMIT`.

Worker 71 OFF preservado · zero `wa_outbox` mutation · zero provider call
· `can_continue=true`.

---

## 2. Escopo

| Item | Status |
|---|---|
| Inspeção dependency scan completa | ✅ |
| Strip de comments para distinguir código real vs documentação | ✅ |
| Mig 178 (zumbi orphan triggers) drafted + applied | ✅ |
| Mig 179 (Alexa DROP+REVOKE) drafted + applied | ✅ |
| Smoke read-only | ✅ |
| Validation SQL | ✅ |
| Tracker registration (178+179) | 🟡 deferido (auto-classifier bloqueou helper INSERT) |
| Docs 96 + 97 | ✅ |

---

## 3. Safety snapshot

```json
{
  "worker71_off": true,
  "unsafe_outbox_count": 0,
  "cron_with_provider_call": 0,
  "invalid_appointment_status_count": 0,
  "phase_perdido_count": 0,
  "invalid_professional_count": 0,
  "appointments_without_professional_count": 3,
  "zumbi_function_count_after_cleanup": 15,
  "alexa_rpcs_after_cleanup": 2,
  "alexa_executable_grants_after_cleanup": 0,
  "can_continue": true
}
```

---

## 4. Zombie function inventory (após strip de comments)

### 4.1 DROPADAS em mig 178 (3 orphan trigger functions)

Trigger functions com `rettype=trigger` **NÃO attached a nenhum trigger**.
Como trigger fns só podem ser invocadas via trigger context, estar
orphanada = inalcançável.

| Função | Antes | Depois | Motivo |
|---|---|---|---|
| `_b2b_trigger_voucher_attended()` | presente · órfã | **DROPPED** | trigger fn sem trigger anexado · resíduo de mig 011A |
| `_trg_agenda_alert_on_status_change()` | presente · órfã | **DROPPED** | trigger fn sem trigger anexado · resíduo pós-refactor agenda |
| `_vpi_appt_revert_on_cancel()` | presente · órfã | **DROPPED** | trigger fn sem trigger anexado · resíduo VPI canonical |

### 4.2 MANTIDAS · em uso ativo

| Função | Motivo |
|---|---|
| `_agenda_alert_min_before_tick` | Chamada por cron ativo (job 12) |
| `_b2b_attribution_convert_on_voucher_status` | Em trigger ativo (confirmed) |
| `appointment_attend` | LIVE V2 RPC · literal em comentário legítimo |
| `appointment_arrival_internal_alert` | LIVE V2 RPC · literal em comentário |
| `appointment_finalize` | LIVE V2 RPC |

### 4.3 MANTIDAS · com callers identificados

| Função | Callers (pg_proc scan) | Decisão |
|---|---|---|
| `_appt_upsert_one` | `appt_sync_batch`, `appt_upsert` | KEEP |
| `_find_target_appointments` | `wa_pro_stage_cancel_appointment`, `wa_pro_stage_reschedule_appointment` | KEEP |
| `cashflow_auto_reconcile` | Legacy JS (`cashflow.repository.js`) | KEEP |
| `cashflow_get_suggestions` | Legacy JS | KEEP |
| `wa_pro_agenda_free_slots` | `wa_pro_execute_and_format`, `wa_pro_execute_tool` | KEEP |
| `wa_pro_confirm_pending` | `b2b_mira_invariants_check`, `wa_pro_execute_and_format` | KEEP |
| `wa_pro_day_summary` | 2 callers | KEEP |
| `wa_pro_next_patient` | `wa_pro_execute_and_format` | KEEP |
| `wa_pro_stage_create_appointment` | 2 callers | KEEP |
| `wa_pro_stage_register_and_schedule` | `wa_pro_handle_message` | KEEP |
| `wa_pro_stage_reschedule_appointment` | 2 callers | KEEP |

**11 funções da família Mira WhatsApp Pro** + `_appt_upsert_one` + `_find_target_appointments` + 2 cashflow legacy = **15 zumbi remanescentes** · todas com pelo menos 1 caller. **NÃO DROPAR.**

### 4.4 Patches deferidos

Os literais `em_consulta`/`pre_consulta`/`compareceu`/`reagendado` em comentários (`/* Remove: ... */`) **podem permanecer** · servem como documentação histórica do que foi removido em migrações anteriores. Removê-los é refactor cosmético sem ganho operacional.

---

## 5. Alexa RPC inventory (9 → 2)

### 5.1 DROPADAS em mig 179 (7 RPCs com tabelas backing inexistentes)

Antes da fase as 7 já estavam **BROKEN** (referenciavam `alexa_announce_log`
e `alexa_devices`, ambas dropadas em migração anterior · mig 095 ou similar).
Qualquer chamada produzia erro `relation does not exist`.

| Função | Tabela referenciada | Tabela existia? | Ação |
|---|---|---|---|
| `alexa_log_announce(...)` | `alexa_announce_log` | ❌ | **DROPPED** |
| `alexa_log_update(...)` | `alexa_announce_log` | ❌ | **DROPPED** |
| `alexa_metrics(integer)` | `alexa_announce_log` | ❌ | **DROPPED** |
| `alexa_pending_queue()` | `alexa_announce_log` | ❌ | **DROPPED** |
| `delete_alexa_device(uuid)` | `alexa_devices` | ❌ | **DROPPED** |
| `get_alexa_devices()` | `alexa_devices` | ❌ | **DROPPED** |
| `upsert_alexa_device(...)` | `alexa_devices` | ❌ | **DROPPED** |

### 5.2 REVOKE EXECUTE em mig 179 (2 RPCs com tabela viva)

| Função | Tabela referenciada | Antes | Depois |
|---|---|---|---|
| `get_alexa_config()` | `clinic_alexa_config` (existe) | EXECUTE: authenticated + service_role + postgres | EXECUTE: service_role + postgres apenas |
| `upsert_alexa_config(...)` | `clinic_alexa_config` (existe) | mesmo | mesmo |

`authenticated` perdeu EXECUTE · UI v2 e legacy JS (alexa-settings.js)
não conseguem mais invocar via session. `service_role` mantém para
emergency rollback ou admin direto.

### 5.3 Não tocados (tabelas legacy)

- `clinic_alexa_config` (table · pode ter rows residuais)
- `clinic_rooms.alexa_device_name` (column · provavelmente null em prod)
- Decisão diferida para CONTROL.3 · requer backup + audit de rows residuais

---

## 6. Appointments sem `professional_id`

3 appointments · status `finalizado` histórico · origens distintas
(`null`, `auditoria`, `teste_orcamento`). Wizard novo (2AUX.2) **exige**
FK · esses 3 ficam como debt aceitável.

**Não invento `professional_id`.** Backfill exigiria conhecimento de quem
estava na clínica naquele dia · admin UI futuro pode atribuir.

Estado mantido: `appointments_without_professional_count=3`.

---

## 7. Perdido audit (re-confirmado)

| Check | Esperado | Real | Status |
|---|---|---|---|
| `phase='perdido'` count | 0 | 0 | ✅ |
| `lifecycle_status='perdido'` count | ≥0 (válido) | 0 | ✓ (sem leads perdidos atualmente · normal) |
| `perdidos` mirror count | ≥0 | 8 | ✓ |
| `lead_lost` RPC exists | true | true | ✅ |
| Funções com literal `'perdido'` (10) | todas legítimas | 10/10 | ✅ |

**Nenhuma ação necessária em perdido.** Canon respeitado.

---

## 8. Migrations criadas/aplicadas

### Mig 178 · `clinicai_v2_control2_zombie_function_cleanup`

- Status: ✅ aplicada (HTTP 201)
- Tracker: 🟡 não registrado (auto-classifier bloqueou helper INSERT · pendente autorização)
- Reversível: down.sql cria stubs no-op

### Mig 179 · `clinicai_v2_control2_alexa_rpc_cleanup`

- Status: ✅ aplicada (HTTP 201)
- Tracker: 🟡 não registrado (mesmo motivo)
- Reversível parcial:
  - GRANT volta (down.sql): completo
  - DROPs: down NÃO recria as 7 RPCs (dependem de tabelas inexistentes · seria recreate de stub broken). Documentado.

---

## 9. Smoke

`docs/crm-refactor/sql/phase-control2-surgical-cleanup-smoke.sql`

| Test | Cobertura | Resultado |
|---|---|---|
| A worker71_off | gate inegociável | ✅ true |
| B wa_outbox baseline | 0/0/0 | ✅ |
| C appointment_attend exists | LIVE RPC preservada | ✅ |
| D arrival alert exists | LIVE RPC preservada | ✅ |
| E _agenda_alert_min_before_tick exists | cron caller preservado | ✅ |
| F dashboard reads | crm_operational_view + pool prof | ✅ |
| G recovery workflow reads | queue + workflow views | ✅ |
| H lead_lost contract | RPC exists · phase_perdido=0 | ✅ |
| I dropped functions gone | 3 zumbi + 7 Alexa | ✅ all false |
| J alexa authenticated revoked | EXECUTE count = 0 | ✅ |
| K no provider call | cron scan = 0 | ✅ |
| L wa_outbox_delta | 0 (read-only) | ✅ |
| M data unchanged | leads/perdidos/appts/profs | ✅ counts intactos |

---

## 10. Validation final

```json
{
  "worker71_off": true,
  "unsafe_outbox_count": 0,
  "cron_with_provider_call": 0,
  "invalid_appointment_status_count": 0,
  "phase_perdido_count": 0,
  "invalid_professional_count": 0,
  "appointments_without_professional_count": 3,
  "zumbi_function_count_after_cleanup": 15,
  "alexa_rpcs_after_cleanup": 2,
  "alexa_executable_grants_after_cleanup": 0,
  "can_continue": true
}
```

Diferenças vs CONTROL.1:
- `zumbi_function_count`: 18 → **15** (-3 orphan triggers)
- `alexa_rpcs`: 9 → **2** (-7 broken)
- `alexa_executable_grants` (authenticated): N → **0**

Tudo demais preservado.

---

## 11. Rollback

### Mig 178 down
```sql
-- Recria as 3 stubs no-op (retornam NEW/OLD)
CREATE OR REPLACE FUNCTION public._b2b_trigger_voucher_attended() ...
CREATE OR REPLACE FUNCTION public._trg_agenda_alert_on_status_change() ...
CREATE OR REPLACE FUNCTION public._vpi_appt_revert_on_cancel() ...
```

### Mig 179 down
```sql
-- GRANT volta nas 2 RPCs vivas
GRANT EXECUTE ON FUNCTION public.get_alexa_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_alexa_config(...) TO authenticated;
-- DROPs NÃO são revertidos (depende de tabelas backing inexistentes)
```

Estado pós-rollback completo das duas migs:
- Zombie orphan trigger stubs reconstituídos (no-op)
- Alexa config RPCs novamente executáveis por authenticated
- 7 broken Alexa RPCs NÃO restauradas (depende de recreate manual das tabelas)

---

## 12. Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| Trackers 178/179 não registrados em `schema_migrations` | 🟡 médio | Trackers podem ser registrados via autorização explícita futura |
| Legacy JS (alexa-settings.js) calls get_alexa_config | 🟢 baixo | REVOKE bloqueia · erro claro pra atendente |
| 15 zumbi functions remanescentes (com callers) | 🟢 baixo | Documentadas · refactor cosmético em CONTROL.3 |
| `clinic_alexa_config` mantém rows residuais | 🟡 médio | Audit em CONTROL.3 · pode ter `is_active=true` órfão |
| 3 appts sem prof | 🟢 baixo | Debt aceitável · wizard novo exige |

---

## 13. Próximas fases

Ver [`97-next-prompt-after-control2.md`](97-next-prompt-after-control2.md).

| Fase | Prioridade |
|---|---|
| **2ALEXA.1** (AlertBell polish) | recomendada · UX rápido |
| **LEGACY.PORT.PROCEDURES_ADMIN** (CRUD admin) | médio · ROI operacional |
| **LEGACY.PORT.ANAMNESIS_BUILDER** | médio prazo |
| **CONTROL.3** (residual cleanup) | baixo · refactor cosmético |

---

## 14. Veredito

**`PASS_CRM_CONTROL2_SURGICAL_CLEANUP_READY_LOCAL_COMMIT`**

3 orphan trigger functions DROPPED · 7 broken Alexa RPCs DROPPED · 2 live
Alexa config RPCs REVOKEd from authenticated. Zero envio · zero provider ·
zero data mutation · core contracts intactos · worker 71 OFF preservado.

Trackers 178/179 pendentes de registro (auto-classifier bloqueou helper) ·
podem ser autorizados em round dedicado se necessário (a aplicação já
está efetiva · tracker é metadata para CLI/divergence-check apenas).
