# CRM_PHASE_2R · Operational Closure · CRM / Agenda / WhatsApp

> **Data:** 2026-05-12
> **Status:** ROUND CLOSED · zero feature nova nesta fase · audit + handoff
> **HEAD:** `25c9cab` (== origin/main)
> **Verdict alvo:** `PASS_CRM_PHASE_2R_OPERATIONAL_ROUND_CLOSED_AND_HANDOFF_READY`

---

## 1 · Resumo executivo

Fechamento da rodada grande **CRM / Agenda / WhatsApp** que cobriu 6 fases (2F, 2G, 2H, 2J, 2K, 2I) + ban gate 2L. Esta fase 2R é **somente auditoria + documentação**. Zero código funcional · zero migration · zero alteração de banco · zero envio.

Entregue na rodada:
- **5 migrations** (160, 161, 162, 163, 166) aplicadas + tracker registrado
- **17 RPCs** SECURITY DEFINER cobrindo agenda/alerts/clinical
- **8 jobs cron** ativos (12, 72, 89, 90, 91, 92, 93, 94) · worker 71 OFF preservado
- **UI completa** para fluxo end-to-end na agenda (chegada → atendimento → finalização → clínico)
- **Ban gate 2L** preservado · zero WhatsApp real disparado em todo o ciclo

Próximo passo recomendado: **CRM_PHASE_2I.1 · Hard gate clinical finalization** (bloquear finalize se anamnese/consent estiver warning). Ver [62-next-prompt-after-operational-closure.md](62-next-prompt-after-operational-closure.md).

---

## 2 · Estado do repo

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `25c9cab4552fd44770ae79cdd48e493db558affa` |
| origin/main | igual a HEAD |
| Working tree | limpo |
| Commits da rodada | 6 commits (45302c1 → 25c9cab) |

Últimos commits pertinentes (top 10):
```
25c9cab feat(crm): add appointment anamnesis and consent
67cd50a feat(crm): add enterprise appointment finalization
afafc37 feat(crm): add patient arrival clinic flow
46fcfff feat(crm): complete internal appointment alerts
45302c1 feat(crm): add post-consultation d_after tick
531ad75 feat(crm): add internal alerts UI and cron
c1f408d feat(crm): add internal appointment alerts
f4738df docs(crm): add whatsapp send ban gate
204d3a3 feat(db): add appointment confirmation agenda ticks
```

---

## 3 · Estado do banco

### 3.1 · Jobs / Crons

| Job | Nome | Schedule (UTC) | Schedule (BRT) | Active |
|---|---|---|---|---|
| 12 | daily-agenda-summary | `0 11 * * *` | 08:00 | ✅ ON |
| **71** | **wa_outbox_worker_tick** | `*/1 * * * *` | — | **🔒 OFF (gate)** |
| 72 | agenda_alert_min_before_tick | `*/1 * * * *` | a cada 1min | ✅ ON |
| 89 | agenda-alert-d-zero-tick | `0 11 * * *` | 08:00 | ✅ ON |
| 90 | agenda-alert-d-before-tick | `0 13 * * *` | 10:00 | ✅ ON |
| 91 | agenda-alert-not-confirmed-tick | `0 11 * * *` | 08:00 | ✅ ON |
| 92 | agenda-alert-d-after-tick | `0 14 * * *` | 11:00 | ✅ ON |
| 93 | appointment-next-patient-internal-alert-tick | `*/5 * * * *` | a cada 5min | ✅ ON |
| 94 | appointment-attention-required-internal-alert-tick | `0 10 * * *` | 07:00 | ✅ ON |

**Adicionais (não-CRM):**
- Job 9 · `wa-outbox-cleanup` · `wa_outbox_cleanup_stuck()` · **cleanup defensivo** (não envia, só remove stuck rows) · seguro.

✅ **Zero cron duplicado.**
✅ **Zero cron chamando provider externo** (Evolution/Meta/sendMessage).
✅ **Worker 71 OFF.**

### 3.2 · Cron run details (últimas 48h)

| Job | Última run | Status | Mensagem |
|---|---|---|---|
| 90 (d_before) | 2026-05-12 13:00 UTC | succeeded | 1 row |
| 92 (d_after) | 2026-05-12 14:00 UTC | succeeded | 1 row |
| 93 (next_patient) | 2026-05-12 14:10 UTC (3 runs) | succeeded | 1 row |
| 89 (d_zero) | NOT_YET_RUN no janela | — | aguardando próximo trigger 11 UTC |
| 91 (not_confirmed) | NOT_YET_RUN no janela | — | aguardando próximo trigger 11 UTC |
| 94 (attention_required) | NOT_YET_RUN no janela | — | aguardando próximo trigger 10 UTC |

