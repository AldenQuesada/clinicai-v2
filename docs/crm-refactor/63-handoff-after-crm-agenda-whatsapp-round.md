# CRM / Agenda / WhatsApp · Handoff curto

> Resumo de 1 página para qualquer chat futuro. Round fechada em 2026-05-12.

---

## Estado atual

- **Repo:** `clinicai-v2` · branch `main` · HEAD `25c9cab` == origin/main
- **DB:** Supabase project ref `oqboitkpcvuaudouwvkl` · 5 migrations CRM aplicadas (160, 161, 162, 163, 166)
- **Ban gate 2L:** Mih (5544991622986) banido · **worker 71 OFF (inegociável)**
- **Stack:** Next.js 16 + React 19 + TS + Tailwind 4 · Supabase Postgres + RLS multi-tenant ADR-028

## Commits principais (top 5)

```
25c9cab feat(crm): add appointment anamnesis and consent  (2I)
67cd50a feat(crm): add enterprise appointment finalization (2J)
afafc37 feat(crm): add patient arrival clinic flow (2H)
46fcfff feat(crm): complete internal appointment alerts (2G.3)
45302c1 feat(crm): add post-consultation d_after tick (2K)
```

## Jobs cron (todos verificados em 2026-05-12)

| ON | Job |
|---|---|
| ✅ | 12 daily-agenda-summary · 08 BRT |
| 🔒 OFF | 71 wa_outbox_worker_tick (gate inegociável) |
| ✅ | 72 min_before · a cada 1min |
| ✅ | 89 d_zero · 08 BRT |
| ✅ | 90 d_before · 10 BRT |
| ✅ | 91 not_confirmed · 08 BRT |
| ✅ | 92 d_after · 11 BRT |
| ✅ | 93 next_patient · a cada 5min |
| ✅ | 94 attention_required · 07 BRT |

## UI entregue (apps/lara/src/app/crm/agenda/[id])

- Card Status com `AppointmentStatusBadge` + `AppointmentActions`
- Card Clinical Panel (anamnese + consent + gate)
- Botões quick-action canônicos: Marcar chegada · Iniciar atendimento · Finalizar consulta
- FinalizeWizard com 3 outcomes (paciente · orcamento · paciente_orcamento) + warning clínico
- Modais: Cancelar (motivo) · No-show (motivo) · Anamnese (11 campos) · Consent (TCLE)
- AlertBell global · 5 kinds de alertas internos · polling 30s

## RPCs core do CRM/Agenda (17)

`appointment_attend` · `appointment_change_status` · `appointment_finalize`
`appointment_anamnesis_upsert` · `appointment_anamnesis_mark_complete`
`appointment_consent_accept` · `appointment_clinical_gate_status`
`appointment_internal_alert_create` · `appointment_internal_alert_mark_read`
`appointment_arrival_internal_alert`
`_agenda_alert_min_before_tick` · `_d_before` · `_d_zero` · `_d_after`
`_appointment_not_confirmed_alert_tick` · `_next_patient_internal` · `_attention_required`

Todas com `SECURITY DEFINER` + `search_path` blindado + GRANT auth + service_role.

## Bloqueios atuais

1. **Worker 71 OFF** · qualquer envio real WhatsApp depende de 2L.1 resolver
2. **Mih banido** · sem Cloud Meta API operacional não há alternativa
3. **Hard gate clínico ausente** · finalize aceita gate=warning (warning-only · decisão 2I)
4. **Zumbis `em_consulta` / `pre_consulta` / `compareceu` / `reagendado`** em ~106 ocorrências TS + migs antigas (não bloqueia operação · CHECK constraint rejeita)

## Próximo foco recomendado

**CRM_PHASE_2I.1 · Hard gate clinical finalization** · bloquear `appointment_finalize` se `appointment_clinical_gate_status` retornar `warning`, exigindo override admin com motivo.

Alternativas paralelas: **2L.1** (ban audit READ-ONLY) · **2J.1** (lead_lost dedicado) · **2H.1** (cleanup zumbis).

## Proibições inegociáveis

- ❌ `cron.alter_job(71, active := true)` · job 71 OFF é gate
- ❌ Chamada Evolution / Meta Cloud API / sendMessage / sendWhatsApp em produção
- ❌ Processar `wa_outbox` manualmente
- ❌ `git push --force` em main
- ❌ Apply migration sem prep + smoke + tracker repair
- ❌ Deploy manual sem CI

## Memórias relevantes (loaded via CLAUDE.md)

- `feedback_step_by_step.md` · trabalhar sequencial
- `feedback_always_push.md` · push após commit (mas só após autorização nesta rodada CRM)
- `feedback_no_postponing.md` · entregar vertical, não fragmentar
- `reference_security_checklist.md` · LER antes de criar migration/RPC
- `feedback_check_my_code_first.md` · varrer git log antes de blame externo
- `feedback_event_dispatch_trio.md` · event/template/dispatch no mesmo commit

## Docs canônicos da rodada

- [Doc 61 · Operational Closure](61-phase-2r-operational-closure-crm-agenda-whatsapp.md) · matriz dos 20 itens
- [Doc 62 · Next prompt](62-next-prompt-after-operational-closure.md) · opções verticais
- [SQL Validation 2R](sql/phase-2r-operational-closure-validation.sql) · health checks
- Por fase: 41 (2E audit) · 45 (2L ban gate) · 47 (2G) · 50/51/52/53/54 (2K + 2G.3) · 55/56 (2H) · 57/58 (2J) · 59/60 (2I)
