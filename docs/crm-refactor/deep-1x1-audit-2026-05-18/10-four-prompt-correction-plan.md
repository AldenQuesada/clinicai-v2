# 10 · Four-Prompt Correction Plan

> READ-ONLY · doc-only · 2026-05-18 · cada prompt é STANDALONE com escopo, arquivos, migrations, validações, E2E, rollback, proibidos, veredito esperado.

Endereça **40 gaps prioritários** (14 P0 + 26 P1). P2/P3 ficam em backlog contínuo.

---

## PROMPT 1 · Agenda Foundation
> Profissionais · férias · procedimentos obrigatórios · salas · horário · conflitos · tipo XOR · Consulta vs Procedimento

### Escopo
Resolver fundação da agenda. Fechar gaps **M-02 · M-04 · M-08 · D-03 · D-04 · D-09 · D-15 · D-17 · V-03 · V-04 · V-10** (1 P0 sala + 7 P1).

### Arquivos a tocar
**v2 (clinicai-v2):**
- `apps/lara/src/app/crm/agenda/novo/_form.tsx` — step 2 (profissional + sala) + step 3 (tipo Consulta vs Procedimento toggle)
- `apps/lara/src/app/crm/agenda/novo/_components/professional-select.tsx` — auto-link prof→sala
- `apps/lara/src/app/crm/agenda/novo/_components/room-select.tsx` — novo componente
- `apps/lara/src/app/crm/agenda/novo/_components/appointment-type-toggle.tsx` — Consulta vs Procedimento
- `apps/lara/src/app/crm/_actions/appointment.actions.ts` — `checkAppointmentConflictAction` retorna nome do conflitante (`conflict_subject_name`)
- `apps/lara/src/app/crm/_schemas/appointment.schemas.ts` — Zod: novo enum `appointment_type ∈ {consulta, procedimento, retorno, bloqueado}` + `room_id uuid`
- `apps/lara/src/lib/clinic-settings.ts` — helper para ler `antecedencia_min` + `horario_funcionamento`
- `packages/repositories/src/appointment.repository.ts` — `.checkConflicts()` retorna `{ counts, conflict_subjects: [{name, status, time}] }`
- `packages/repositories/src/clinic-settings.repository.ts` (novo) — wrapper para clinic_settings
- `packages/repositories/src/professional-profiles.repository.ts` — adicionar `ferias jsonb` field + helper `isOnVacation(professional_id, date)`
- `packages/repositories/src/room.repository.ts` (novo se não existir) — wrap legacy RPCs `get_rooms / upsert_room / soft_delete_room` enquanto admin v2 não chega

**v2 admin (mínimo viável):**
- `apps/lara/src/app/admin/rooms/page.tsx` (novo) — CRUD UI usando wrappers acima

### Migrations
- `db/migrations/YYYYMMDD_appointment_type_enum.sql` — adicionar coluna `appointment_type` enum em `appointments`
- `db/migrations/YYYYMMDD_appointment_room_fk.sql` — adicionar `room_id uuid` FK nullable → `clinic_rooms(id)` (mantém `room_idx` deprecado para backfill posterior)
- `db/migrations/YYYYMMDD_professional_profiles_ferias.sql` — adicionar `ferias jsonb DEFAULT '[]'` (array de `{start_date, end_date, reason}`)
- `db/migrations/YYYYMMDD_clinic_rooms_admin_grants.sql` — garantir GRANT EXECUTE em `get_rooms/upsert_room/soft_delete_room` para role `authenticated` (não anon)
- `db/migrations/YYYYMMDD_check_appt_type_consistency.sql` — CHECK constraint: se `appointment_type='bloqueado'` então `lead_id IS NULL AND patient_id IS NULL`

### Validações novas (Zod + RPC + CHECK)
- `room_id` requerido se `appointment_type != bloqueado` (Zod refine)
- `appointment_type` enum required
- antecedência mínima validada no server action (lê `clinic_settings.antecedencia_min`)
- horário dentro de `clinic_settings.horario_funcionamento[dayOfWeek]` (server action)
- `professional_profile.ferias` check no server action (retorna `professional_on_vacation`)
- conflict response inclui `conflict_subjects` para UI exibir nome verbatim

### E2E (Playwright)
- `apps/lara/tests/e2e/crm-agenda-foundation.spec.ts` (novo)
  - cenário "Agendar com sala válida" → ✅
  - cenário "Profissional em férias" → erro `professional_on_vacation` com texto verbatim "Dr. X está em férias entre dd/mm e dd/mm"
  - cenário "Fora do expediente (sábado às 23h)" → erro `outside_working_hours`
  - cenário "Antecedência < min" → erro `min_lead_time` exibindo X horas mínimas
  - cenário "Conflito de sala com nome" → toast `"Conflito: Sala 1 está ocupada por João da Silva (10:00-11:00)"`

