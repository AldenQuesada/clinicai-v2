# ROOM_IDX_DEPRECATED · pending product decision

**Status:** `ROOM_IDX_DEPRECATED_PENDING_PRODUCT_DECISION`
**Owner:** Alden (decision authorization)
**Last touched:** CRM_PARITY_PATCH_0A (2026-05-17)

## Estado atual

A coluna `appointments.room_idx` (mig 62) **existe no DB** e é lida pelo
`AppointmentRepository` (mapper + checkConflicts.room) + escrita por algumas
ações legadas (`dragDropAppointmentAction` referencia `appt.roomIdx` para
re-checar conflito de sala).

Mas o **wizard novo (`/crm/agenda/novo`) não expõe campo `room_idx`** — o
DB grava `NULL`. Resultado prático: o filtro `checkConflicts.room` sempre
retorna `[]` para appointments criados pelo wizard novo, e o array do
`details` "Sala ocupada" da action `checkAppointmentConflictAction` nunca
dispara.

## Por que não foi restaurado nesta rodada

- **Patch A escopo P0 = paridade UI mínima** (payment, periods, conflict
  feedback, dup lead). Adicionar UI room_idx exige:
  - cadastro de salas (tabela `clinic_rooms`? não existe ainda)
  - select alimentado por essa fonte
  - cardinalidade definida (clínica tem N salas fixas? dinâmico?)
- **Migration nova proibida** no patch A.
- O contrato semântico de sala foi removido do MVP da clínica de Mirian e
  ainda não voltou.

## Riscos conhecidos

1. Clínica com **múltiplas salas físicas** (ex: 2 macas paralelas) pode
   agendar dois procedimentos no **mesmo horário com profissionais
   diferentes** — `checkConflicts.professional` deixa passar (profissionais
   diferentes ≠ conflito), `checkConflicts.room` não filtra porque
   `roomIdx=null`.
2. `dragDropAppointmentAction` referencia `appt.roomIdx` mas como toda
   row tem `room_idx=NULL`, a checagem de conflito de sala vira no-op.

## Decisão pendente

Alden precisa autorizar (em sessão dedicada):

- [ ] Reabrir feature `room_idx`?
- [ ] Se sim:
  - Tabela canônica de salas (`clinic_rooms`? `clinic_settings.rooms` jsonb?)
  - UI de cadastro (configurações?)
  - Wizard `/crm/agenda/novo` adiciona Select de sala
  - Migration: criar tabela `clinic_rooms` + GRANT + RLS + RPC se cross-clinic
  - Backfill de appointments existentes (`room_idx=NULL` continua válido)
- [ ] Se não:
  - Decidir se `appointments.room_idx` permanece coluna no schema
    (sweep class-wide nas referências em código + considerar drop em mig
    futura · risco: cap. histórica)
  - Documentar oficialmente como "campo legado · não usado v2"

## Referências de código

- Coluna DB: `supabase/migrations/...mig 62...` (clinic-dashboard repo)
- Repo mapper: `packages/repositories/src/mappers/appointment.ts:23`
- Repo conflict: `packages/repositories/src/appointment.repository.ts:496-499`
- Action drag-drop: `apps/lara/src/app/crm/_actions/appointment.actions.ts:670`
  (`appt.roomIdx`)
