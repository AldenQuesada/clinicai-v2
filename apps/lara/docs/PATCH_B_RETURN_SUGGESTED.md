# PATCH_B · B5 — Próximo retorno sugerido (NEEDS_SCHEMA_DECISION)

**Status:** NÃO implementado · gap documentado.
**Data:** 2026-05-17
**Patch:** CRM_PARITY_PATCH_0A_0B · Patch B

## Auditoria do contrato atual

Grep em `packages/`, `apps/lara/src/`, e `packages/supabase/src/types.ts` por:

- `next_return`
- `return_suggested`
- `retouch`
- `proximo_retorno`
- `nextReturn`
- `returnDate`

### Resultado

A tabela `public.appointments` (verificada em `packages/supabase/src/types.ts:1587-1701`) NÃO possui campo equivalente a "próximo retorno sugerido em N dias". Colunas atuais relacionadas a tempo:

- `scheduled_date`, `start_time`, `end_time` · slot da consulta
- `chegada_em`, `cancelado_em`, `no_show_em` · timestamps de eventos
- `recurrence_*` · série recorrente (interval_days entre sessões da mesma série · NÃO é "retorno sugerido")

O único campo similar encontrado é `next_retouch_date` (em `packages/supabase/src/types.ts:10641`), mas pertence a outra tabela (provavelmente `procedure_complaints` ou similar — domínio de queixa/retoque, não follow-up de consulta).

## Decisão

Conforme regras do Patch B:

> Se NÃO existe campo · NÃO criar migration

Portanto: **gap deixado para decisão de schema futura**. Marcadores:

- Adicionar coluna `next_return_suggested_days int NULL` em `appointments`, ou
- Criar tabela dedicada `appointment_followup_suggestions(appointment_id, days, created_at, professional_id)`
- Ou reaproveitar campo livre em `obs` com prefixo padronizado `[Retorno em Xd]` (não recomendado · não consultável)

A decisão depende de:

1. Se o follow-up vai gerar appointment automaticamente (cron) ou só sugestão visual no card do paciente
2. Se precisa de histórico (paciente recebeu N sugestões ao longo do tempo)
3. Se a Dra. quer apenas "retornar em 30/60/90 dias" (granularidade limitada · favorece coluna fixa) ou agendar data exata (favorece tabela)

## Recomendação operacional

Quando schema for decidido (suposições):

```sql
-- Hipótese A · coluna direta no appointment
ALTER TABLE appointments
  ADD COLUMN next_return_suggested_days int NULL
    CHECK (next_return_suggested_days IS NULL OR next_return_suggested_days BETWEEN 1 AND 730);
```

UI prevista (NÃO implementada nesta entrega):

- Select com presets `7 / 15 / 30 / 45 / 60 / 90 / 180 / 365` dias
- Campo opcional "Outro (digitar)" pra valor custom
- Exibido no FinalizeWizard como passo opcional · só aparece quando `outcome === 'paciente' || outcome === 'paciente_orcamento'`
- Renderizado no card do paciente em `/crm/pacientes/[id]` como "Próximo retorno sugerido · DD/MM/YYYY (em N dias)"

## Side-effect zero garantido

- Nenhuma migration criada
- Nenhuma mutação nova no banco
- Nenhuma alteração no `finalizeAppointmentAction` ou no `FinalizeAppointmentSchema`
- UI atual permanece intacta (não há referência a `nextReturn*` no codebase do `crm/agenda/[id]`)