### Rollback
- Migrations todas com `BEGIN; ... COMMIT;` + downgrade scripts
- Feature flag (GrowthBook ou config) `crm_v2_agenda_foundation` default off durante 7 dias
- Se rollback: `cron.alter_job` n/a (não envolve cron) · só toggle flag

### Proibidos
- Não tocar em finalize, payments, RPCs `appointment_finalize`/`appointment_attend`/`change_status`
- Não migrar `room_idx` ainda (backfill é PROMPT 4)
- Não criar UI admin de procedures/professionals (escopo P2)

### Veredito esperado
`PASS_CRM_PATCH_1_AGENDA_FOUNDATION` quando:
- todas 5 specs E2E passam
- migration aplicada em prod + sanity OID-based em RPCs (`reference_rpc_grant_versioned` patterns)
- 0 regressão em `crm-agenda.spec.ts` existente
- audit anterior `wa_messages outbound last 30min` inalterado

---

## PROMPT 2 · Procedimentos + Pagamentos
> Múltiplos procedimentos · pagamento multi-linha · Money.sum · desconto · cortesia por item · retorno por procedimento

### Escopo
Resolver tudo de procedimentos e pagamentos. Fechar gaps **M-09 · M-10 · M-11 · M-12 · M-13 · M-16 · M-17 · M-18 · M-19 · M-22 · M-24 · D-08 · F-13 · V-17 (já feito) · V-25** (8 P0 + 4 P1).

### Arquivos a tocar
**v2:**
- `apps/lara/src/app/crm/agenda/novo/_components/procedure-line-items.tsx` (novo) — lista dinâmica de procedimentos com `<ProcedureLineItem/>` (nome, valor, cortesia toggle + motivo, desconto, retorno, intervalo dias, fases)
- `apps/lara/src/app/crm/agenda/[id]/_payment-panel.tsx` (novo) — multi-pagamento (10 formas) intra-detail
- `apps/lara/src/app/crm/agenda/novo/_components/multi-proc-warning.tsx` (novo) — modal se `sum(duracao_min) > slot_duration`
- `apps/lara/src/app/crm/agenda/novo/_components/wa-confirmation-toggle.tsx` (novo) — toggle "Enviar confirmação ao WhatsApp"
- `apps/lara/src/app/crm/_actions/payment.actions.ts` (novo) — `addPaymentAction / removePaymentAction / closePaymentAction`
- `apps/lara/src/app/crm/_actions/appointment.actions.ts` — `createAppointmentAction` aceita `procedure_items: ProcedureLineItem[]`
- `apps/lara/src/app/crm/_schemas/appointment.schemas.ts` — schemas `ProcedureLineItemSchema` + `AppointmentPaymentSchema`
- `packages/repositories/src/appointment-procedure-items.repository.ts` (novo)
- `packages/repositories/src/appointment-payment.repository.ts` (novo)
- `packages/repositories/src/helpers/money.ts` (novo) — `Money.sum`, `Money.toBRL`, `Money.fromCents`

### Migrations
- `db/migrations/YYYYMMDD_appointment_procedure_items.sql` — `CREATE TABLE public.appointment_procedure_items` (`id uuid PK`, `appointment_id uuid FK CASCADE`, `procedure_id uuid FK NULL`, `procedure_name text NOT NULL`, `qtd int DEFAULT 1`, `valor numeric(12,2) DEFAULT 0`, `desconto numeric(12,2) DEFAULT 0`, `cortesia bool DEFAULT false`, `cortesia_motivo text NULL`, `retorno_tipo text NULL`, `retorno_intervalo_dias int NULL`, `fases jsonb DEFAULT '[]'`, `created_at`, `updated_at`)
- `db/migrations/YYYYMMDD_appointment_payments.sql` — `CREATE TABLE public.appointment_payments` (`id`, `appointment_id FK`, `forma enum`, `valor numeric`, `parcelas int`, `data_vencimento date NULL`, `recebido numeric`, `troco numeric`, `status enum`, `convenio_nome text NULL`, `convenio_auth text NULL`, `link_url text NULL`, `created_at`)
- `db/migrations/YYYYMMDD_appointment_payment_status_view.sql` — view `appointments_payment_agg` que computa `payment_status` agregado a partir de `appointment_payments` (preserva backward compat com `appointments.payment_status` coluna)
- `db/migrations/YYYYMMDD_check_procedure_items_consistency.sql` — CHECK: `appointment_procedure_items.valor >= 0`, `cortesia=true => cortesia_motivo IS NOT NULL`, `desconto <= valor`
- `db/migrations/YYYYMMDD_enqueue_payment_followup_rpc.sql` — RPC `enqueue_payment_followup(p_appointment_id, p_forma, p_saldo)` cria row em `clinic_op_tasks`
- `db/migrations/YYYYMMDD_rls_appointment_procedure_items.sql` — RLS multi-tenant
- `db/migrations/YYYYMMDD_rls_appointment_payments.sql` — RLS multi-tenant

