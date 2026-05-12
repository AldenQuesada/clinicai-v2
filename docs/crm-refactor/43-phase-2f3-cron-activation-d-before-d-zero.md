# CRM_PHASE_2F.3 · Cron activation · `d_before` + `d_zero`

> **Data:** 2026-05-12
> **Modo:** ATIVAÇÃO operacional · 2 crons criados · zero envio real (worker 71 OFF)
> **HEAD:** `bc063168dc05b86c51cff64c239a05b1ece03365` · `origin/main`
> **Status:** APLICADO em produção
> **Companheiros:**
> - [42-phase-2f-appointment-confirmation-contracts.md](42-phase-2f-appointment-confirmation-contracts.md) (contratos)
> - [sql/phase-2f-appointment-confirmation-contracts-validation.sql](sql/phase-2f-appointment-confirmation-contracts-validation.sql) (validation read-only)
> - Mig 160 aplicada (tick fns)

---

## 1 · Estado inicial (pre-checks)

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `bc063168dc05b86c51cff64c239a05b1ece03365` |
| HEAD == origin/main | ✅ |
| Working tree | limpo |
| Cron 12 (`daily-agenda-summary`) | active=true · `0 11 * * *` |
| Cron 71 (`wa_outbox_worker_tick`) | **active=false** ✅ (gate crítico) |
| Cron 72 (`agenda_alert_min_before_tick`) | active=true · `*/1 * * * *` |
| `cron.job.max(jobid)` antes | 88 |
| Crons d_before/d_zero pré-existentes | **0** (sem duplicação) |
| `_agenda_alert_d_before_tick()` existe | ✅ |
| `_agenda_alert_d_zero_tick()` existe | ✅ |
| Tracker mig 160 | `'20260800000160'` ✅ |
| `wa_outbox`: empty_content / empty_phone / missing_lead_id / pending_old_1h | 0 / 0 / 0 / 0 |
| `agenda_alerts_log` total | 0 |
| `eligible_d_before_count` no banco | **0** (nenhum appt futuro elegível) |
| `eligible_d_zero_count` no banco | **0** (nenhum appt hoje elegível) |

---

## 2 · Gates pré-ativação (todos passaram)

| Gate | Esperado | Obtido | Status |
|---|---|---|---|
| Worker 71 OFF | true | true | ✅ |
| Nenhum cron pré-existente para d_before/d_zero | true | true | ✅ |
| Tick fns existem | true | true | ✅ |
| Tracker mig 160 registrado | true | true | ✅ |
| Outbox sem `unsafe` (empty/missing) | 0 | 0 | ✅ |
| `eligible_d_before_count` permite ativação | (qualquer · vai enfileirar a partir do próximo run) | 0 | ✅ |
| `eligible_d_zero_count` permite ativação | (idem) | 0 | ✅ |

---

## 3 · Crons criados

| Job ID | Nome | Schedule UTC | Horário BRT | Comando | Active |
|---|---|---|---|---|---|
| **89** | `agenda-alert-d-zero-tick` | `0 11 * * *` | **08:00** | `SELECT public._agenda_alert_d_zero_tick();` | ✅ true |
| **90** | `agenda-alert-d-before-tick` | `0 13 * * *` | **10:00** | `SELECT public._agenda_alert_d_before_tick();` | ✅ true |

Comando SQL executado (via Management API endpoint):

```sql
SELECT cron.schedule(
  'agenda-alert-d-zero-tick',
  '0 11 * * *',
  $cmd$SELECT public._agenda_alert_d_zero_tick();$cmd$
) AS jobid_d_zero,
cron.schedule(
  'agenda-alert-d-before-tick',
  '0 13 * * *',
  $cmd$SELECT public._agenda_alert_d_before_tick();$cmd$
) AS jobid_d_before;
```

HTTP 201 · returned `[{"jobid_d_zero":89,"jobid_d_before":90}]`.

---

## 4 · Horários BRT/UTC

| Cron | Horário UTC (DB) | Horário BRT (operacional) | Justificativa |
|---|---|---|---|
| d_zero (job 89) | `0 11 * * *` | **08:00** | "Bom dia, hoje é o seu dia" · cedo o suficiente pra paciente ler antes de sair |
| d_before (job 90) | `0 13 * * *` | **10:00** | "Sua consulta é amanhã" · meio da manhã do dia anterior · alinhado com `Confirmacao D-1` rule trigger_config |
| ↳ rule `trigger_config.hour` | — | 10 | ✅ match |

**Próximas execuções** (a partir do momento do apply · `2026-05-12 08:40 BRT`):
- d_before (job 90) · **hoje 13:00 UTC / 10:00 BRT** (~80 minutos no futuro)
- d_zero (job 89) · **amanhã 11:00 UTC / 08:00 BRT** (já passou hoje · próxima rodada é 13/05)

