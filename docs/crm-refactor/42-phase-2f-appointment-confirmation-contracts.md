# CRM_PHASE_2F · Appointment Confirmation Contracts

> **Data:** 2026-05-12
> **Modo:** PREP local · sem apply em produção · zero envio WhatsApp
> **Repo HEAD inicial:** `7d6c33a877346b7edaf1165f08accb6f592dc2d4` · `origin/main`
> **Companheiros:**
> - [sql/phase-2f-appointment-confirmation-contracts-validation.sql](sql/phase-2f-appointment-confirmation-contracts-validation.sql) (read-only)
> - [sql/phase-2f-smoke-transactional.sql](sql/phase-2f-smoke-transactional.sql) (BEGIN...ROLLBACK)
> - [db/migrations/20260800000160_clinicai_v2_appointment_confirmation_ticks.sql](../../db/migrations/20260800000160_clinicai_v2_appointment_confirmation_ticks.sql)
> - [db/migrations/20260800000160_clinicai_v2_appointment_confirmation_ticks.down.sql](../../db/migrations/20260800000160_clinicai_v2_appointment_confirmation_ticks.down.sql)

---

## 1 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `7d6c33a877346b7edaf1165f08accb6f592dc2d4` |
| Cron job 12 | active=true (`daily-agenda-summary`) |
| Cron job 71 | **active=false** (`wa_outbox_worker_tick`) |
| Cron job 72 | active=true dry-mode (`agenda_alert_min_before_tick`) |
| `cron.job.max(jobid)` | 88 (job 73 e seguintes livres) |
| Última mig aplicada | 20260800000159 (view+RPCs Mih) |
| Próxima mig | **20260800000160** (esta fase) |
| `wa_outbox` últimos 5 min | 0 inserts |
| `agenda_alerts_log` total | 0 (limpo) |
| Appointments futuros (hoje + amanhã em SP) | 0 / 0 |

---

## 2 · Guardrails respeitados

- ❌ Zero `supabase db push` / `migration repair` / deploy / `git push`
- ❌ Zero `cron.alter_job` · jobs 12/71/72 intactos
- ❌ Zero `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`CREATE`/`DROP`/`TRUNCATE` em produção fora do smoke txn ROLLBACK
- ❌ Zero ativação job 71 · zero envio WhatsApp real
- ❌ Zero alteração de secrets/env

Tudo que esta fase entrega: arquivos locais (4) + 1 smoke txn que termina em ROLLBACK + commit local opcional sem push.

---

## 3 · O que a 2E encontrou

Auditoria 2E identificou que `wa_agenda_automations` tem **8 trigger_types ativos sem tick fn**. Esta fase 2F resolve **somente** dois:

- `d_before` (Confirmação D-1, Tarefa Confirmar Presença)
- `d_zero` (Chegou o Dia)

Outros gaps (`d_after`, `on_finalize`, `on_inbound_match`, `on_recurrence_created`) ficam para fases futuras (2K, 2J, etc).

---

## 4 · Regras `d_before` existentes (audit DB read-only)

| ID | Nome | Active | Recipient | Channel | trigger_config | Templates |
|---|---|---|---|---|---|---|
| `a9636e9e-...` | **Confirmacao D-1** | ✅ | patient | whatsapp | `{days:1, hour:10, minute:0, min_lead_days:2}` | content_template OK (`Ola, *{{nome}}*! ...`) |
| `1b122a65-...` | Tarefa Confirmar Presenca | ✅ | professional | **task** | `{days:1, hour:9, minute:0}` | sem content / sem alert_title |

**Decisão:** processar SOMENTE `channel ILIKE '%alert%' OR channel ILIKE '%whatsapp%'`. Channel `task` fica **fora do escopo desta fase** (não existe tabela de fila de tasks integrada ao tick · trata-se de UI/dashboard interno futuro). Documentado como gap P3.

---

## 5 · Regras `d_zero` existentes (audit DB read-only)

| ID | Nome | Active | Recipient | Channel | trigger_config | Templates |
|---|---|---|---|---|---|---|
| `4d8f841e-...` | **Chegou o Dia** | ✅ | patient | whatsapp | `{hour:8, minute:0}` | content_template OK (`Bom dia, *{{nome}}*! ☀️ Hoje e o seu dia! Sua consulta e as *{{hora}}*. ...`) |

Apenas 1 regra · trata-se de "morning of" reminder.

---

## 6 · Decisão de elegibilidade por `appointments.status`

Status **elegíveis** para confirmação D-1 e Dia-da-consulta:

| Status | Elegível? | Justificativa |
|---|---|---|
| `agendado` | ✅ | aguardando confirmação ainda · receberá D-1 |
| `aguardando_confirmacao` | ✅ | precisa confirmar · D-1 reforça |
| `confirmado` | ✅ | já confirmou · D-zero ainda faz sentido como "te esperamos hoje" |

Status **NÃO elegíveis**:

| Status | Por quê |
|---|---|
| `cancelado` | Já cancelado · enviar gera atrito |
| `no_show` | Histórico de falta · não confirmar |
| `remarcado` | Foi remarcado · novo appointment receberá |
| `finalizado` | Já passou · sem sentido |
| `bloqueado` | Slot interno · não há paciente |
| `em_atendimento` | Já está acontecendo · sem sentido |
| `na_clinica` | Já chegou · idem |
| `aguardando` | Status intermediário ambíguo (esperando começo do atendimento na clínica) · fora do contexto de confirmação prévia |

Filtro SQL:
```sql
WHERE status IN ('agendado','aguardando_confirmacao','confirmado')
  AND deleted_at IS NULL
  AND lead_id IS NOT NULL
  AND (subject_phone IS NOT NULL AND length(trim(subject_phone)) > 0)  -- patient channel
