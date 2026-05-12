# Rollback notes · mig 182 · CRM_PHASE_APPOINTMENT_PROCEDURE_FK

> Migration: `db/migrations/20260800000182_clinicai_v2_appointment_procedure_fk.sql`
> · prepared local (LOCAL · NOT APPLIED até autorização explícita
> `CRM_PHASE_APPOINTMENT_PROCEDURE_FK_APPLY`).

## O que a migration adiciona (quando aplicada)

| Objeto | Tipo | Detalhe |
|---|---|---|
| `public.appointments.procedure_id` | coluna `uuid NULL` | nullable · sem default · sem NOT NULL |
| `public.appointments.appointments_procedure_id_fkey` | FK | → `public.clinic_procedimentos(id)` · `ON UPDATE CASCADE` · `ON DELETE SET NULL` |
| `public.idx_appointments_procedure_id` | índice parcial | `WHERE procedure_id IS NOT NULL` |
| COMMENT em `appointments.procedure_id` | documentação | contrato canônico vs snapshot |

## O que a migration NÃO toca

- `appointments.procedure_name` (snapshot textual permanece intocado)
- `appointments.recurrence_procedure`
- Demais colunas / constraints / RLS / policies de `appointments`
- `clinic_procedimentos` (somente referenciado pela FK)
- Hard gate clínico (`appointment_finalize`, `appointment_clinical_gate_status`,
  `appointment_anamnesis_upsert`, `appointment_anamnesis_mark_complete`,
  `complete_anamnesis_form`)
- `wa_outbox`, `cron`, job 71, env/secrets
- `medical_record_attachments`

## Sem backfill

Match rate `procedure_name × clinic_procedimentos.nome` = **0%** nesta clínica
(2 procedure_names · zero match com 44 procedimentos ativos). Backfill **não
é executado** por essa migration e não há ganho operacional em fazê-lo.
A coluna nasce 100% NULL · UI nova grava `procedure_id` no fluxo canônico
quando wiring de código for liberado em fase pós-apply.

## Como reverter (rollback de emergência)

A migration é totalmente reversível. Como zero rows têm valor real na coluna
nova, o DROP COLUMN não destrói dados operacionais.

```sql
-- 1. Remove o índice parcial.
DROP INDEX IF EXISTS public.idx_appointments_procedure_id;

-- 2. Remove a FK (`appointments_procedure_id_fkey`).
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_procedure_id_fkey;

-- 3. Remove a coluna (zero dados perdidos · nasceu NULL).
ALTER TABLE public.appointments
  DROP COLUMN IF EXISTS procedure_id;
```

## Por que não há `.down.sql` automático

A migration é incremental e segura · um `.down.sql` simétrico aumenta a
manutenção e dá falsa garantia. Documentamos receita SQL aqui · operador
humano executa caso necessário.

## Validação pós-apply esperada

- `appointments_procedure_id_exists_remote`: true (após apply)
- `appointments_procedure_id_fkey` presente em `pg_constraint`
- `idx_appointments_procedure_id` presente em `pg_indexes`
- `appointments.procedure_name` inalterado
- `clinic_procedimentos` inalterado
- `worker71_off`: true
- `hard_gate_untouched`: true
- `cron_with_provider_call`: 0
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- Tracker `20260800000182` registrado em `supabase_migrations.schema_migrations`

## Substituição do PROPOSED histórico

O arquivo `db/migrations/PROPOSED_appointments_procedure_fk.sql` é removido
no commit que cria a 182 (substituído · mesmo contrato + correção de número
+ `ON UPDATE CASCADE` + DO block defensivo na FK). Conteúdo da PROPOSED
permanece auditável no histórico Git.
