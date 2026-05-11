# 02 · Database Inventory

> Inventário read-only de tabelas, colunas, RPCs, triggers, views, RLS encontrados nas migrations relevantes ao CRM. Estado em 2026-05-10.

---

## 1 · Tabelas canônicas

| Tabela | Migration criadora | Status | Schema |
|---|---|---|---|
| `public.leads` | `20260800000060` | ✅ Ativa | uuid PK, FK clinic_id, soft-delete pattern |
| `public.appointments` | `20260800000062` | ✅ Ativa | uuid PK, subject = lead OR patient (XOR), soft-delete |
| `public.patients` | `20260800000061` | ✅ Ativa | uuid PK (= lead.id original), soft-delete |
| `public.orcamentos` | `20260800000063` | ✅ Ativa | uuid PK, subject = lead OR patient (XOR), soft-delete |
| `public.phase_history` | `20260800000064` | ✅ Ativa | uuid PK, audit append-only, sem UPDATE/DELETE para `authenticated` |
| `public.perdidos` | `20260700000754` (legado) | ⚠️ Espelho histórico | Originalmente fonte principal · agora redundante com `leads.phase='perdido'` + `lost_*` |
| `public.lead_pipeline_positions` | legado | Audit/legado | Posições ordenadas pra kanban antigo |
| `public.leads_audit` | legado | Audit | Snapshot/diff de leads (não confundir com phase_history) |
| `legacy_2026_04_28.*` | `20260800000059` (snapshot) | Vivo (read-only) | Backup pré-cleanup de Abril |

### 1.1 · `public.leads` — colunas-chave

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `clinic_id` | uuid | FK + RLS scope |
| `phone` | text | UNIQUE (clinic_id, phone), normalizado E.164-ish via trigger |
| `name`, `email`, `cpf`, `rg` | text | Identificação |
| `phase` | text | CHECK 7 valores |
| `temperature` | text | cold/warm/hot |
| `funnel` | text | livre/CHECK |
| `priority` | text | normal/high/urgent |
| `source`, `source_type` | text | CHECK enums (whatsapp, quiz, manual, import, etc) |
| `is_in_recovery` | boolean | TRUE quando lead perdido foi reativado · ainda usado |
| `lost_reason` | text | Obrigatório quando `phase='perdido'` |
| `lost_at` | timestamptz | idem |
| `lost_by` | uuid | user que registrou |
| `lost_from_phase` | text | Referenciado em mig 103 · presença confirmada implícita (CHECK `chk_leads_lost_from_phase`) |
| `assigned_to` | text | user_id responsável |
| `metadata` | jsonb | Dados livres (b2b_voucher_token, scoring, etc) |
| `phase_updated_at`, `phase_updated_by`, `phase_origin` | — | Audit inline da última transição |
| `deleted_at` | timestamptz | Soft-delete (modelo excludente: vira paciente/orcamento) |
| `created_at`, `updated_at` | timestamptz | Standard |

**Colunas que o contrato-alvo exige adicionar:**
- ❌ `lifecycle_status text` (CHECK ativo/perdido/recuperacao/arquivado) · **NÃO EXISTE** apesar de referenciada em mig 103 (bug)
- ❌ `archived_at timestamptz`
- ❌ `archive_reason text`

### 1.2 · `public.appointments` — colunas-chave

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `clinic_id` | uuid | FK |
| `lead_id` / `patient_id` | uuid | XOR via CHECK · um ou outro, nunca ambos |
| `subject_name`, `subject_phone` | text | Cache do nome/telefone do paciente |
| `professional_id` | uuid | user_id médico |
| `scheduled_date`, `start_time`, `end_time` | date/time | Slot |
| `procedure_name` | text | livre |
| `status` | text | CHECK 13 valores |
| `payment_status` | text | enum |
| `chegada_em`, `cancelado_em`, `no_show_em` | timestamptz | Marcos do fluxo |
| `consentimento_img` | bool | LGPD |
| `recurrence_*` | 5 cols | Para appointments recorrentes |
| `deleted_at` | timestamptz | Soft-delete |

