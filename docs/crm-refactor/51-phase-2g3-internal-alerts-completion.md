# CRM_PHASE_2G.3 · Internal Alerts Completion (`next_patient` + `attention_required`)

> **Data:** 2026-05-12
> **Status:** APPLIED · crons ATIVOS · smoke PASS · dry-mode (worker 71 OFF)
> **HEAD inicial:** `45302c1` · HEAD final esperado: commit local 2G.3
> **Verdict alvo:** `PASS_CRM_PHASE_2G3_NEXT_PATIENT_AND_ATTENTION_ALERTS_READY`

---

## 1 · Resumo executivo

Fecha **100% o bloco de alertas internos** Secretaria/Mirian. Mig 161 já criou a tabela `appointment_internal_alerts`, helpers e RPCs com 5 enum kinds suportados (`not_confirmed_d_minus_1`, `not_confirmed_d_zero`, `arrival`, `next_patient`, `attention_required`). Mig 162 cobriu 4 deles via crons. Faltavam ticks para os 2 últimos.

Entrega vertical:
- Mig 163 aplicada · 2 tick fns criadas (`_appointment_next_patient_internal_alert_tick` + `_appointment_attention_required_alert_tick`)
- Cron 93 (`appointment-next-patient-internal-alert-tick`) ATIVO · `*/5 * * * *` (janela now+25..now+35min)
- Cron 94 (`appointment-attention-required-internal-alert-tick`) ATIVO · `0 10 * * *` UTC (07:00 BRT · scan diário 7 dias)
- Smoke transacional PASS · next_patient fired=2 (secretaria+professional) · attention_required fired=1 (no_phone)
- Idempotência confirmada · payload completo · zero envio real
- Worker 71 OFF preservado · ban gate 2L respeitado · UI bell já cobre os 2 novos kinds (sem mudança em TS)

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `45302c1c3537d1694e07a683d344e7844c3f2d3e` |
| Working tree | limpo |
| Mig 160/161/162 trackers | registrados |
| `_appointment_next_patient_internal_alert_tick` antes | ausente |
| `_appointment_attention_required_alert_tick` antes | ausente |
| Cron 93/94 antes | nenhum |
| `appointment_internal_alerts` total | 0 |
| Worker 71 | OFF ✅ (gate inegociável) |

---

## 3 · Gate WhatsApp banido (preservado)

Esta fase **não toca em envio**. Os alertas internos são UI-only · gravam em `appointment_internal_alerts` · são consumidos pelo `AlertBell` (polling 30s). Worker 71 segue OFF · nada sai pra Meta/Evolution.

Doc canônico: [45-phase-2l-whatsapp-real-send-ban-gate.md](45-phase-2l-whatsapp-real-send-ban-gate.md).

---

## 4 · Tick functions implementadas

### 4.1 · `_appointment_next_patient_internal_alert_tick()`

**Janela:** appointments cuja (scheduled_date + start_time) em `America/Sao_Paulo` esteja em `[now()+25min, now()+35min]`.

**Status elegíveis:** `agendado`, `aguardando_confirmacao`, `confirmado`, `aguardando`.

**Targets:**
- `target_role='secretaria'` (sempre)
- `target_role='professional', target_user_id=professional_id` (se NOT NULL)

**Idempotência:** UNIQUE(appointment_id, alert_kind, target_role) na tabela protege.

**Cron 93:** `*/5 * * * *` (janela 10min cobre delays e garante hit em 2 ticks consecutivos com UNIQUE protegendo duplicação).

### 4.2 · `_appointment_attention_required_alert_tick()`

**Janela:** appointments futuros (`today_sp` até `today_sp + 7d`).

**Status elegíveis:** `agendado`, `aguardando_confirmacao`, `confirmado`.

**Reasons detectadas (array em payload):**
- `no_phone` · subject_phone NULL ou vazio
- `no_subject_link` · lead_id NULL AND patient_id NULL (defensivo — `chk_appt_subject_xor` impede atualmente)
- `no_professional` · professional_id NULL ou professional_name vazio (defensivo — `professional_name` NOT NULL atualmente)

**Target:** `secretaria` (visibilidade operacional).

**Idempotência:** 1 alerta por appointment mesmo com múltiplas reasons (UNIQUE constraint preserva).

**Cron 94:** `0 10 * * *` UTC = 07:00 BRT (scan diário · runtime baixíssimo).

---

## 5 · Smoke transacional · resultado