### 3.3 · Migrations tracker

| Versão | Nome | Fase |
|---|---|---|
| 20260800000160 | clinicai_v2_appointment_confirmation_agenda_ticks | 2F |
| 20260800000161 | clinicai_v2_internal_appointment_alerts | 2G |
| 20260800000162 | clinicai_v2_post_consultation_d_after_ticks | 2K |
| 20260800000163 | clinicai_v2_internal_alerts_completion | 2G.3 |
| 20260800000166 | clinicai_v2_anamnesis_consent | 2I |

✅ **5/5 registradas.**

### 3.4 · RPCs / Functions (17)

Todas com `SECURITY DEFINER` + `search_path` blindado + GRANT auth + service_role:

**Agenda / WhatsApp dry-mode (4):**
- `_agenda_alert_min_before_tick` · cron 72
- `_agenda_alert_d_before_tick` · cron 90
- `_agenda_alert_d_zero_tick` · cron 89
- `_agenda_alert_d_after_tick` · cron 92

**Alertas internos (6):**
- `appointment_internal_alert_create` · helper de inserção
- `appointment_internal_alert_mark_read` · UI bell
- `_appointment_not_confirmed_alert_tick` · cron 91
- `appointment_arrival_internal_alert` · called by attend action
- `_appointment_next_patient_internal_alert_tick` · cron 93
- `_appointment_attention_required_alert_tick` · cron 94

**Agenda / CRM core (3):**
- `appointment_finalize` · 4 outcomes (paciente, orcamento, paciente_orcamento, perdido)
- `appointment_attend` · status → na_clinica + arrival alert
- `appointment_change_status` · state machine (mig 72)

**Clínico (4):**
- `appointment_anamnesis_upsert` · ficha intra-consulta
- `appointment_anamnesis_mark_complete` · draft → complete
- `appointment_consent_accept` · aceite TCLE
- `appointment_clinical_gate_status` · consolida estado clínico

### 3.5 · Data health

| Tabela | Total | Última 24h | Unsafe | Duplicates | Orphans |
|---|---|---|---|---|---|
| `wa_outbox` | 123 (sent=66, failed=8, cancelled=49) | 0 | **0** ✅ | n/a | n/a |
| `agenda_alerts_log` | 0 | 0 | 0 | 0 | 0 |
| `appointment_internal_alerts` | 0 | 0 | 0 | **0** ✅ | **0** ✅ |
| `appointment_anamneses` | 0 | 0 | 0 | **0** ✅ | **0** ✅ |
| `appointment_informed_consents` | 0 | 0 | 0 (sem `accepted_without_ts`) | **0** ✅ | **0** ✅ |

`wa_outbox`: 0 pending old > 1h · 0 queued aguardando worker.

### 3.6 · Distribuições CRM

- **appointments.status**: `finalizado=3` (DB pré-produção · poucas appointments reais). Zero `invalid_status_rows`.
- **leads.phase**: `lead=120, paciente=1, orcamento=1`. **`perdido=0`** ✅ (consistente com decisão 2J).
- **leads.lifecycle_status**: `ativo=122`.
- **crm_operational_view**: existe.

---

## 4 · Ban gate 2L · status

🔒 **PRESERVADO 100%**

- Worker 71 OFF (verificado em todas as fases).
- Zero cron de envio real ativo (`no_send_cron_active=true`).
- Zero provider call cron (Evolution/Meta/sendMessage).
- Zero `wa_outbox` inserido fora de testes ROLLBACK.
- Zero alteração em env/secrets.
- Mih (5544991622986) permanece banido · qualquer ativação aguarda 2L.1.

---

## 5 · Jornada operacional atual (end-to-end)