```

Para `recipient_type='professional'`, telefone vem de `_appt_professional_phone(r_appt)` (já existe · mig 154+).

---

## 7 · Contrato de idempotência

Idempotência herdada da `_enqueue_agenda_alert` (mig 156+) via `agenda_alerts_log` com `UNIQUE(appt_id, alert_kind)` + `ON CONFLICT DO NOTHING`.

**`alert_kind` único por (regra/janela):**

| Regra | `alert_kind` |
|---|---|
| Confirmacao D-1 (e qualquer `d_before` com days=1) | `day_minus_1` |
| `d_before` com days=2 | `day_minus_2` |
| `d_before` com days=N | `day_minus_N` |
| Chegou o Dia (`d_zero`) | `day_zero` |

Não colide com `min_before` (`min5`, `min10`, etc) usados pelo tick existente.

**Property garantida:**
- Mesmo appointment + mesmo `alert_kind` → 1 só insert em `agenda_alerts_log` + 1 só insert em `wa_outbox`.
- Segunda chamada do tick: retorna `v_fired=0` para o mesmo appointment.
- Reset manual exigiria `DELETE FROM agenda_alerts_log WHERE ...` (audit trail preservado).

---

## 8 · Contrato de renderização

Reusa `_render_appt_template(p_template text, p_appt record)` (mig 154+). Placeholders:

| Placeholder | Fonte |
|---|---|
| `{{nome}}` | `appointments.subject_name` · fallback `'paciente'` |
| `{{data}}` | `to_char(scheduled_date, 'DD/MM/YYYY')` |
| `{{hora}}` | `left(start_time::text, 5)` |
| `{{profissional}}` | `professional_profiles.display_name` · fallback `'nossa equipe'` |
| `{{clinica}}` | `clinics.name` · fallback `'nossa clinica'` |
| `{{procedimento}}` | `appointments.procedure_name` · fallback `'sua consulta'` (per impl) |

Fallback final (mig 158 NULLIF + coalesce):
1. `_render_appt_template(content_template, appt)` se não-vazio → usa
2. Senão: `_render_appt_template(alert_title, appt)` se não-vazio → usa
3. Senão: `'[Alerta] ' || alert_kind` (sentinel; aparece em prod só se rule sem content E sem title)

**Garantia:** `wa_outbox.content` NUNCA vazio depois de mig 158. Esta fase preserva.

---

## 9 · Contrato de segurança de `wa_outbox`

Reusa `_enqueue_agenda_alert` que **já tem todos os guards** desejados:

```sql
-- mig 156 + 158:
IF p_clinic_id IS NULL THEN RETURN NULL; END IF;
IF p_phone IS NULL OR trim(p_phone) = '' THEN RETURN NULL; END IF;
IF p_appt.lead_id IS NULL THEN RETURN NULL; END IF;
v_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
IF v_phone = '' THEN RETURN NULL; END IF;
v_content := COALESCE(NULLIF(render(content_template), ''), NULLIF(render(alert_title), ''), '[Alerta] ' || kind);
-- então insere wa_outbox com status='queued' + appt_ref + rule_id
```

**Garantias asseguradas por estes guards:**
- Nunca `wa_outbox.content = ''` ou `NULL`
- Nunca `wa_outbox.phone = ''` ou `NULL`
- Nunca `wa_outbox.lead_id IS NULL`
- `status='queued'` sempre · worker 71 OFF segue não enviando

**Riscos eliminados:** envio acidental, conteúdo vazio, lead órfão, phone inválido.

---

## 10 · Contrato de logs

`agenda_alerts_log` gravado para cada `_enqueue_agenda_alert`:

| Coluna | Valor |
|---|---|
| `appt_id` | `r_appt.id::text` |
| `lead_id` | `r_appt.lead_id::text` |
| `alert_kind` | `day_minus_N` ou `day_zero` |
| `rule_id` | `v_rule.id` |
| `recipient` | telefone normalizado |
| `outbox_id` | FK pro `wa_outbox.id` recém-criado |
| `clinic_id` | `r_appt.clinic_id` |

UNIQUE(appt_id, alert_kind) garante idempotência. `outbox_id` permite tracing log↔outbox.

---

## 11 · Riscos

| Risco | Severidade | Mitigação |
|---|---|---|
| Cron habilitado prematuramente | 🔴 alta (se acontecer) | Fase 2F **NÃO ativa cron**. Apenas cria funções. Ativação exige autorização explícita futura. |
| Tick chamado manualmente e duplica | 🟢 baixa | UNIQUE(appt_id, alert_kind) + ON CONFLICT DO NOTHING |
| Worker 71 ligado por engano | 🔴 alta | Documentar regra inegociável + verificar status em smoke + sanity check antes de qualquer enable |
| Template vazio em rule futura sem fallback | 🟢 baixa | `'[Alerta] ' || kind` é sentinel detectável (alerta operacional) |
| Phone NULL em rule recipient_type='patient' | 🟢 baixa | Guard `_enqueue_agenda_alert` pula |
| `min_lead_days` não verificado | 🟡 média | Tick verifica `created_at <= now() - min_lead_days * interval '1 day'` |
| Tick fires fora da janela horária da rule | 🟢 baixa | Janela horária é responsabilidade do cron (quando programar). Tick é idempotente. |
| Channel='task' processado erroneamente | 🟢 baixa | Filtro `channel ILIKE '%alert%' OR '%whatsapp%'` exclui task |
| `recipient_type='admin'` cai em phone errado | 🟢 baixa | Filtro `recipient_type IN ('patient','professional')` exclui admin |

---

## 12 · Smoke plan

Smoke transacional via Management API:

```
BEGIN;
  -- Fixture appointment Tomorrow + Today em SP com lead_id + subject_phone preenchidos
  INSERT INTO appointments (clinic_id, lead_id, subject_name, subject_phone, professional_id, professional_name, scheduled_date, start_time, end_time, procedure_name, status, value, payment_status, consentimento_img);

  -- Call tick 1
  SELECT _agenda_alert_d_before_tick();
  SELECT _agenda_alert_d_zero_tick();

  -- Validate: 1 log + 1 outbox por tick · content/phone/lead_id OK

  -- Call tick 2 (idempotency)
  SELECT _agenda_alert_d_before_tick();
  SELECT _agenda_alert_d_zero_tick();

  -- Validate: ainda 1 log + 1 outbox (sem duplicação)

  -- RAISE EXCEPTION para forçar ROLLBACK e retornar JSON
