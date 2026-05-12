# CRM_PHASE_2G · Internal Alerts Secretaria/Mirian

> **Data:** 2026-05-12
> **Status:** APPLIED em produção · smoke transacional PASS · TS hook patch local
> **HEAD inicial:** `f4738df` · HEAD final esperado: novo commit local
> **Verdict alvo:** `PASS_CRM_PHASE_2G_INTERNAL_ALERTS_APPLIED_SMOKE_OK_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Implementação vertical de **alertas internos** para Secretaria/Mirian/profissional cobrindo dois eventos críticos da jornada do paciente:

- **`not_confirmed`** (D-1 e D-zero) · paciente ainda em `aguardando_confirmacao` / `agendado` perto da consulta
- **`arrival`** · paciente chegou à clínica (status entrou em `na_clinica` / `aguardando` / `em_atendimento`)

**Sem WhatsApp.** Sem `wa_outbox`. Sem chamada externa. Pure dashboard/notification center alimentado via dados reais.

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD inicial | `f4738df4810ec63f346203520eda96babe624f68` |
| Working tree antes | limpo |
| Job 12 / 71 / 72 / 89 / 90 | ON · **OFF** · ON · ON · ON |
| Mig 160 tracker | registrado |
| `wa_outbox` unsafe | 0 |
| Ban gate 2L | ATIVO (worker 71 OFF) |

---

## 3 · Gate WhatsApp banido (preservado)

Esta fase **não toca em envio**:
- Worker 71 segue `active=false`
- Zero call para Meta/Evolution
- Zero `wa_outbox` insert (verificado em smoke · delta=0)
- Mensagens internas vivem em tabela própria · dashboard apenas

Doc canônico do gate: [45-phase-2l-whatsapp-real-send-ban-gate.md](45-phase-2l-whatsapp-real-send-ban-gate.md).

---

## 4 · Arquitetura escolhida (Opção 3 · tabela nova dedicada)

**Por que NÃO Opção 1 (reuso `inbox_notifications`):**
- `inbox_notifications.conversation_id` é **NOT NULL**
- Nem todo appointment tem `wa_conversations` associada (paciente sem WhatsApp ainda · só telefone)
- Resolveria via lookup mas geraria buracos
- Resposta: criar tabela nova com `appointment_id` first-class

**Tabela nova:** `public.appointment_internal_alerts`
- `appointment_id uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE`
- `alert_kind` ∈ `{not_confirmed_d_minus_1, not_confirmed_d_zero, arrival, next_patient, attention_required}`
- `target_role` ∈ `{secretaria, professional, doctor, admin}`
- `target_user_id uuid` (opcional · alvo específico)
- `payload jsonb` (subject_name, scheduled_date, start_time, professional_name, etc · denormalizado pra render rápido)
- `is_read boolean` · `read_by uuid` · `read_at timestamptz`
- **`UNIQUE(appointment_id, alert_kind, target_role)`** · idempotência nativa
- 3 indexes: clinic_unread partial · appt FK · target_user partial

**RLS multi-tenant ADR-028:**
- SELECT/UPDATE → `authenticated` (mesma clinic via `app_clinic_id() JWT`)
- INSERT/DELETE → `service_role` apenas (RPCs SECURITY DEFINER)

---

## 5 · Alertas implementados

| Alert kind | Target | Quando | Origem |
|---|---|---|---|
| `not_confirmed_d_minus_1` | secretaria | appt amanhã (SP) com status `aguardando_confirmacao` ou `agendado` | `_appointment_not_confirmed_alert_tick()` |
| `not_confirmed_d_zero` | secretaria | appt hoje (SP) com status `aguardando_confirmacao` ou `agendado` | mesma tick fn |
| `arrival` × 2 (pro + sec) | professional + secretaria | appt entra em `na_clinica/aguardando/em_atendimento/em_consulta` | `appointment_arrival_internal_alert(p_id)` chamado por TS após `attend` |

**Preparados (não implementados nesta fase):**
- `next_patient` · documentado no enum CHECK · sem tick ainda · 2G.2
- `attention_required` · documentado no enum CHECK · sem tick ainda · 2G.3

---

## 6 · Banco / RPC (Mig 161 aplicada)

| Objeto | Tipo | Security | Returns | Grants |
|---|---|---|---|---|
| `public.appointment_internal_alerts` | TABLE | RLS enabled | n/a | SELECT/UPDATE auth · todos service_role |
| `appointment_internal_alert_create(uuid, text, text, uuid, jsonb)` | RPC | DEFINER | uuid (ou null em ON CONFLICT) | authenticated + service_role |
| `appointment_internal_alert_mark_read(uuid)` | RPC | DEFINER | jsonb `{ok, updated}` | authenticated + service_role |
| `_appointment_not_confirmed_alert_tick()` | RPC | DEFINER | integer (fired count) | **service_role only** (tick interno) |
| `appointment_arrival_internal_alert(uuid)` | RPC | DEFINER | jsonb `{ok, created_count, pro_alert_id, sec_alert_id}` | authenticated + service_role |

Sanity DO block dentro da mig valida tabela + 4 fns + UNIQUE + RLS.

---

## 7 · Backend / actions (Patch TS)

### `packages/repositories/src/appointment.repository.ts`
Novo método:
```ts
async createArrivalInternalAlert(appointmentId: string): Promise<{ ok: boolean; createdCount?: number; error?: string }>
```
- Chama RPC `appointment_arrival_internal_alert`
- Retorna `{ ok, createdCount, error }`
- Best-effort · falha não-bloqueante

### `apps/lara/src/app/crm/_actions/appointment.actions.ts` · `attendAppointmentAction`
Após `repos.appointments.attend()` succeed E `!idempotentSkip`:
- Chama `repos.appointments.createArrivalInternalAlert(appointmentId)`
- `try/catch` · falha de alerta loga `warn` mas NÃO bloqueia o fluxo de chegada (UX preservado)
- Adiciona log.info `appt.arrival_alert.dispatched` com `created_count`

**Justificativa do design:**
- Não usa trigger DB (mais arriscado · qualquer UPDATE em appointment.status dispararia)
- Faz no server action · 1 ponto único de entrada · controlável

### Tick fn `not_confirmed` · sem cron ainda
- Funcção existe no banco mas **NÃO** tem cron chamando ainda
- Pode ser chamada via service_role manualmente ou em fase 2G.2 (cron diário 09h BRT · paralelo aos crons 89/90)
- Smoke confirmou comportamento correto · idempotência OK

---

## 8 · Frontend / UI

**Esta fase NÃO entrega bell badge na topbar.** Razão: requer:
- Novo hook `useAppointmentInternalAlerts({ unread: true })`
- Componente `<AlertBell />` na shell
- Página `/alerts` ou modal
- Subscription Realtime opcional

Justificativa: escopo grande · pode quebrar UX existente se feito apressado. **Backend está pronto** · UI vai em **CRM_PHASE_2G.2** (próxima rodada dedicada).

**O que existe agora pra UI consumir:**
- Tabela `appointment_internal_alerts` com RLS multi-tenant
- RPC `appointment_internal_alert_mark_read` pronta
- Hook futuro pode fazer `SELECT * FROM appointment_internal_alerts WHERE is_read=false ORDER BY created_at DESC LIMIT N` direto via supabase-js (RLS filtra)

---

## 9 · Smoke transacional (PASS)

Executado em produção com `RAISE EXCEPTION → ROLLBACK` · zero efeito persistente.

### Not-confirmed
| Check | Esperado | Obtido |
|---|---|---|
| fired_1 (1ª chamada) | 2 (1 d_zero + 1 d_minus_1) | **2** ✅ |
| count_d_zero após 1ª | 1 | 1 ✅ |
| count_d_minus_1 após 1ª | 1 | 1 ✅ |
| fired_2 (2ª chamada · idempotência) | 0 | **0** ✅ |
| counts mantidos | 1 cada | 1 / 1 ✅ |
| payload completo (subject_name, status, scheduled_date, ...) | preenchido | ✅ |
| target_role | `secretaria` | ✅ |

### Arrival
| Check | Esperado | Obtido |
|---|---|---|
| 1ª chamada · created_count | 2 (pro + sec) | **2** ✅ |
| count_pro | 1 | 1 ✅ |
| count_sec | 1 | 1 ✅ |
| pro_alert.target_user_id | `professional_id` do appt | `06757b9f-...` ✅ |
| sec_alert.target_user_id | NULL | NULL ✅ |
| 2ª chamada · created_count | 0 (idempotência) | **0** ✅ |
| pro_alert_id retornado | null | null ✅ |
| sec_alert_id retornado | null | null ✅ |

### Side effects (zero)
| Métrica | Valor |
|---|---|
| wa_outbox_delta | 0 ✅ |
| wa_outbox_new_5min | 0 ✅ |
| agenda_alerts_log_new_5min | 0 ✅ |
| worker71_off_still | true ✅ |

### Post-rollback
- `appointments` resíduo smoke = 0
- `appointment_internal_alerts` total = 0 (rollback completo)
- `wa_outbox` total = 123 (= baseline)
- jobs 12/71/72/89/90 inalterados

---

## 10 · Validation SQL

Arquivo: [docs/crm-refactor/sql/phase-2g-internal-alerts-validation.sql](sql/phase-2g-internal-alerts-validation.sql)

Cobre 7 blocos: safety / schema / functions / candidates / health / UI counts / final flags.

`final_flags.can_continue_to_next_phase` retornará **true** se: `worker71_off ∧ table_exists ∧ unsafe_outbox_count=0`.

---

## 11 · Segurança

- ❌ Worker 71 OFF preservado · gate inegociável
- ❌ Zero envio WhatsApp/Evolution/Meta
- ❌ Zero chamada provider externo
- ❌ Zero cron novo criado
- ❌ Zero alteração env/secrets
- ❌ Zero deploy
- ✅ RLS habilitado em `appointment_internal_alerts` com `app_clinic_id()` JWT
- ✅ INSERT/DELETE só via RPC SECURITY DEFINER
- ✅ Idempotência via UNIQUE constraint
- ✅ Tenant derivado do appointment (não confia em param do caller)

---

## 12 · Limitações

1. UI bell badge não entregue · backend pronto · CRM_PHASE_2G.2
2. `next_patient` e `attention_required` declarados no CHECK mas sem tick fn (CRM_PHASE_2G.3)
3. Sem cron diário para `not_confirmed_alert_tick` · pode ser executado manualmente · ou cron em 2G.2
4. Sem Realtime/SSE subscription · UI quando vier pode escolher polling vs Realtime
5. Trigger DB de arrival não implementado · só chamada explícita via TS server action · decisão consciente (segurança > automação total)

---

## 13 · Rollback

### Pause do recurso (sem perder dados)
Nenhuma ação necessária · alerts internos não geram side-effect operacional fora do dashboard.

### Remoção completa (down migration)
```bash
# Aplicar mig down via Management API (NÃO executar sem autorização)
# db/migrations/20260800000161_*.down.sql
DROP FUNCTION ... × 4
DROP TABLE appointment_internal_alerts;
NOTIFY pgrst, 'reload schema';
```

### TS revert
Remover método `createArrivalInternalAlert` em `appointment.repository.ts` + bloco try/catch em `attendAppointmentAction`. Patch reversível.

---

## 14 · Próxima fase

**CRM_PHASE_2G.2 · Internal Alerts UI + Cron** (recomendada)
- Hook `useAppointmentInternalAlerts`
- Componente `<AlertBell />` na topbar
- Página `/alerts` ou drawer
- Cron diário para `not_confirmed_alert_tick`
- Marcar como lido via UI

**Alternativas paralelas:**
- CRM_PHASE_2H · Frontend state alignment (hardcodes + view consumer)
- CRM_PHASE_2K · Tick fn `d_after` (pós-consulta)

**Não recomendado:**
- Ligar worker 71 (gate 2L)
- Avançar 2L.X sem resolver banimento Mih
