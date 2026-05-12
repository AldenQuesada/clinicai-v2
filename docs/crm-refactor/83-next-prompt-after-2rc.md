# CRM · Next Prompt After 2RC

> Round 2RC entregou a **fundação** de recuperação comercial: view unificada
> `commercial_recovery_queue_view` (mig 172 · aplicada) + RPCs auxiliares
> (mig 173 · draft, apply aguarda autorização) + UI `/crm/recuperacao`
> + 3 server actions + nav link. Zero WhatsApp. Worker 71 segue OFF.

---

## Estado consolidado pós-2RC

- HEAD esperado · commit local `feat(crm): add commercial recovery foundation`
- Mig 172 aplicada · tracker `20260800000172`
- Mig 173 SQL pronto (`db/migrations/20260800000173_*.sql`) · apply aguarda
  autorização explícita do usuário
- Página `/crm/recuperacao` operacional · 4 KPI cards + 3 filtros + dialogs
- Repository, actions, Zod, role gate · canônicos
- Smoke transacional 2RC: PASS · validation pronta
- Worker 71 OFF · ban gate 2L intacto

---

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar `wa_outbox`
- NÃO criar automação de envio
- NÃO usar status zumbi
- NÃO reintroduzir `phase='perdido'`
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2RC.1 · Aplicar mig 173 + smoke UI + commit (RECOMENDADA)

**Por quê:** fecha o ciclo 2RC. Mig 173 já está SQL-pronta e validada via
smoke embutido. Falta apenas:

1. Autorização explícita pra `node scripts/apply-migration.mjs db/migrations/20260800000173_clinicai_v2_commercial_recovery_actions.sql`
2. Smoke transacional dedicada das 2 RPCs (`recovery_perdido_mark_discarded`,
   `recovery_perdido_add_note`) com role gate · tem que dar PASS
3. Smoke manual UI com 1 fixture `lead_lost` em sandbox
4. Validation SQL → `can_continue=true` + `mark_discarded_rpc_ready=true`
   + `add_note_rpc_ready=true`
5. Commit local + push (com autorização padrão)

**Saída:** 2RC fechada · queue + actions + UI live.

### Opção B · CRM_PHASE_2RD · Lara templates para recuperação (read-only)

**Por quê:** preparar conteúdo · zero envio · zero cron. Define templates
em `b2b_comm_templates` (ou tabela genérica equivalente) com `event_key`
tipo `recovery.lead_lost.invite` e `recovery.appointment_cancelled.reagendar`.
Frontend mostra preview do template no dialog "Reativar" (UX-only).

**Escopo:**
- Mig: seed em `b2b_comm_templates` com 4-6 templates (1 por source_type)
- UI: preview de template no dialog "Reativar" (texto rendered no client)
- Sem dispatch · sem `wa_outbox` · sem cron

### Opção C · CRM_PHASE_2RE · Materializar a queue em tabela + tracking

**Por quê:** se a clínica passar de ~5k perdidos + ~5k appointments cancelados,
a view UNION ALL fica lenta. Materializar em `commercial_recovery_items` com
triggers de auto-populate + status próprio (em_contato, agendado_retorno, etc).

**Escopo:**
- Mig: tabela `commercial_recovery_items` (não-soft-delete · status enum próprio)
- Triggers: AFTER INSERT em `perdidos`, AFTER UPDATE em `appointments`
  (cancelado/no_show), AFTER INSERT em `orcamentos`
- Backfill: 1x SQL inicial · idempotente
- Refactor UI: lista direto da tabela · view 2RC vira view legacy
- Adiciona métricas de tempo (lead_time entre perdido e recuperado)

### Opção D · CRM_PHASE_2S · Soft-delete admin canon

**Por quê:** spec Phase 2I.1 deixou mention de soft-delete admin only com
override auditável. Faz parte da matriz mas não foi destrinchado · merece
prompt dedicado quando recuperação estabilizar.

### Opção E · CRM_PHASE_2T · Pipeline WhatsApp recuperação (DEPENDE 2L.3)

**Por quê:** só faz sentido após Meta unban. NÃO escolher essa opção até
2L.3 PASS (unblock confirmed). Quando 2L.3 estiver verde, este é o caminho
natural: templates aprovados na Meta + cron varredura `lifecycle=recuperacao`
+ Lara envia via Cloud API.

---

## Recomendação

**Opção A** (CRM_PHASE_2RC.1) · fechar o ciclo 2RC antes de partir pra
novidade. Apply mig 173 + smoke + commit + push deixa a feature totalmente
operacional. Sem isso, ações descartar/anotar ficam quebradas no client.

---

## Mega-prompt template (Opção A)

```
CRM_PHASE_2RC.1 · CLOSE COMMERCIAL RECOVERY (apply mig 173 + smoke + commit)

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO processar wa_outbox.
NÃO alterar env/secrets.
NÃO criar automação de envio.

ESCOPO:
1. Apply mig 173 (`db/migrations/20260800000173_clinicai_v2_commercial_recovery_actions.sql`)
   via Management API
2. Registrar tracker `20260800000173`
3. Smoke transacional dedicada das 2 RPCs com role gate
4. Validation SQL → flags todos verdes
5. Smoke manual UI · 1 fixture lead_lost em sandbox
6. Typecheck `@clinicai/lara` + `@clinicai/repositories`
7. Commit local + push origin/main (mediante autorização padrão)

PASS_CRM_PHASE_2RC1_CLOSED quando:
- tracker_mig_173 presente
- mark_discarded_rpc_ready=true AND add_note_rpc_ready=true
- can_continue=true
- typecheck OK
- HEAD == origin/main após push
```