### 1.3 · `public.patients` — colunas-chave

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK = lead.id original (ADR-001) |
| `clinic_id` | uuid | FK |
| `name`, `phone`, `email`, `cpf`, `rg`, `birth_date` | — | Dados |
| `status` | text | active/inactive/blocked/deceased |
| `total_procedures`, `total_revenue` | int/numeric | Agregados |
| `first_procedure_at`, `last_procedure_at` | timestamptz | Marcos |
| `assigned_to` | text | user_id |
| `source_lead_meta` | jsonb | Snapshot do lead.metadata no momento da conversão |
| `deleted_at` | timestamptz | Soft-delete |

**Coluna histórica em camelCase** preservada por ADR-005 exceção: `tenantId`, `totalProcedures`, `totalRevenue`, `firstProcedureAt`, `lastProcedureAt`, `createdAt`, `updatedAt`. Boundary em repository.

### 1.4 · `public.orcamentos` — colunas-chave

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `clinic_id` | uuid | FK |
| `lead_id` / `patient_id` | uuid | XOR |
| `number`, `title` | text | Identificação humana |
| `items` | jsonb (array) | Procedimentos/produtos com validação shape |
| `subtotal`, `discount`, `total` | numeric | Total = subtotal − discount ± 0.01 |
| `status` | text | draft/sent/viewed/followup/negotiation/approved/lost |
| `valid_until` | date | Validade |
| `payments` | jsonb (array) | Lista de pagamentos |
| `share_token` | uuid UNIQUE | Token público para `/orcamento/<token>` |
| `created_by` | uuid | user |
| `deleted_at` | timestamptz | Soft-delete |

### 1.5 · `public.phase_history` — colunas-chave

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid | PK |
| `clinic_id` | uuid | FK + RLS scope |
| `lead_id` | uuid (ON DELETE SET NULL) | Lead alvo |
| `from_phase`, `to_phase` | text | CHECK valores válidos |
| `from_status`, `to_status` | text | (appointment status quando aplicável) |
| `origin` | text | `auto_transition` / `manual_override` / `rule` / `bulk_move` / `import` / `webhook` / `rpc` |
| `triggered_by` | text | nome da função/trigger originária |
| `actor_id` | uuid | user_id humano (NULL quando automático) |
| `reason` | text | livre · obrigatório para perda |
| `created_at` | timestamptz | now() |

**RLS:** SELECT + INSERT para `authenticated`. **Sem UPDATE/DELETE** (audit imutável). `service_role` bypassa.

**Coluna que o contrato-alvo exige adicionar:**
- ❌ `from_lifecycle text` / `to_lifecycle text` (para audit de mudanças ortogonais de lifecycle)

---

## 2 · CHECK constraints relevantes

| Constraint | Tabela | Definição (resumo) | Migration |
|---|---|---|---|
| `chk_leads_phase` | leads | phase ∈ {lead, agendado, reagendado, compareceu, paciente, orcamento, perdido} | 60 + 103 |
| `chk_leads_lost_consistency` | leads | Se `phase='perdido'` → `lost_reason`, `lost_at`, `lost_from_phase` obrigatórios | 60 + 103 ⚠️ |
| `chk_leads_lost_from_phase` | leads | lost_from_phase ∈ {lead, agendado, reagendado, compareceu, paciente, orcamento} OR NULL | 103 |
| `chk_leads_source` / `chk_leads_source_type` | leads | enums fonte | 60 |
| `chk_leads_funnel` / `chk_leads_temperature` / `chk_leads_priority` | leads | enums livres | 60 |
| `chk_leads_cpf_format` | leads | regex CPF | 60 |
| `chk_appt_status` | appointments | 13 valores (lista §1 doc 03) | 62 + 103 |
| `chk_appt_subject_xor` | appointments | (lead_id IS NOT NULL) XOR (patient_id IS NOT NULL) | 62 |
| `chk_appt_time_order` | appointments | end_time > start_time | 62 |
| `chk_appt_value_positive` | appointments | preço >= 0 | 62 |
| `chk_appt_recurrence_consistency` / `chk_appt_cancelled_consistency` / `chk_appt_noshow_consistency` | appointments | Marcos consistentes | 62 |
| `chk_orc_status` | orcamentos | enum status | 63 |
| `chk_orc_money_positive` / `chk_orc_total_consistency` | orcamentos | total = subtotal − discount | 63 |
| `chk_orc_subject_xor` | orcamentos | lead OR patient | 63 |
| `chk_ph_to_phase` / `chk_ph_from_phase` / `chk_ph_origin` | phase_history | enums | 64 |
| `chk_patients_status` / `chk_patients_sex` | patients | enums | 61 |

