# PATCH_B · B6 — Alerta secretaria pós-finalização (VISIBILIDADE)

**Status:** Visibilidade já existe · sem mudanças necessárias para "pós-finalização".
**Data:** 2026-05-17
**Patch:** CRM_PARITY_PATCH_0A_0B · Patch B

## Auditoria

Grep em `packages/` e `apps/lara/src/` por:

- `appointment_internal_alerts`
- `InternalAppointmentAlertsRepository`
- `createArrivalInternalAlert`

### Resultado positivo · pipeline completo já implementado

| Camada | Caminho | Estado |
| --- | --- | --- |
| Tabela DB | `appointment_internal_alerts` (mig 161 · CRM_PHASE_2G) | LIVE |
| Repository (server) | `packages/repositories/src/appointment.repository.ts` · método `createArrivalInternalAlert(appointmentId)` (linhas 333-) | LIVE |
| Server action dispatch | `apps/lara/src/app/crm/_actions/appointment.actions.ts` · `attendAppointmentAction` chama `createArrivalInternalAlert` best-effort após `attend` (linhas 386-414) | LIVE |
| Hook client | `apps/lara/src/hooks/useAppointmentInternalAlerts.ts` · polling 30s + RPC `appointment_internal_alert_mark_read` | LIVE |
| Componente UI | `apps/lara/src/components/AlertBell.tsx` · sino com badge no topbar + dropdown agrupado (chegadas vs outros) + som local opcional | LIVE |
| Montagem no layout | `apps/lara/src/components/AppHeaderThin.tsx:81` · `<AlertBell />` montado no header global | LIVE |

### Tipos de alerta suportados pelo hook/UI

`alert_kind` da tabela, conforme `useAppointmentInternalAlerts.ts`:

- `not_confirmed_d_minus_1` — não confirmou D-1
- `not_confirmed_d_zero` — não confirmou D0
- `arrival` — paciente chegou (gerado por `attendAppointmentAction`)
- `next_patient` — próximo paciente
- `attention_required` — atenção necessária

Target roles: `secretaria`, `professional`, `doctor`, `admin`.

## Gap específico do escopo (B6 · pós-finalização)

O escopo do Patch B menciona "alerta secretaria pós-finalização". Hoje o pipeline:

- Gera alerta automaticamente quando paciente CHEGA (`attend`).
- NÃO gera alerta automaticamente quando consulta é FINALIZADA (`finalize`).

### Decisão

> "NÃO criar action que envia alerta · apenas visibilidade · zero mutação nova"

Portanto, o Patch B **não cria alerta novo de finalização**. A visibilidade dos alertas existentes (incluindo qualquer eventual alerta `attention_required` que outro fluxo crie para a secretaria) já está coberta pelo `AlertBell` no topbar global.

## Recomendação futura (fora do escopo · não implementada)

Se for desejado emitir alerta automático pós-finalização (ex: "secretaria · paciente finalizado · marcar retorno em X dias / cobrar pendência / enviar receita"), o caminho seria:

1. Adicionar `'post_finalize'` no enum `alert_kind` (mig nova)
2. Adicionar método `createPostFinalizeInternalAlert(appointmentId, kind)` no `AppointmentRepository` (espelho do `createArrivalInternalAlert`)
3. Chamar no `finalizeAppointmentAction` best-effort, após sucesso, exatamente como `attendAppointmentAction` faz hoje (linhas 386-414)
4. Adicionar label no `ALERT_KIND_LABEL` do `AlertBell.tsx`

Mas isso EXIGE mig + nova action mutation · **fora do escopo do Patch B** que proíbe ambos.

## Side-effect zero garantido

- Nenhuma migration criada
- Nenhum método repository novo
- Nenhuma action nova
- Nenhum INSERT em `wa_outbox` ou disparo de WhatsApp
- `_actions-bar.tsx` e `page.tsx` apenas consomem visibilidade já existente via topbar