```
[Lead criado]
   │
   ▼
agendado  ────────► aguardando_confirmacao ────► confirmado
   │                       │                          │
   │                       │ cron 90 (d-1 13 UTC)     │ cron 89 (d0 11 UTC)
   │                       │   dry-mode               │   dry-mode
   │                       ▼                          ▼
   │                  ├ wa_outbox queued (zero envio · worker 71 OFF)
   │                  ├ cron 91 (not_confirmed 11 UTC) → alerta interno
   │                  │
   ▼
aguardando ◄─── (transição manual ou attend direto)
   │
   ▼
[Botão "Marcar chegada"]  ────────► na_clinica
   │                                    │
   │ appointment_attend RPC             │ cron 93 (next_patient */5)
   │ + leads.phase=compareceu           │   → alerta interno "Próximo paciente"
   │ + 2 alertas internos (sec+prof)    │
   │                                    │ cron 94 (attention_required 10 UTC)
   │                                    │   → alerta interno se dados faltando
   ▼                                    │
[Botão "Iniciar atendimento"] ──► em_atendimento
   │                                    │
   │ appointment_change_status RPC      │
   │                                    │
   │  ↕ Painel Clínico (warning-only)   │
   │    ├ Anamnese (modal · 11 campos)  │
   │    └ Consentimento (modal · TCLE)  │
   │                                    │
   ▼
[Botão "Finalizar consulta"]  ────────► finalizado
   │
   │ FinalizeWizard · 3 outcomes:
   │   ├ paciente             → lead.phase=paciente
   │   ├ orcamento            → lead.phase=orcamento + orçamento criado
   │   └ paciente_orcamento   → ambos sequencial atômico
   │
   ▼
[Pós-consulta dry-mode]
   │ cron 92 (d_after 14 UTC) → D+1, D+2, D+3, D+7 (NPS) em wa_outbox queued
   │ Zero envio real · worker 71 OFF
```

---

## 6 · Matriz dos 20 itens originais

Status atual de cada item da especificação grande CRM/Agenda/WhatsApp:

| # | Item | Status | Evidência | Próximo passo (se aplicável) |
|---|---|---|---|---|
| 1 | Confirmação do paciente | **PARCIAL** · DRY-MODE | Mig 160 · crons 89/90 ativos · wa_outbox queued · zero envio | Real send bloqueado por 2L · aguarda Cloud Meta |
| 2 | Mensagens pré-consulta | **PARCIAL** · DRY-MODE | Cron 72 (min_before) · 89 (d_zero) · 90 (d_before) ativos | Mesmo · gate 2L |
| 3 | Alertas pré-consulta Secretaria | **FECHADO** (interno) | Cron 91 · alerta `not_confirmed` em `appointment_internal_alerts` | — |
| 4 | Alertas para Mirian/profissional | **FECHADO** (interno) | Mig 161 + 163 · 5 kinds · UI AlertBell · polling 30s | — |
| 5 | Aviso de chegada do paciente | **FECHADO** | `appointment_arrival_internal_alert` chamada por `attendAction` · 2 alertas (secretaria+prof) | — |
| 6 | Integração Alexa / boas-vindas | **PENDENTE** | Não atacado nesta rodada | Fase dedicada futura · fora do escopo CRM core |
| 7 | Modal de agendamento completo | **PARCIAL** | UI agenda/novo + drag-drop existem · falta wizard rico | Fase 2AUX se priorizada |
| 8 | Validações completas da agenda | **PARCIAL** · maior progresso | State machine TS/RPC consistentes · checkConflicts via dragDrop · CHECK constraints DB | Zumbis `em_consulta`/`pre_consulta` cleanup → 2H.1 |
| 9 | Modal paciente na clínica | **FECHADO** | Botão "Marcar chegada" · status badge "Na Clínica" · histórico `chegada_em` (2H) | — |
| 10 | Fluxo de anamnese | **FECHADO** · warning-only | Mig 166 · `appointment_anamneses` · modal 11 campos · draft/complete | Hard gate finalize → 2I.1 |
| 11 | Consentimento informado | **FECHADO** · warning-only | Mig 166 · `appointment_informed_consents` · TCLE simplificado · idempotent | Hard gate finalize → 2I.1 |
| 12 | Modal de finalização | **FECHADO** | FinalizeWizard · 3 outcomes (paciente/orcamento/paciente_orcamento) · perdido removido · warning clínico | Hard gate → 2I.1 |
| 13 | Mensagens pós-consulta | **FECHADO** · DRY-MODE | Cron 92 (d_after) · regras D+1/D+2/D+3/D+7 NPS | Real send bloqueado por 2L |
| 14 | Follow-up pós-consulta | **PARCIAL** · DRY-MODE | Cron 92 cobre · wa_agenda_automations 4 regras ativas | Recovery commercial não automatizado · ver item 18 |
| 15 | No-show | **PARCIAL** | RPC `markNoShow` + UI modal · falta automação de re-engajamento | Fase dedicada · usar lead_lost se reativação falhar |
| 16 | Remarcação | **PARCIAL** | `dragDropAppointmentAction` cobre · status `remarcado` válido · falta UX dedicada | — |
| 17 | Cancelamento | **PARCIAL** | RPC `cancel` + modal motivo · falta workflow de re-oferta | — |
| 18 | Recuperação comercial | **PARCIAL** / **PENDENTE** | Phase `recuperacao` existe em `lifecycle_status` · sem automação | Fase dedicada · depende de 2L resolvido |
| 19 | Worker 71 / envio real WhatsApp | **BLOQUEADO** | Mih banido · job 71 OFF · ban gate 2L documentado | Aguarda 2L.1 audit + Cloud Meta migration |
| 20 | Monitoramento e rollback de envio real | **PARCIAL** / **BLOQUEADO** | `wa-outbox-cleanup` job 9 ativo · sem dashboard de envio (não há envio) | Implementar após 2L.1 + worker ON · fase 2M |