---

## 5 · Comandos exatos persistidos em `cron.job`

| Job | Command persistido |
|---|---|
| 89 | `SELECT public._agenda_alert_d_zero_tick();` |
| 90 | `SELECT public._agenda_alert_d_before_tick();` |

Comparado com tick fns que existem em produção (`pg_proc` confirmado): **match exato**.

---

## 6 · Confirmação worker 71 OFF (gate definitivo de envio)

| Verificação | Valor |
|---|---|
| `SELECT active FROM cron.job WHERE jobid=71` | **false** ✅ |
| Comando job 71 | `SELECT public._wa_outbox_tick()` (não executado enquanto active=false) |
| Implicação operacional | Mesmo que jobs 89/90 enfileirem `wa_outbox` com `status='queued'`, **nada é enviado** pra WhatsApp/Evolution. Worker 71 é o único caminho que consome a fila e bate na Meta/Evolution. |

---

## 7 · Confirmação zero envio real

| Verificação | Valor |
|---|---|
| `wa_outbox` rows criadas pela `cron.schedule()` | **0** (criar cron não dispara função) |
| `agenda_alerts_log` rows criadas | **0** |
| Webhooks externos chamados | **0** (nenhum) |
| Provider WhatsApp invocado | **0** (worker 71 OFF) |
| Provider Evolution invocado | **0** (Mih banido + worker OFF) |
| Mensagens reais entregues | **0** |

---

## 8 · Pós-checks (detalhados)

### Estado dos jobs (5 relevantes)
| ID | Nome | Schedule | Comando | Active |
|---|---|---|---|---|
| 12 | daily-agenda-summary | `0 11 * * *` | `SELECT wa_daily_summary()` | true (inalterado) ✅ |
| 71 | wa_outbox_worker_tick | `*/1 * * * *` | `SELECT public._wa_outbox_tick()` | **false (inalterado)** ✅ |
| 72 | agenda_alert_min_before_tick | `*/1 * * * *` | `SELECT public._agenda_alert_min_before_tick()` | true (inalterado) ✅ |
| **89** | **agenda-alert-d-zero-tick** | `0 11 * * *` | `SELECT public._agenda_alert_d_zero_tick();` | **true (novo)** ✅ |
| **90** | **agenda-alert-d-before-tick** | `0 13 * * *` | `SELECT public._agenda_alert_d_before_tick();` | **true (novo)** ✅ |

### Duplicatas
- `agenda-alert-d-zero-tick` count = 1 ✅
- `agenda-alert-d-before-tick` count = 1 ✅
- Zero comando duplicado em `cron.job`

### Saúde wa_outbox pós-create
| Métrica | Valor | Esperado | Status |
|---|---|---|---|
| `wa_outbox` total | 123 | 123 (= pré · 0 delta) | ✅ |
| `wa_outbox` últ 5min | 0 | 0 | ✅ |
| `empty_content` | 0 | 0 | ✅ |
| `empty_phone` | 0 | 0 | ✅ |
| `missing_lead_id` | 0 | 0 | ✅ |
| `pending_old_1h` | 0 | 0 | ✅ |
| `agenda_alerts_log` total | 0 | 0 (= pré) | ✅ |
| `agenda_alerts_log` últ 5min | 0 | 0 | ✅ |

### Final flags
| Flag | Valor |
|---|---|
| `worker71_off` | true ✅ |
| `job12_on` | true ✅ |
| `job72_on` | true ✅ |
| `job89_d_zero_on` | true ✅ |
| `job90_d_before_on` | true ✅ |
| `d_zero_schedule_ok` (`0 11 * * *`) | true ✅ |
| `d_before_schedule_ok` (`0 13 * * *`) | true ✅ |
| `d_zero_cmd_ok` | true ✅ |
| `d_before_cmd_ok` | true ✅ |
| `eligible_d_before_count` | 0 (sem appts amanhã) |
| `eligible_d_zero_count` | 0 (sem appts hoje) |

---

## 9 · Rollback operacional (documentado · não executado)

### Pause dos novos crons (preferido · reversível imediato)
```sql
SELECT cron.alter_job(89, active := false);  -- desliga d_zero (job 89)
SELECT cron.alter_job(90, active := false);  -- desliga d_before (job 90)
```

Para reativar depois:
```sql
SELECT cron.alter_job(89, active := true);
SELECT cron.alter_job(90, active := true);
```

### Remoção definitiva dos crons (se necessário)
```sql
SELECT cron.unschedule(89);  -- remove agenda-alert-d-zero-tick
SELECT cron.unschedule(90);  -- remove agenda-alert-d-before-tick
```