### ⚠️ BUG em `chk_leads_lost_consistency` (mig 103)

```sql
-- Linha 32-33 mig 103:
(lifecycle_status <> 'perdido') OR (
  lifecycle_status = 'perdido' AND ...
```

A coluna `lifecycle_status` **não existe** em `public.leads`. CHECK aceito porque CREATE não força resolução (validação só ocorre em UPDATE/INSERT). **Próximo UPDATE em qualquer linha de `leads` explodirá com erro 42703.** Risco P0 a confirmar via probe SQL.

---

## 3 · RPCs canônicas (encontradas)

| RPC | Migration | Assinatura | Status |
|---|---|---|---|
| `_lead_phase_transition_allowed(from text, to text)` | 65 (v2) re-app de 828 (legado) | RETURNS boolean · IMMUTABLE · SECURITY DEFINER | ✅ |
| `lead_create(phone, name, source, source_type, funnel, email, metadata, assigned_to, temperature)` | 65 | RETURNS jsonb | ✅ |
| `lead_to_appointment(lead_id, scheduled_date, start_time, end_time, ...)` | 65 | RETURNS jsonb · SELECT FOR UPDATE | ✅ |
| `appointment_attend(appointment_id, chegada_em)` | 65 | RETURNS jsonb · idempotente | ✅ |
| `appointment_finalize(appt_id, outcome, value, payment_status, notes, lost_reason, items, subtotal, discount)` | 65 | RETURNS jsonb · routes para `lead_to_paciente`/`lead_to_orcamento`/`lead_lost` | ✅ |
| `lead_to_paciente(lead_id, total_revenue, first_at, last_at, notes)` | 65 | RETURNS jsonb · soft-delete + INSERT | ✅ |
| `lead_to_orcamento(lead_id, subtotal, items, discount, notes, title, valid_until)` | 65 | RETURNS jsonb · soft-delete + INSERT | ✅ |
| `lead_lost(lead_id, reason)` | 65 | RETURNS jsonb · idempotente | ✅ |
| `sdr_change_phase(lead_id, to_phase, reason)` | 65 | RETURNS jsonb · roteador genérico | ✅ |
| `b2b_refer_lead_safe(...)` | legado B2B | Criação de lead via parceria | ✅ |
| `orcamento_followup_pick(...)` / `orcamento_followup_mark_sent(...)` / `orcamento_followup_clear_stuck(...)` | legado | Cron worker | ✅ |

### RPCs do contrato-alvo que **NÃO existem**

| RPC | Função esperada |
|---|---|
| `lead_recovery_activate(lead_id, reason)` | Set `lifecycle_status='recuperacao'`. Substituiria/complementaria `perdido_to_lead`. |
| `lead_archive(lead_id, reason)` | Set `lifecycle_status='arquivado'`. |
| `lead_unarchive(lead_id)` | Set `lifecycle_status='ativo'`. |
| `leads_bulk_change_phase(lead_ids[], to_phase, reason)` | Existe em legado (mig 623) mas NÃO foi re-aplicada na v2. |
| `appointment_change_status(appt_id, to_status)` | Genérica · hoje fragmentada em RPCs específicas. |
| `appointment_cancel(appt_id, reason)` | Dedicada · hoje feita via `update` direto no repo. |
| `_appointment_status_transition_allowed(from, to)` | Matriz IMMUTABLE para appointments (não existe). |
| `crm_operational_view` (view ou MV) | Read model canônico. |
| `_sdr_record_phase_change` (helper) | Citado no prompt · pode estar inline em `sdr_change_phase` (verificar). |

### RPC duplicada / em conflito

