# CRM_PHASE_2F.4 · Monitor da primeira janela operacional dos crons

> **Data observação:** 2026-05-12 08:53 BRT (11:53 UTC)
> **Modo:** READ-ONLY · zero mutação · zero envio
> **HEAD:** `dbad1b0e470a597898971f132a927ddb89d2327e` · `origin/main`

---

## 1 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `dbad1b0e470a597898971f132a927ddb89d2327e` |
| HEAD == origin/main | ✅ |
| Working tree | limpo |
| `now()` UTC | 2026-05-12 11:53:37 |
| `now()` BRT | 2026-05-12 08:53:37 |

---

## 2 · Jobs monitorados

| Job ID | Nome | Schedule UTC | Horário BRT | Comando | Active |
|---|---|---|---|---|---|
| 12 | daily-agenda-summary | `0 11 * * *` | 08:00 | `SELECT wa_daily_summary()` | ✅ true |
| 71 | wa_outbox_worker_tick | `*/1 * * * *` | a cada min | `SELECT public._wa_outbox_tick()` | ✅ **false** (gate) |
| 72 | agenda_alert_min_before_tick | `*/1 * * * *` | a cada min | `SELECT public._agenda_alert_min_before_tick()` | ✅ true |
| **89** | **agenda-alert-d-zero-tick** | `0 11 * * *` | 08:00 | `SELECT public._agenda_alert_d_zero_tick();` | ✅ true |
| **90** | **agenda-alert-d-before-tick** | `0 13 * * *` | 10:00 | `SELECT public._agenda_alert_d_before_tick();` | ✅ true |

---

## 3 · Janela analisada

| Cron | Próxima execução | Status |
|---|---|---|
| Job 90 (d_before) | **hoje 13:00 UTC / 10:00 BRT** (em ~67 min a partir desta observação) | **NOT_YET_RUN** |
| Job 89 (d_zero) | **amanhã 13/05 11:00 UTC / 08:00 BRT** | **NOT_YET_RUN** |

Os crons foram criados em ~08:40 BRT de hoje (após a janela 08:00 BRT do d_zero), portanto a primeira execução do d_zero acontece em **24h aproximadamente**. O d_before tem janela diária 10:00 BRT · primeira execução em ~67 min.

---

## 4 · Resultado job 90 d_before

`cron.job_run_details WHERE jobid=90 AND start_time >= now() - interval '24 hours'`:

**NULL · sem nenhum run nas últimas 24h.**

Status: `NOT_YET_RUN`. Próxima execução: 13:00 UTC hoje (~67 min).

---

## 5 · Resultado job 89 d_zero

`cron.job_run_details WHERE jobid=89 AND start_time >= now() - interval '24 hours'`:

**NULL · sem nenhum run nas últimas 24h.**

Status: `NOT_YET_RUN`. Próxima execução: 11:00 UTC amanhã (~23h).

---

## 6 · Resultado consolidado de `cron.job_run_details`

| Job | Runs últimas 24h | Status |
|---|---|---|
| 89 (d_zero) | 0 | NOT_YET_RUN |
| 90 (d_before) | 0 | NOT_YET_RUN |

Nenhum erro · nenhum sucesso · simplesmente não chegou na janela.

---

## 7 · Elegibilidade encontrada (read-only)

| Métrica | Valor |
|---|---|
| `today_sp` | 2026-05-12 |
| `tomorrow_sp` | 2026-05-13 |
| `eligible_d_before_count` | **0** (sem appts amanhã elegíveis) |
| `eligible_d_zero_count` | **0** (sem appts hoje elegíveis) |

**Interpretação:** quando os crons rodarem na primeira janela:
- Job 90 d_before terá `fired=0` (esperado)
- Job 89 d_zero terá `fired=0` (esperado)

Sem appointments futuros operacionais no banco enquanto Mih está banida e novos agendamentos não estão chegando.

---

## 8 · Delta `wa_outbox`

| Métrica | Valor |
|---|---|
| Total atual | 123 (= baseline pré-2F · sem delta) |
| Inserts últimas 2h | 0 |
| Inserts últimas 24h `rule_id='a9636e9e...'` (Confirmacao D-1) | 0 |
| Inserts últimas 24h `rule_id='4d8f841e...'` (Chegou o Dia) | 0 |

**Conclusão:** os crons criados não geraram nenhum outbox espontâneo · zero efeito acidental.

---

## 9 · Delta `agenda_alerts_log`

| Métrica | Valor |
|---|---|
| Total atual | 0 |
| Inserts últimas 2h | 0 |
| Rows com `alert_kind='day_minus_1'` | 0 |
| Rows com `alert_kind='day_zero'` | 0 |

---

## 10 · Safety checks

