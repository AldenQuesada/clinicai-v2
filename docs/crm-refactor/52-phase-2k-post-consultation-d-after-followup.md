# CRM_PHASE_2K · Post-Consultation Follow-up (`d_after`)

> **Data:** 2026-05-12
> **Status:** APPLIED · cron ATIVO · smoke PASS · dry-mode (worker 71 OFF)
> **HEAD inicial:** `531ad75` · HEAD final esperado: commit local 2K
> **Verdict alvo:** `PASS_CRM_PHASE_2K_D_AFTER_APPLIED_SMOKE_OK_CRON_ACTIVE_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Fecha o **gap P0 remanescente da auditoria 2E**: regras `d_after` em `wa_agenda_automations` (Apos Consulta D+1, Pos-procedimento D+2/D+3, NPS D+7) estavam **ativas mas órfãs** — sem tick fn que as processasse. Esta fase implementa a tick fn + cron + smoke + validation.

Entrega vertical:
- Mig 162 aplicada · `_agenda_alert_d_after_tick()` ativa
- Cron 92 (`agenda-alert-d-after-tick`) ATIVO · roda diário 11:00 BRT
- Smoke transacional PASS · fired=3 (D+1 + D+3 + D+7)
- Idempotência confirmada · content rendered · phone normalizado · zero envio real
- Worker 71 OFF preservado · ban gate 2L respeitado

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `531ad75031586988f5a734467125f23536cece7f` |
| Working tree | limpo |
| Mig 160/161 trackers | registrados |
| `_agenda_alert_d_after_tick` antes | ausente |
| Cron `d_after` antes | nenhum |
| `wa_outbox` total | 123 · 0 unsafe |
| `agenda_alerts_log` total | 0 |
| Worker 71 | OFF ✅ (gate inegociável) |

---

## 3 · Gate WhatsApp banido (preservado)

Esta fase **não toca em envio**. Crons 89/90/91/92 geram fila em `wa_outbox` com `status='queued'`, mas worker 71 segue OFF · nada sai pra Meta/Evolution. Quando ban resolver E migração Cloud Meta API completar, decisão separada de ligar worker.

Doc canônico: [45-phase-2l-whatsapp-real-send-ban-gate.md](45-phase-2l-whatsapp-real-send-ban-gate.md).

---

## 4 · Regras d_after encontradas (audit)

| ID | Nome | Active | Channel | Recipient | Days | Content |
|---|---|---|---|---|---|---|
| `6dfe8767-...` | **Apos Consulta D+1** | ✅ | whatsapp | patient | 1 | "Oi {{nome}}! 😊 Como foi sua consulta com {{profissional}}? ..." |
| `58a220fb-...` | Pos-procedimento D+1 | ❌ | whatsapp | patient | 1 | (inativa) |
| `d6202639-...` | **Pos-procedimento D+2** | ✅ | whatsapp | patient | 2 | "{{nome}}, ja faz 2 dias do seu procedimento! O resultado..." |
| `7d7659e3-...` | Pedir Avaliacao | ❌ | whatsapp | patient | 3 | (inativa) |
| `09d93b5b-...` | **Pos-procedimento D+3** | ✅ | whatsapp | patient | 3 | "Oi, *{{nome}}*! 💜 Ja sao 3 dias desde seu procedimento..." |
| `60dd00e6-...` | Tarefa Acompanhamento Pos | ✅ | **task** | professional | 3 | (sem content · channel=task fora desta fase) |
| `03a1e6fd-...` | **NPS D+7** | ✅ | whatsapp | patient | 7 | "Oi, *{{nome}}*! 💓 Aqui e da *{{clinica}}*. Faz 7 dias..." |

**Total processado por esta fase:** 4 rules (D+1 / D+2 / D+3 / NPS D+7 · whatsapp/patient/alert). `Tarefa Acompanhamento Pos` (channel=task) **excluída** desta fase · 2G.3 ou fase dedicada de tasks pode cobrir.

---

## 5 · Contrato de elegibilidade

| Campo | Valor |
|---|---|
| **Status elegível** | `finalizado` (consulta acabou) |
| Status excluídos | `cancelado`, `no_show`, `remarcado`, `bloqueado`, `agendado`, `aguardando_confirmacao`, `confirmado`, `aguardando`, `na_clinica`, `em_atendimento` |
| **Target date** | `today_SP - N days` (N = `trigger_config.days`) |
| **lead_id** | `NOT NULL` obrigatório (guard `_enqueue_agenda_alert` mig 156) |
| **Phone source** | `subject_phone` (patient) ou `_appt_professional_phone()` (professional) |
| **Channel filter** | `whatsapp OR alert` (skip `task`) |
| **Recipient filter** | `patient OR professional` |
| **alert_kind** | `day_plus_N` (e.g., `day_plus_1`, `day_plus_7`) · não colide com `day_minus_N`, `day_zero`, `min10` |

---

## 6 · Templates renderizados (validados via smoke)

Reaproveita `_render_appt_template` (mig 154) · placeholders `{{nome}}`, `{{data}}`, `{{hora}}`, `{{profissional}}`, `{{clinica}}`, `{{procedimento}}`.

Smoke confirmou renderização correta:
- D+1 content_len=177 · `"Oi Smoke 2K D+1 Post! 😊\n\nComo foi sua consulta com *ALDEN JULIO QUESADA SIFONTES* ..."`
- D+3 content_len=379 · `"Oi, *Smoke 2K D+3 Post*! 💜\n\nJa sao 3 dias desde seu procedimento..."`
- D+7 content_len=293 · `"Oi, *Smoke 2K D+7 Post NPS*! 💓\n\nAqui e da *Clinica Mirian de Paula*..."`

**Conteúdo NUNCA vazio** (NULLIF fallback mig 158).

---

## 7 · Funções criadas

| Função | Tipo | Security | Returns | Grants |
|---|---|---|---|---|
| `public._agenda_alert_d_after_tick()` | tick (mig 162) | DEFINER | integer (fired count) | service_role only |

Reusa 100%:
- `_enqueue_agenda_alert(uuid, record, text, record, text)` (mig 156+158)
- `_render_appt_template(text, record)` (mig 154)
- `_appt_professional_phone(record)`
- `agenda_alerts_log` UNIQUE(appt_id, alert_kind) para idempotência

Sanity DO block dentro da mig valida fn nova + helpers + ticks irmãs (d_before/d_zero) intactas.

---

## 8 · Cron criado

| Job ID | Nome | Schedule UTC | BRT | Comando | Active |
|---|---|---|---|---|---|
| **92** | `agenda-alert-d-after-tick` | `0 14 * * *` | **11:00** | `SELECT public._agenda_alert_d_after_tick();` | ✅ true |

Primeira execução natural: hoje 14:00 UTC (~em 1h após criação) ou amanhã se já passou.

**Worker 71 segue OFF.** Mesmo quando o cron 92 gerar `wa_outbox queued`, nada sai do sistema.

Comando executado:
```sql
SELECT cron.schedule(
  'agenda-alert-d-after-tick',
  '0 14 * * *',
  $cmd$SELECT public._agenda_alert_d_after_tick();$cmd$
);
```
→ retorno `[{"jobid_d_after":92}]` (HTTP 201)

---

## 9 · Smoke transacional (PASS)

Executado em produção · ROLLBACK forçado via `RAISE EXCEPTION` · **zero efeito persistente**.

### Fixtures (criadas dentro da txn)
- D+1 appt: `9d216f47-...` · scheduled_date=`2026-05-11` · status=`finalizado`
- D+3 appt: `459ecdc7-...` · scheduled_date=`2026-05-09` · status=`finalizado`
- D+7 appt: `5642d4f8-...` · scheduled_date=`2026-05-05` · status=`finalizado`

### Tick 1 (`fired=3`)
| Check | Valor |
|---|---|
| `fired_1` | **3** ✅ |
| `log_d1` 1 row · alert_kind=`day_plus_1` · rule=`6dfe8767` (Apos Consulta D+1) · outbox linked | ✅ |
| `log_d3` 1 row · alert_kind=`day_plus_3` · rule=`09d93b5b` (Pos-procedimento D+3) · outbox linked | ✅ |
| `log_d7` 1 row · alert_kind=`day_plus_7` · rule=`03a1e6fd` (NPS D+7) · outbox linked | ✅ |
| outbox phone | `5544999422944` em todas ✅ |
| outbox status | `queued` em todas ✅ |
| outbox content_not_empty | `true` em todas ✅ |
| outbox content_len | 177 / 379 / 293 ✅ |
| outbox rule_id | match em todas ✅ |

### Tick 2 (idempotência)
| Check | Valor |
|---|---|
| `fired_2` | **0** ✅ (UNIQUE constraint preveniu duplicação) |
| counts log + outbox | 1 cada · sem duplicação ✅ |

### Post-rollback
| Check | Valor |
|---|---|
| `appointments` resíduo smoke | 0 ✅ |
| `agenda_alerts_log` total | 0 (= baseline) ✅ |
| `wa_outbox` total | 123 (= baseline) ✅ |
| `worker71_off_still` | true ✅ |

---

## 10 · Validation SQL final flags

| Flag | Esperado | Valor |
|---|---|---|
| `worker71_off` | true | **true** ✅ |
| `d_after_fn_exists` | true | **true** ✅ |
| `d_after_rules_active_count` | 4 (whatsapp/patient ativas) | **4** ✅ |
| `d_after_cron_active` | true | **true** ✅ |
| `cron_92_active` | true | **true** ✅ |
| `cron_92_schedule` | `0 14 * * *` | **`0 14 * * *`** ✅ |
| `unsafe_outbox_count` | 0 | **0** ✅ |
| `tracker_mig_162` | `'20260800000162'` | **registrado** ✅ |
| Jobs ativos esperados (12/72/89/90/91/92) | 6 ON · 71 OFF | conforme ✅ |

---

## 11 · Segurança

- ❌ Worker 71 OFF preservado · gate inegociável
- ❌ Zero envio WhatsApp/Evolution/Meta
- ❌ Zero call provider externo
- ❌ Zero alteração env/secrets
- ❌ Zero deploy
- ❌ Zero alteração TS/app code
- ❌ Zero alteração em rules `wa_agenda_automations` (apenas leitura)
- ❌ Zero alteração em `_enqueue_agenda_alert` / `_render_appt_template` (reuso 100%)
- ❌ Zero touch em ticks irmãs (mig 160 d_before/d_zero · mig 156 min_before intactas)
- ✅ Sanity DO block valida helpers + ticks irmãs intactas antes do COMMIT
- ✅ alert_kind isolado (`day_plus_N` · não colide)
- ✅ Channel filter exclui `task` (sem fila de tasks)

---

## 12 · Rollback

### Pause cron 92 (preferido · reversível)
```sql
SELECT cron.alter_job(92, active := false);
```

### Remoção definitiva do cron
```sql
SELECT cron.unschedule(92);
-- ou: SELECT cron.unschedule('agenda-alert-d-after-tick');
```

### Down migration (DROP fn)
```sql
-- db/migrations/20260800000162_*.down.sql
DROP FUNCTION IF EXISTS public._agenda_alert_d_after_tick();
NOTIFY pgrst, 'reload schema';
```

### Cancelar fila acumulada (se necessário)
```sql
-- READ FIRST · NÃO EXECUTAR sem autorização
SELECT count(*) FROM public.wa_outbox
 WHERE rule_id IN (
   '6dfe8767-9e27-4a05-a7d6-b247556767d7',  -- Apos Consulta D+1
   'd6202639-9a83-4ab4-8b70-dff8fb0a9b2d',  -- Pos-procedimento D+2
   '09d93b5b-d99f-4e8a-8cf9-31feed52f991',  -- Pos-procedimento D+3
   '03a1e6fd-6d28-48a8-b044-ff4060714cf8'   -- NPS D+7
 )
 AND status = 'queued';