- `perdido_to_lead` existe em legado · usado para "recuperar" perdido. Função alvo `lead_recovery_activate` será substituta — `perdido_to_lead` viraria deprecated.

---

## 4 · Triggers ativos relevantes

| Trigger | Tabela | Evento | Função | Migration |
|---|---|---|---|---|
| `leads_updated_at` | leads | BEFORE UPDATE | `set_updated_at()` | 60 |
| `leads_normalize_phone` | leads | BEFORE INSERT/UPDATE phone | `trg_normalize_phone()` | 60 |
| `appointments_updated_at` | appointments | BEFORE UPDATE | `set_updated_at()` | 62 |
| `appointments_normalize_phone` | appointments | BEFORE INSERT/UPDATE subject_phone | `trg_normalize_patient_phone()` | 62 |
| `orcamentos_updated_at` | orcamentos | BEFORE UPDATE | `set_updated_at()` | 63 |
| `_appt_revert_lead_phase_on_remove` | appointments | AFTER DELETE/UPDATE(deleted_at) | reverte phase quando último appt some | 818 legado |
| `trg_normalize_phone()` | function helper | — | normalização BR | 60 |

**Triggers legados que devem ter sumido** (auditar se foram removidos):
- `_auto_move_lead_to_target_table` (zumbi · removido na mig 756 legado · não re-aplicado em v2 ✓)
- `trg_budget_created_phase` (legado · status incerto)
- `fm_cascade_delete_lead` (legado · auditado em mig 828)

---

## 5 · Views encontradas

| View | Tipo | Migration | Função | Status |
|---|---|---|---|---|
| `budgets` | VIEW compat | 755 | Redirect → orcamentos | Ativa |
| `leads_list_full_fields` | VIEW operacional | 577 | Lista enriquecida | Ativa |
| `leads_list_funnel` | VIEW | 611 | Filtro por funnel | Ativa |
| `leads_list_*` (variantes) | VIEWs | vários | Filtros pré-construídos | Ativa |
| `wa_conversations_operational_view` | VIEW | 147 | 6 KPIs secretaria · agrupa por `operational_owner` | Ativa (Lara v2) |
| `crm_operational_view` | — | — | **NÃO EXISTE** · gap do contrato-alvo | ❌ |

---

## 6 · RLS Policies (resumo)

Padrão por tabela tenant-scoped:

```
SELECT:  clinic_id = app_clinic_id() + role-based + (assigned_to / professional_id allowed)
INSERT:  clinic_id = app_clinic_id() + role-based · WITH CHECK (corrige bug legado)
UPDATE:  idem + assigned_to/professional_id permitidos
DELETE:  is_admin() OR role==='owner'
```

`phase_history`:
```
SELECT: clinic_id + role-based
INSERT: clinic_id + role-based · WITH CHECK
NO UPDATE / NO DELETE (authenticated) · service_role bypass
```

Todas as 4 policies por tabela em: `leads`, `appointments`, `patients`, `orcamentos`.

Helper `app_clinic_id()` lê JWT (ADR-028). Multi-tenant via JWT.

---

## 7 · Schema `legacy_2026_04_28`

- Criado pela mig 59 (2026-04-28) como snapshot pré-refactor.
- Contém versões "amplas" das tabelas leads/appointments/patients/etc.
- 7 FKs externas (quiz_responses, wa_consent, budget_items, etc) apontam para `public.*` com `NOT VALID` (mig 66) · backward compat.
- **Ainda vivo** — não pode ser dropado até cleanup completo de rows antigas que referenciam ele.

---

## 8 · Tabelas de mensagens vinculadas a CRM

| Tabela | FK para CRM | Uso |
|---|---|---|
| `wa_messages` | `conversation_id`, `lead_id` (?) | Histórico inbound/outbound · mig P2.8 adicionou `ai_copilot` jsonb |
| `wa_conversations` | `clinic_id`, `phone`, `lead_id`, `wa_number_id` | Mapeamento conv↔lead · `operational_owner` + `status` + `ai_copilot` cache (mig 870) |
| `wa_outbox` | `lead_id`, `clinic_id` | Fila outbound · usado por cron orcamento-followup |
| `interactions` | `lead_id` | Eventos timeline · legado |
| `b2b_comm_dispatch_log` | `partnership_id`, `lead_id` | Dispatches comunicação B2B |