Ou por nome:
```sql
SELECT cron.unschedule('agenda-alert-d-zero-tick');
SELECT cron.unschedule('agenda-alert-d-before-tick');
```

### Cancelamento de outbox queued (se primeira rodada produzir resultados não desejados)
```sql
-- READ FIRST (não executar sem revisão)
SELECT count(*), rule_id, status FROM public.wa_outbox
 WHERE rule_id IN ('a9636e9e-56ac-4286-a1cc-faa52cb72548',   -- Confirmacao D-1
                   '4d8f841e-e320-4310-b732-36515c50f19b')    -- Chegou o Dia
   AND status='queued'
 GROUP BY rule_id, status;

-- Cancel mass (apenas após review · NÃO automático)
UPDATE public.wa_outbox SET status='cancelled'
 WHERE rule_id IN ('a9636e9e-56ac-4286-a1cc-faa52cb72548',
                   '4d8f841e-e320-4310-b732-36515c50f19b')
   AND status='queued';
```

**Worker 71 OFF é o gate principal** · mesmo sem rollback dos crons, zero envio acontece.

---

## 10 · Riscos remanescentes

| Risco | Severidade | Mitigação |
|---|---|---|
| Worker 71 ligado por engano após cron criado | 🔴 alta | Documentar em onboarding · sanity SQL antes de ativar worker · alarme se `queued` antigo crescer |
| `cron.schedule` agendado em UTC sem ajuste DST | 🟡 média | Brasil não tem DST desde 2019 · UTC-3 fixo · sem problema atual |
| Primeira rodada falha por exception em fn | 🟢 baixa | Tick fns têm guards (lead_id, phone) · retorno integer · não lança exception · `cron.job_run_details.status` mostraria |
| Fila wa_outbox crescer indefinidamente | 🟡 média | Worker OFF + cron `wa-outbox-cleanup` (job 9 · `*/5 *`) limpa rows antigas |
| Rule `Tarefa Confirmar Presenca` (channel=task · d_before) não dispara | 🟢 baixa documentado | Tick atual ignora `channel='task'` por design · gap P3 |
| Conflito com migração Mih→Cloud API | 🟢 baixa | Outbox queued segue intacto · quando worker ligar (futuro), processará normal |

---

## 11 · Próxima fase recomendada

### CRM_PHASE_2F.4 · Monitoring primeira janela operacional (recomendada)
- Aguardar primeira rodada do cron 90 (d_before · ~10:00 BRT hoje, ainda em ~80 min)
- Validar `cron.job_run_details` status=`succeeded`
- Validar `v_fired=0` (esperado · sem appt amanhã)
- Aguardar primeira rodada do cron 89 (d_zero · amanhã 08:00 BRT)
- Smoke read-only de health pós primeira semana

### Alternativas paralelas
- **CRM_PHASE_2G** · alertas internos Secretaria/Mirian ("paciente não confirmou" · "paciente chegou") — gap P1 da auditoria 2E
- **CRM_PHASE_2K** · tick fn para `d_after` (pós-consulta D+1/D+2/D+3 + NPS D+7) — gap P0 restante
- **CRM_PHASE_2H** · view consumer + state machine no frontend — gap P1

### Não recomendado agora
- Ligar worker 71 · ainda há banimento Mih ativo · migração Cloud API pendente
- Avançar para 2L (preflight envio real) · depende de Mih recuperação

---

## 12 · Confirmações negativas

- ❌ Zero ativação job 71 (`active=false` preservado)
- ❌ Zero alteração jobs 12/71/72 (inalterados)
- ❌ Zero envio WhatsApp/Evolution
- ❌ Zero chamada a provider externo
- ❌ Zero alteração env/secrets
- ❌ Zero deploy
- ❌ Zero migration nova aplicada (apenas crons criados via `cron.schedule`)
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero alteração código TS/app
- ❌ Zero commit/push novo (este doc fica untracked enquanto Alden não autorizar commit)
- ❌ Zero cron duplicado
- ❌ Zero outbox/log gerado imediatamente pela criação do cron
- ❌ Zero secret persistido (token só inline)

---

## 13 · Histórico

- 2026-05-12 · Mig 160 aplicada (`CRM_PHASE_2F.2` · commit `204d3a3`)
- 2026-05-12 · Smoke 2F.2 PASS · ROLLBACK confirmado
- 2026-05-12 · Crons 89 + 90 criados (esta fase · 2F.3) · primeira rodada de d_before agendada pra ~10:00 BRT hoje (job 90)
- Pendente · primeira rodada do d_zero (job 89 · amanhã 08:00 BRT) · monitoramento na fase 2F.4