### Validações novas
- `procedure_items.length >= 1` se `appointment_type='procedimento'` (Zod refine)
- `Money.sum(payments) === appointment.value_total` (Zod refine + RPC check)
- cortesia: `valor=0` (já existe Zod L366-378, aplicar per-item)
- desconto: `desconto <= valor` (Zod refine)
- multi-proc warning: client-side se `sum(durations) > (end_at - start_at)` → modal force confirm

### E2E
- `apps/lara/tests/e2e/crm-multi-procedure.spec.ts` (novo)
  - "Botox + Preenchimento em 90min": criar appt com 2 procs · validar duration warning · finalize com cortesia em 1 item
  - "Pacote Lifting 5D em 2 fases": criar appt com retorno_intervalo=30 → valida criação de série
  - "Entrada PIX + saldo boleto": criar 2 payments · saldo>0 → cria task em `clinic_op_tasks`
  - "Cortesia procedimento + consulta paga": validar Money.sum, payment_status=`parcial` se cobrou só consulta
  - "Soma divergente do total": tenta criar com soma payments ≠ total → erro Zod

### Rollback
- Feature flag `crm_v2_multi_procedure_payments` default off
- Migrations reversíveis (DROP TABLE / DROP COLUMN)
- View `appointments_payment_agg` derruba sem perder `appointments.payment_status` legacy column

### Proibidos
- Não tocar em finalize RPC (PROMPT 3)
- Não tocar em hard gate clínico (PROMPT 3)
- Não migrar appointments existentes com 1 procedure_name para appointment_procedure_items (deixar para PROMPT 4 backfill)

### Veredito esperado
`PASS_CRM_PATCH_2_PROCEDURES_PAYMENTS` quando:
- 5 specs E2E passam
- 0 regressão em PROMPT 1 specs
- `appointment_procedure_items` tabela criada com 0 rows iniciais (backfill é PROMPT 4)
- `appointment_payments` tabela criada com 0 rows iniciais
- RLS validado via probe

---

## PROMPT 3 · Finalização + Hard Gate + Pós-consulta
> Modal finalização · outcomes · paciente/orçamento · hard gate · anamnese · consentimento · fotos · pós-consulta automations

### Escopo
Restaurar todos side effects de finalize. Fechar gaps **F-02 · F-07 · F-08 · F-09 · F-10 · F-11 · F-12 · F-13 · F-14 · U-10 · X-09 · X-10 · X-11** (5 P0 + 4 P1 + 4 P2/P3).

### Arquivos a tocar
**v2:**
- `apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx` — FinalizeWizard ganha bloco "Fluxos pós-atendimento" (4 checkboxes default-on: WA pós · Google review · VPI enroll · Retoques)
- `apps/lara/src/app/crm/agenda/[id]/_retoques-suggestion.tsx` (novo) — modal pós-finalize re-criando `RetoquesEngine.openSuggestionModal`
- `apps/lara/src/app/crm/agenda/[id]/_payment-recap.tsx` (novo) — recap final de payments
- `apps/lara/src/app/crm/pacientes/[id]/_tabs/_anamnese-tab.tsx` (novo · ou completar) — historico de anamneses
- `apps/lara/src/app/crm/pacientes/[id]/_tabs/_historico-tab.tsx` (novo) — histórico de consultas
- `apps/lara/src/app/crm/pacientes/[id]/_tabs/_fotos-tab.tsx` (novo) — galeria de fotos prontuário
- `apps/lara/src/app/crm/pacientes/[id]/_tabs/_financeiro-tab.tsx` (novo) — cashflow integration view
- `apps/lara/src/app/crm/_actions/appointment.actions.ts` — `finalizeAppointmentAction` aceita `postActions` payload
- `apps/lara/src/app/crm/_actions/clinical.actions.ts` — `attachAnamnesisAction`, `attachPhotoAction`
- `apps/lara/src/lib/automations/post-consult-emitter.ts` (novo) — emite eventos em `wa_agenda_automations_events`