ROLLBACK;  -- (implícito via RAISE)
```

ROLLBACK obrigatório. Counters pré/pós smoke garantem zero efeito persistente.

---

## 13 · Rollback plan

### Migration down
```sql
DROP FUNCTION IF EXISTS public._agenda_alert_d_before_tick();
DROP FUNCTION IF EXISTS public._agenda_alert_d_zero_tick();
NOTIFY pgrst, 'reload schema';
```
Seguro porque a mig só CRIA funções novas · não toca tabelas/triggers/dados existentes.

### Operacional
- Se tick gerar outbox indesejado: `UPDATE wa_outbox SET status='cancelled' WHERE rule_id IN (...) AND status='queued'`
- Worker 71 OFF impede envio em qualquer caso · gate definitivo

---

## 14 · Veredito

Status local: ARTEFATOS PRONTOS · smoke executado em produção com BEGIN/ROLLBACK · zero efeito persistente · 0 envio WhatsApp.

Veredito alvo: **`PASS_CRM_PHASE_2F_APPOINTMENT_CONFIRMATION_TICKS_READY_LOCAL_COMMIT`** (se typecheck + git diff --check passarem e for autorizado commit).

Próxima fase: **2F.2** (apply controlado da mig 160) somente quando autorizado. Após apply, decidir separadamente sobre criação de cron (jobs 73 + 74) — atualmente nenhum cron novo é criado nesta fase.