---

## 9 · Crons que tocam DB

| Cron (route) | Mutações |
|---|---|
| `/api/cron/orcamento-followup` | UPDATE `orcamentos.last_followup_at` · INSERT `wa_outbox` |
| `/api/cron/lid-pending-monitor` | NENHUMA (read-only) |
| `/api/cron/divergence-check` | NENHUMA (read-only · só report) |
| `/api/cron/wa-chat-sync` | UPDATE `wa_conversations.status/operational_owner` |
| `/api/cron/reactivate` | UPDATE `wa_conversations.status` archived→active |
| `/api/cron/copilot-commercial-smoke` | NENHUMA |
| `/api/cron/evolution-gap-monitor` | NENHUMA (alertas externos) |
| `/api/cron/cross-instance-media-hydrate` | UPDATE `wa_messages.media_url` |

✅ Nenhum cron muda `leads.phase` diretamente.

---

## 10 · Migration timeline crítica

| Migration | Quando | O que fez |
|---|---|---|
| `20260420_anatomy_quiz_lifecycle_bridge.sql` | Abril | Bridge quiz-lifecycle (legado) |
| `20260507000000_lead_to_orcamento.sql` | 07/05/2026 | RPC original |
| `20260528000000_*_budgets_*` | Maio (Abril?) | budgets renomeado |
| `20260623000000_leads_bulk_change_phase.sql` | Junho? (legado) | `leads_bulk_change_phase` + `sdr_change_phase` |
| `20260700000725_voucher_dispatch_triggers.sql` | Julho | Triggers B2B |
| `20260700000754` | — | `perdidos` tabela criada |
| `20260700000755` | — | `budgets` → `orcamentos` rename |
| `20260700000756` | — | RPCs `lead_to_paciente` / `lead_to_orcamento` |
| `20260700000818` | 2026-04-24 | trigger `_appt_revert_lead_phase_on_remove` |
| `20260700000828` | 2026-04-24 | `_lead_phase_transition_allowed` matriz + guards |
| `20260800000059` | 2026-04-28 | Snapshot `legacy_2026_04_28` |
| `20260800000060-65` | 2026-04-28 | **Refactor canonical**: leads/patients/appointments/orcamentos/phase_history v2 + RPCs |
| `20260800000066` | 2026-04-28 | Reapontar FKs externas com NOT VALID |
| `20260800000103` | 2026-05-03 | "Alinhar CHECK com TS enums" · **CONTÉM BUG `lifecycle_status` fantasma** |
| `20260800000109` | 2026-05-04 | Lara paralelo canais (Mih/B2B/Lara) · `wa_conversations` updates |
| `20260800000147` | 2026-05-04 | `wa_conversations_operational_view` (secretaria KPIs) |

Lacuna: nenhuma mig pós-103 introduz `lifecycle_status` enum corretamente.

---

## 11 · Achados críticos

1. 🔴 **BUG mig 103 · `lifecycle_status` coluna fantasma.** CHECK aceita mas qualquer UPDATE explode com 42703. Probe SQL recomendado: `SELECT 1 FROM public.leads LIMIT 1` (provavelmente passa porque CHECK só roda em INSERT/UPDATE da coluna citada · mas se `chk_leads_lost_consistency` for re-validado, falha).
2. 🟡 **ADR-001 vs novo contrato.** Modelo excludente atual usa `deleted_at` quando lead vira paciente/orcamento. Novo contrato proíbe esse uso. Requer decisão arquitetural antes de Fase 1.
3. 🟢 **RPCs canônicas robustas.** 9 RPCs com matriz · idempotência · tenant guards. Boa base para evolução v2.
4. 🟡 **`legacy_2026_04_28` ainda vivo.** Não pode ser dropado até cleanup de rows referenciando.
5. 🟢 **`phase_history` audit imutável funciona.** Pronta pra extender com `from/to_lifecycle`.
6. 🟢 **Multi-tenant via JWT robusto.** ADR-028 está honrado.