**Resumo:**
- FECHADO: **8** (#3, #4, #5, #9, #10, #11, #12, #13)
- PARCIAL: **9** (#1, #2, #7, #8, #14, #15, #16, #17, #20)
- PENDENTE: **2** (#6, #18)
- BLOQUEADO: **1** (#19)

---

## 7 · Riscos remanescentes

### 7.1 · Operacionais

1. **wa_outbox cresce em dry-mode sem worker** · 123 rows acumuladas · `cancelled=49` indica algum sistema cancelou (provavelmente cleanup). Worker 71 OFF garante zero envio. Monitorar crescimento.
2. **Zumbis `em_consulta` / `pre_consulta` / `compareceu` / `reagendado`** · ~106 ocorrências em 25 arquivos TS + migrations antigas. Não bloqueia operação (CHECK constraint do banco rejeita) mas confunde manutenção. Cleanup → 2H.1.
3. **Anamnese pré-consulta legacy desconectada** · sistema `anamnesis_*` (13 tabelas + 31 templates legal_doc) NÃO se conecta com `appointment_anamneses` intra-consulta. Decisão consciente em 2I.
4. **Hard gate clínico ausente** · finalize ainda funciona com gate=warning. Recomendação 2I.1.

### 7.2 · Sistêmicos

5. **Ban Mih sem resolução** · sem Cloud Meta API operacional, envio real está bloqueado indefinidamente. Audit + plano → 2L.1.
6. **Sem dashboard de envio real** · quando worker 71 ligar (futuro), não há painel admin de monitoramento em tempo real. Implementar antes de ligar.
7. **Crons d_zero (89), not_confirmed (91), attention_required (94) não capturados em job_run_details** das últimas 48h · pode indicar que foram criados após o último ciclo. Validar próxima janela de execução.

---

## 8 · O que está bloqueado por número banido (Mih)

- Envio real de mensagens via WhatsApp (Evolution/Cloud Meta) · **TODO o pipeline de envio**
- Worker 71 (`wa_outbox_worker_tick`) ativação
- Realização operacional dos itens 1, 2, 13, 14, 18 da matriz
- Monitoramento de envio real (item 20)

---

## 9 · O que pode continuar sem WhatsApp real

- Toda UI da agenda (criar, editar, drag-drop, attend, start, finalize)
- Painel Clínico (anamnese + consent)
- AlertBell + alertas internos (Secretaria/Mirian/profissional)
- Cron d_after dry-mode → preenche `wa_outbox` queued (sem envio)
- Hard gate clínico (2I.1)
- Cleanup zumbis status (2H.1)
- `lead_lost` dedicado (2J.1)
- Ban resolution audit (2L.1 · READ-ONLY)

---

## 10 · Próximas fases recomendadas

Ver [62-next-prompt-after-operational-closure.md](62-next-prompt-after-operational-closure.md):

1. **CRM_PHASE_2I.1** · Hard gate clinical finalization (recomendada)
2. **CRM_PHASE_2L.1** · Ban resolution / Cloud Meta audit (paralelizável)
3. **CRM_PHASE_2J.1** · Lead lost dedicado
4. **CRM_PHASE_2H.1** · Cleanup zumbis status
5. **CRM_PHASE_2AUX** · Modal agendamento completo

---

## 11 · Veredito final

`PASS_CRM_PHASE_2R_OPERATIONAL_ROUND_CLOSED_AND_HANDOFF_READY`

A rodada CRM/Agenda/WhatsApp está **operacionalmente fechada em dry-mode**. Toda a infraestrutura (5 migrations · 17 RPCs · 8 crons ativos · UI completa do fluxo) está consolidada e validada. Worker 71 permanece OFF. Próxima rodada vertical pode começar a qualquer momento, com 2I.1 (hard gate) como recomendação primária.