### Migrations
- `db/migrations/YYYYMMDD_finalize_post_actions_param.sql` — alterar RPC `appointment_finalize` para aceitar `p_post_actions jsonb` com `{wa_pos_atendimento bool, solicitar_review_google bool, vpi_enroll bool, retoques_suggestion bool, cashflow_create bool}`
- `db/migrations/YYYYMMDD_finalize_emit_events.sql` — RPC emite events em `wa_agenda_automations_events` (trigger=`on_finalize`, `d_plus_3` para Google)
- `db/migrations/YYYYMMDD_appointment_photos.sql` — `CREATE TABLE public.appointment_photos` (`id`, `appointment_id FK`, `patient_id FK`, `storage_path`, `tipo enum`, `consent_signed bool`, `created_at`)
- `db/migrations/YYYYMMDD_appointment_complaints_link.sql` — junction `appointment_complaint_treats` (appointment_id, complaint_id, procedure_id) para tracking de queixas

### Validações novas
- `postActions` payload Zod schema (4 booleans)
- Foto upload exige `consent_signed=true` para tipos `antes_depois`
- Cashflow create: idempotente (se já existir entry para appointment_id, skip)

### E2E
- `apps/lara/tests/e2e/crm-finalize-post-actions.spec.ts` (novo)
  - "Finalize com VPI on": validar evento `vpi_enroll` em `wa_agenda_automations_events`
  - "Finalize com WA pós": validar row em `wa_outbox` (NÃO enviado, só enqueued)
  - "Finalize com Google review D+3": validar task em `clinic_op_tasks` com `due_at = now() + interval '3 days'`
  - "Finalize com cashflow create": validar row em `cashflow_entries`
  - "Finalize com retoques suggestion": validar modal abre pós-success
  - "Finalize com gate warning + override admin": validar audit row em `appointment_clinical_gate_overrides`
  - "Finalize sem permissão override": validar erro `override_permission_denied`
  - "Cancel/no-show com motivo obrigatório": validar CHECK constraint

### Rollback
- Feature flag `crm_v2_full_finalize_enabled` default off · liberar pra Mirian primeiro · após 7 dias sem rollback ativar global
- Manter `legacy_finalize_modal` invisível mas funcional por 30 dias (rollback emergencial)
- RPC `appointment_finalize` mantém compat: se `p_post_actions` IS NULL, comportamento atual

### Proibidos
- Não tocar em RPCs `appointment_attend` / `change_status` (já estáveis)
- Não migrar appointment_clinical_gate_overrides (já criada mig 167)
- Não criar UI admin de cashflow (escopo P2 backlog)

### Veredito esperado
`PASS_CRM_PATCH_3_FINALIZE_POST_ACTIONS` quando:
- 8 specs E2E passam
- 0 regressão em PROMPT 1+2 specs
- `wa_outbox` outbound após finalize > 0 em smoke test
- `appointment_clinical_gate_overrides` rows criados durante override flow

---

## PROMPT 4 · UI States + E2E + Audit-Check + Deploy
> Tooltips · alerts · disabled states · patient tabs completas · orçamento UI · E2E final · validation SQL · deploy

### Escopo
UX polishing + backfill data + smoke test E2E + deploy gradual. Fechar gaps **M-25 · M-26 · U-05 · U-06 · U-07 · X-01 · X-02 · X-04 · X-05 · X-12 + sanity** (1 P0 indireto + 11 P1 + cleanup).

### Arquivos a tocar
**v2:**
- `apps/lara/src/app/crm/agenda/_components/notification-bell.tsx` (novo) — sino com contagem
- `apps/lara/src/app/crm/agenda/_components/day-alerts-panel.tsx` (novo) — alerts do dia
- `apps/lara/src/app/crm/mesa-operacional/page.tsx` (novo) — Mesa Operacional v2
- `apps/lara/src/app/crm/orcamentos/[id]/_form.tsx` — UI completa: items table + edit inline + bulk delete + export CSV
- `apps/lara/src/app/crm/orcamentos/_export.tsx` (novo) — CSV export
- `apps/lara/src/app/crm/perdidos/_recovery-dry-run.tsx` (novo)
- `apps/lara/src/app/crm/agenda/novo/_form.tsx` — adicionar `useFormPersist` (draft autosave em localStorage)
- `apps/lara/src/app/crm/agenda/_components/_drag-utils.ts` — `detectDropConflict` retorna `subjectName` populado (já existe, garantir UI usa)
- `apps/lara/src/app/crm/agenda/_components/day-view.tsx` — exibir nome no toast
- `apps/lara/src/components/ui/EmptyState.tsx` — variantes adicionais (consentimentos, pagamentos, mesa-op)
- `apps/lara/tests/e2e/crm-full-smoke.spec.ts` (novo) — smoke completo PROMPT 1+2+3+4