```
SMOKE_RESULT_2G3:
  baseline: worker71_off=true, np_fn_exists=true, ar_fn_exists=true
  next_patient:
    validation_run_1: fired_1=2, count_secretaria=1, count_professional=1
    idempotency_run_2: fired_2=0, counts inalterados ✅
  attention_required:
    validation_run_1: fired_1=1, alert_no_phone.exists=true, reasons=['no_phone']
    idempotency_run_2: fired_2=0, count_ar_phone=1 ✅
  worker71_off_still: true ✅
  wa_outbox_delta: 0 ✅ (zero side-effect)
```

ROLLBACK forçado via `RAISE EXCEPTION` · zero dado persistente.

**Nota:** Fixtures `no_subject_link` e `no_professional` foram removidos do smoke porque schema constraints (`chk_appt_subject_xor` + `professional_name NOT NULL`) impedem INSERT desses cenários. As reasons permanecem no tick fn como código defensivo caso constraints relaxem no futuro.

---

## 6 · UI integration (já coberto)

`apps/lara/src/components/AlertBell.tsx` (entregue em 2G.2) **já contém os labels e ícones** para os novos kinds:

```ts
const ALERT_KIND_LABEL = {
  not_confirmed_d_minus_1: 'Não confirmou (amanhã)',
  not_confirmed_d_zero:    'Não confirmou (hoje)',
  arrival:                 'Paciente chegou',
  next_patient:            'Próximo paciente',     // 2G.3
  attention_required:      'Atenção necessária',   // 2G.3
}

function kindIcon(kind) {
  if (kind === 'arrival') return UserCheck
  if (kind === 'attention_required') return AlertCircle
  return CalendarClock  // next_patient + not_confirmed_*
}
```

Zero mudança em TypeScript. Hook `useAppointmentInternalAlerts` (polling 30s) consome `appointment_internal_alerts` via Supabase Realtime-ready (RLS app_clinic_id JWT).

---

## 7 · Cron inventory pós-2G.3

| Job | Nome | Schedule | Comando | Active |
|---|---|---|---|---|
| 12 | daily-summary | — | — | true |
| 71 | wa_outbox_worker_tick | — | (não importa) | **false** 🔒 |
| 72 | min_before | */5 * * * * | `_appointment_min_before_tick()` | true |
| 89 | d_zero | 0 12 * * * | `_agenda_alert_d_zero_tick()` | true |
| 90 | d_before | 0 13 * * * | `_agenda_alert_d_before_tick()` | true |
| 91 | not_confirmed | 0 12,18 * * * | `_appointment_not_confirmed_internal_alert_tick()` | true |
| 92 | d_after | 0 14 * * * | `_agenda_alert_d_after_tick()` | true |
| **93** | **next_patient_internal** | **\*/5 \* \* \* \*** | **`_appointment_next_patient_internal_alert_tick()`** | **true** |
| **94** | **attention_required_internal** | **0 10 \* \* \*** | **`_appointment_attention_required_internal_alert_tick()`** | **true** |

---

## 8 · Arquivos entregues

```
db/migrations/20260800000163_clinicai_v2_internal_alerts_completion.sql
db/migrations/20260800000163_clinicai_v2_internal_alerts_completion.down.sql
docs/crm-refactor/sql/phase-2g3-internal-alerts-completion-smoke.sql
docs/crm-refactor/sql/phase-2g3-internal-alerts-completion-validation.sql
docs/crm-refactor/51-phase-2g3-internal-alerts-completion.md   ← este doc
docs/crm-refactor/54-next-prompt-after-2g3.md
```

---

## 9 · Validação manual recomendada

1. Rodar `docs/crm-refactor/sql/phase-2g3-internal-alerts-completion-validation.sql`
2. Verificar `final_flags_2g3.can_continue=true`
3. Aguardar primeira execução natural do cron 93 (a cada 5 min) — só dispara alerta se houver appointment na janela
4. Aguardar primeira execução natural do cron 94 (07:00 BRT diário)
5. Abrir Lara CRM → Bell deve mostrar alertas reais conforme aparecerem

---

## 10 · Próximos passos

Consultar [54-next-prompt-after-2g3.md](54-next-prompt-after-2g3.md) — recomendação ordenada:

1. **2H** · frontend state alignment (remover hardcodes em CRM agenda detail page) — UI cleanup independente do ban
2. **2J** · finalização enterprise (modal de outcome, RPC `appointment_soft_delete`) — depende parcialmente de 2I
3. **2L.1** · ban resolution audit (READ-ONLY · plano migração Mih→Cloud Meta)

Em paralelo pode rodar 2L.1 com qualquer outra.