| Check | Valor | Esperado |
|---|---|---|
| `wa_outbox.empty_content` | 0 | 0 ✅ |
| `wa_outbox.empty_phone` | 0 | 0 ✅ |
| `wa_outbox.missing_lead_id` | 0 | 0 ✅ |
| `wa_outbox.pending_old_1h` | 0 | 0 ✅ |
| Webhooks externos chamados últ 2h | 0 (inferido · zero outbox · zero send) | 0 ✅ |
| Cron jobs alterados | 0 | 0 ✅ |

---

## 11 · Confirmação job 71 OFF

`SELECT active FROM cron.job WHERE jobid=71` → **`false`** ✅

Gate de envio preservado · qualquer outbox `queued` que aparecer no futuro fica em fila sem ser consumido. Worker 71 segue desligado conforme regra inegociável até autorização explícita futura.

---

## 12 · Confirmação zero envio real

| Verificação | Valor |
|---|---|
| Inserts wa_outbox últ 2h | 0 |
| Inserts wa_messages outbound últ 2h (não há outbox queued processado) | 0 |
| WhatsApp / Evolution provider invocado | 0 (worker 71 OFF) |
| Mih (5544991622986) status | ainda banido pelo WhatsApp · isolado de qualquer envio mesmo se worker ligasse |
| Lara (5544995887773) status | online · não tocado por d_before/d_zero (regras "Confirmacao D-1" e "Chegou o Dia" não especificam wa_number_id alvo · usariam canal default) |

---

## 13 · Riscos remanescentes

| Risco | Severidade | Mitigação atual |
|---|---|---|
| Worker 71 ligado por engano antes do plano | 🔴 alta | Documentado · regra inegociável · sanity SQL antes de qualquer enable |
| Primeira rodada falhar com exception não tratada | 🟡 média | Tick fns têm guards (lead_id, phone, content) · `cron.job_run_details.status='failed'` capturaria · monitoramento contínuo |
| Erro de timezone (cron UTC vs SP local) | 🟢 baixa | Brasil UTC-3 fixo desde 2019 (sem DST) · schedule corretamente alinhado |
| Pico inesperado de eligible quando appts voltarem | 🟢 baixa | Idempotência UNIQUE(appt_id, alert_kind) protege · worker OFF impede envio real |
| Rule "Confirmacao D-1" `min_lead_days=2` filtrar appts criados ≤ 2 dias antes | 🟢 baixa | Comportamento desejado · documentado · evita confirmar appt criado on-the-fly |

---

## 14 · Próxima fase recomendada

### Imediato (sem ação)
Aguardar próxima janela:
- **Hoje 10:00 BRT** (em ~67 min) · job 90 d_before primeira execução. Esperado: `succeeded · v_fired=0`.
- **Amanhã 08:00 BRT** · job 89 d_zero primeira execução. Esperado: `succeeded · v_fired=0`.

### CRM_PHASE_2F.4B · Monitor pós-primeira-janela (recomendada amanhã)
Re-rodar este monitor após primeira execução de cada cron · validar:
- `cron.job_run_details` status=succeeded
- `return_message` = "1 row" (formato cron) ou similar
- `v_fired` interpretado do return = 0 dado que `eligible_count=0`
- Zero delta em wa_outbox e agenda_alerts_log
- Job 71 segue OFF

### Em paralelo · sem dependência da primeira janela
- **CRM_PHASE_2G** · alertas internos Secretaria/Mirian ("paciente não confirmou" · "paciente chegou")
- **CRM_PHASE_2K** · tick fn para `d_after` (pós-consulta D+1/D+2/D+3 + NPS D+7)
- **CRM_PHASE_2H** · view consumer + state machine no frontend

### Não recomendado agora
- Ativar worker 71 sem resolver migração Mih → Cloud Meta API
- Forçar execução manual dos crons 89/90 (desnecessário · aguardar janela natural)

---

## 15 · Confirmações negativas finais

- ❌ Zero `cron.alter_job` / `cron.schedule` / `cron.unschedule`
- ❌ Zero ativação job 71 (segue `active=false`)
- ❌ Zero envio WhatsApp/Evolution
- ❌ Zero chamada provider externo
- ❌ Zero alteração env/secrets
- ❌ Zero deploy
- ❌ Zero migration aplicada
- ❌ Zero `db push`
- ❌ Zero `migration repair`
- ❌ Zero write em produção
- ❌ Zero execução manual das tick fns
- ❌ Zero `git commit` / `git push` (este doc fica untracked até autorização)

---

## 16 · Histórico

- 2026-05-12 ~08:40 BRT · Crons 89 + 90 criados (`PASS_CRM_PHASE_2F3_CRONS_D_BEFORE_D_ZERO_ACTIVE_WORKER_OFF`)
- 2026-05-12 ~08:53 BRT · Esta observação · `NOT_YET_RUN` para ambos
- Próxima fase 2F.4B esperada após primeira execução do cron 90 (~10:00 BRT hoje)