### Migrations
- `db/migrations/YYYYMMDD_backfill_appointment_procedure_items.sql` — migrar appointments existentes (procedure_name text → 1 row em `appointment_procedure_items`)
- `db/migrations/YYYYMMDD_backfill_room_idx_to_room_id.sql` — backfill `room_id uuid` a partir de `room_idx integer` legacy (lookup em `clinic_rooms` por ordem ou nome cache)
- `db/migrations/YYYYMMDD_drop_appointments_payment_status_simple.sql` — opcional: dropar coluna `appointments.payment_status` simples (view `appointments_payment_agg` substitui)
- `db/migrations/YYYYMMDD_cleanup_em_consulta_zombie.sql` — `UPDATE appointments SET status='em_atendimento' WHERE status='em_consulta'` + cleanup audit log

### Validações finais
- Validation SQL probe: rodar query confirmando 0 rows com `status='em_consulta'` pós-cleanup
- Validation SQL probe: confirmar todas appointments com `procedure_name IS NOT NULL` têm 1 row em `appointment_procedure_items`
- Validation SQL probe: confirmar `room_id IS NOT NULL` em appointments futuros (∀ created_at > flag_release_date)

### E2E completo
- `apps/lara/tests/e2e/crm-full-smoke.spec.ts` cobre fluxo end-to-end:
  1. Criar paciente
  2. Criar appointment com sala + 2 procedimentos + recurrence
  3. Marcar chegada (`appointment_attend`)
  4. Preencher anamnese + registrar consentimento
  5. Adicionar payment (entrada PIX + saldo boleto)
  6. Finalizar com outcome paciente_orcamento + post actions on
  7. Validar: cashflow entry · wa_outbox enqueue · clinic_op_tasks payment task · `appointment_clinical_gate_overrides` audit (com override) · phase_history row
  8. Validar UI: toast outcome-specific · patient tabs populadas · orçamento exibido

### Rollback
- Backfill SQL com BEGIN/COMMIT + downgrade scripts
- Feature flags todos default off · ativar gradualmente Mirian → outras clínicas
- Manter `appointments.procedure_name` coluna como snapshot textual indefinidamente (não dropar)

### Proibidos
- Não dropar `room_idx integer` ainda (manter por 90 dias após backfill)
- Não dropar `appointments.payment_status` simples sem coordinated release com módulos dependentes (Mira, dashboards)
- Não enviar real WA durante smoke test (sempre `confirm_real_send=false` ou mock provider)

### Veredito esperado
`PASS_CRM_PATCH_4_UI_E2E_DEPLOY` quando:
- 1 smoke spec end-to-end passa em CI
- 4 validation SQL probes retornam 0 rows divergentes
- 0 regressão acumulada em todos specs (PROMPT 1+2+3+4)
- Deploy gradual concluído: Mirian first (7d) → outras clínicas (após sanity)

---

## Resumo do plano

| Prompt | Foco | P0 fechados | P1 fechados | Migrations novas | E2E novos | Tempo estimado |
|--------|------|-------------|-------------|-------------------|-----------|----------------|
| 1 | Agenda foundation | 1 | 7 | 5 | 1 spec (5 cenários) | 3-5 dias |
| 2 | Procedures + payments | 8 | 4 | 7 | 1 spec (5 cenários) | 5-7 dias |
| 3 | Finalize + post-actions | 5 | 4 | 4 | 1 spec (8 cenários) | 5-7 dias |
| 4 | UI + E2E + deploy | (indireto) | 11 | 4 | 1 smoke spec end-to-end | 4-6 dias |
| **Total** | – | **14 P0** | **26 P1** | **20 migrations** | **4 specs** | **~3-4 semanas** |

P2 (21 gaps) + P3 (8 gaps) ficam em backlog contínuo · não bloqueiam cutover.

## Após PROMPT 4

Pós-deploy:
- Manter audit `wa_messages outbound last 30min` em telemetria diária por 30 dias
- Monitor `appointment_clinical_gate_overrides` (alerta se taxa override > 20% em 7d)
- Monitor `clinic_op_tasks pagamento pendente` (alerta se backlog cresce sem closure)
- Dashboard de cutover: % appointments criados via v2 vs legacy, % com multi-proc, % com multi-pay

`PASS_CRM_CUTOVER_LEGACY_FREEZE_READY` quando todos 4 prompts validados + 30 dias sem rollback.