UPDATE public.wa_outbox SET status='cancelled'
 WHERE rule_id IN (...)
   AND status = 'queued';
```

**Worker 71 OFF é o gate principal.** Mesmo sem rollback do cron 92, zero envio acontece.

---

## 13 · Limitações

1. Rule `Tarefa Acompanhamento Pos` (channel=task) **não processada** · não há fila de tasks · 2G.3 ou fase dedicada
2. Rules `Pos-procedimento D+1` e `Pedir Avaliacao` **inativas** · não disparam por design (config no banco)
3. Sem realtime · cron daily 11:00 BRT é uma janela única por dia
4. Sem retry custom · cron falha → próxima execução amanhã
5. Worker 71 segue OFF · fila acumula mas zero envio

---

## 14 · Próxima fase recomendada

### CRM_PHASE_2G.3 · alertas adicionais (next_patient + attention_required + realtime)
Fecha 100% bloco alertas internos · UI bell já está pronta.

### CRM_PHASE_2H · frontend agenda/CRM state alignment
Remover hardcodes `canAttend`/`canFinalize` · consumir `crm_operational_view`.

### CRM_PHASE_2L.1 · ban resolution audit
Read-only · prep migração Cloud Meta API. Bom para rodar em paralelo enquanto recurso ao WhatsApp tramita.

### NÃO RECOMENDADO
- Ligar worker 71 · gate inegociável até resolver Mih
- Avançar 2L.X full sem readiness checklist completo

---

## 15 · Confirmações negativas

- ❌ Zero job 71 activation (segue OFF)
- ❌ Zero envio WhatsApp/Evolution/Meta
- ❌ Zero provider call
- ❌ Zero envio real
- ❌ Zero env/secrets
- ❌ Zero deploy
- ❌ Zero TS/app code change
- ❌ Zero alteração tick fns irmãs
- ❌ Zero alteração wa_agenda_automations dados
- ✅ Mig 162 aplicada com sanity DO block PASS
- ✅ Smoke ROLLBACK confirmou zero resíduo

---

## 16 · Histórico

- 2026-05-12 · Mig 162 aplicada (CRM_PHASE_2K)
- 2026-05-12 · Cron 92 ATIVO · primeira execução hoje 11:00 BRT ou amanhã
- 2026-05-12 · Smoke 2K PASS · fired=3 idempotência OK · este doc

Próxima fase pendente (CRM_PHASE_2G.3 recomendada).
