# 03 · State Machine ATUAL (estado real encontrado)

> Estado em 2026-05-10 · baseado em audit das migrations 60-65, mig 103, mig 828 + grafo do clinicai-v2/clinic-dashboard.

---

## 1 · `public.leads.phase` — 7 valores aceitos hoje

Definido por `chk_leads_phase` (mig 60, atualizado pela mig 103):

```
lead | agendado | reagendado | compareceu | paciente | orcamento | perdido
```

**Origem:** mig 561 (legado), redefinido em mig 60 (2026-04-28), revisto em mig 103 (2026-05-03 · "alinhar CHECK com TS enums").

---

## 2 · `public.appointments.status` — 13 valores aceitos hoje

Definido por `chk_appt_status` (mig 62, atualizado pela mig 103):

```
agendado | aguardando_confirmacao | confirmado | pre_consulta |
aguardando | na_clinica | em_consulta | em_atendimento |
finalizado | remarcado | cancelado | no_show | bloqueado
```

**Nota:** `pre_consulta` e `em_consulta` existem além de `em_atendimento` — três "modos" sobrepostos para consulta em andamento. Provável débito do legado vanilla JS · candidato a consolidação no contrato-alvo.

---

## 3 · Matriz de transições atual (RPC `_lead_phase_transition_allowed` · mig 65)

| from \ to | `lead` | `agendado` | `reagendado` | `compareceu` | `paciente` | `orcamento` | `perdido` |
|---|---|---|---|---|---|---|---|
| `lead`       | ✓ (no-op) | ✓ | — | — | — | — | ✓ |
| `agendado`   | — | ✓ (no-op) | ✓ | ✓ | — | — | ✓ |
| `reagendado` | — | ✓ | ✓ (no-op) | ✓ | — | — | ✓ |
| `compareceu` | — | — | — | ✓ (no-op) | ✓ | ✓ | ✓ |
| `paciente`   | — | — | — | — | ✓ (no-op) | — | ✓ |
| `orcamento`  | — | ✓ | — | — | ✓ | ✓ (no-op) | ✓ |
| `perdido`    | ✓ | ✓ | ✓ | — | — | — | ✓ (no-op) |

**Origem:** mig 828 (clinic-dashboard, 2026-04-24) · re-aplicada verbatim na mig 65 (clinicai-v2, 2026-04-28).

**Regra Paciente → Agendado:** **não** vai por `sdr_change_phase` (matriz bloqueia). Implementada via criação de novo `appointment` + trigger `_appt_revert_lead_phase_on_remove`.

**Perdido → {lead, agendado, reagendado}:** rota de recuperação manual via `perdido_to_lead()` ou `sdr_change_phase()` com motivo.

---

## 4 · Modelo excludente (ADR-001) — STATE ATUAL

```
                  ┌───────────────┐
                  │     leads     │ ← entrada (lead/agendado/reagendado/compareceu/perdido)
                  └──────┬────────┘
            soft-delete  │  modal finalize
              + INSERT   │
        ┌────────────────┼─────────────────┐
        ▼                ▼                 ▼
  ┌──────────┐   ┌──────────────┐    ┌─────────────┐
  │ patients │   │  orcamentos  │    │  (perdido)  │
  │ (uuid=)  │   │  (uuid lead) │    │ continua em │
  └──────────┘   └──────────────┘    │    leads    │
                                     └─────────────┘
```

- `lead → paciente` ou `lead → orcamento`: `UPDATE leads SET deleted_at=now()` + INSERT em tabela alvo · UUID preservado.
- `lead → perdido`: **continua em `leads`** com `phase='perdido'` + `lost_reason` + `lost_at` + `lost_by`.

**CONFLITO com o contrato alvo:** o novo contrato proíbe `deleted_at` como mecanismo de movimentação. Esse é o débito #1 da refatoração v2.

---

## 5 · Tabelas auxiliares ATUAIS

| Tabela | Função atual | Status no novo contrato |
|---|---|---|
| `patients` | Recebe linhas após `lead_to_paciente` | Continua existindo. Mas alvo seria fundir em `leads` com `phase='paciente'`. **Decisão humana.** |
| `orcamentos` | Recebe linhas após `lead_to_orcamento` | Idem `patients`. |
| `perdidos` | Tabela CRIADA na mig 754 (Abril) · espelho/histórico de perdidos | Demoção definitiva para audit only · ou drop. |
| `phase_history` | Audit de transições | Mantém. Adicionar `from_lifecycle/to_lifecycle`. |
| `legacy_2026_04_28.*` | Snapshot pré-mig 60 (read-only) | Manter como backup. Cleanup em camada futura. |

---

## 6 · Colunas presentes em `leads` (auditadas)

- `id uuid` PK
- `clinic_id uuid` FK
- `phone text` (UNIQUE per clinic, normalizado)
- `name text`, `email text`, `cpf text`, `rg text`
- `phase text` (chk: 7 valores)
- `temperature text` (cold/warm/hot)
- `funnel text`
- `priority text`
- `source text`, `source_type text`
- `is_in_recovery boolean` ← já existe!
- `lost_reason text`, `lost_at timestamptz`, `lost_by uuid`
- `lost_from_phase text` (referenciado em mig 103 · existência confirmada implícita)
- `assigned_to text`
- `metadata jsonb`
- `phase_updated_at`, `phase_updated_by`, `phase_origin` (audit inline)
- `deleted_at timestamptz` (soft-delete)
- `created_at`, `updated_at`

**Colunas que o contrato-alvo exige adicionar:**
- ❌ `lifecycle_status` (enum: ativo/perdido/recuperacao/arquivado) — **NÃO EXISTE** (mig 103 a referencia mas com bug · CHECK chk_leads_lost_consistency menciona coluna inexistente)
- ❌ `archived_at timestamptz` (opcional · pode reutilizar `is_in_recovery` repurposado)
- ❌ `archive_reason text`

---

## 7 · RPCs CRM atuais (mig 65 · clinicai-v2)

| RPC | Status | Notas |
|---|---|---|
| `lead_create(...)` | ✅ Viva | Idempotente por (clinic_id, phone). Falha em soft-deleted lead (protege modelo excludente). |
| `lead_to_appointment(...)` | ✅ Viva | Cria appt + transita phase → agendado. |
| `appointment_attend(appt_id)` | ✅ Viva | status → `na_clinica` + lead.phase → `compareceu`. |
| `appointment_finalize(appt_id, outcome)` | ✅ Viva | outcome ∈ {paciente, orcamento, perdido}. **`perdido` PERMITIDO** (débito vs contrato alvo). |
| `lead_to_paciente(...)` | ✅ Viva | Soft-delete + INSERT em patients. Exige `phase=compareceu`. |
| `lead_to_orcamento(...)` | ✅ Viva | Soft-delete + INSERT em orcamentos. Exige `phase=compareceu`. |
| `lead_lost(lead_id, reason)` | ✅ Viva | `phase='perdido'` + audit. Idempotente. |
| `sdr_change_phase(lead_id, to_phase, reason)` | ✅ Viva | Roteador genérico · usa matriz. |
| `_lead_phase_transition_allowed(from, to)` | ✅ Viva (helper IMMUTABLE) | Matriz canônica. |

**RPCs do contrato-alvo que NÃO existem:**
- ❌ `lead_recovery_activate(lead_id, reason)`
- ❌ `lead_archive(lead_id, reason)`
- ❌ `lead_unarchive(lead_id)`
- ❌ `leads_bulk_change_phase(...)` (existe em legacy clinic-dashboard mig 623 · NÃO re-aplicada no v2)
- ❌ `appointment_change_status(...)` genérica (fragmentada em RPCs específicas)
- ❌ `appointment_cancel(appt_id, reason)` dedicada
- ❌ `_appointment_status_transition_allowed(from, to)` (não há matriz em RPC para appointments · apenas CHECK constraints)

---

## 8 · Triggers ATIVOS (CRM)

| Trigger | Tabela | Evento | Função | Migration |
|---|---|---|---|---|
| `leads_updated_at` | leads | BEFORE UPDATE | `set_updated_at()` | 60 |
| `leads_normalize_phone` | leads | BEFORE INSERT/UPDATE phone | `trg_normalize_phone()` | 60 |
| `appointments_updated_at` | appointments | BEFORE UPDATE | `set_updated_at()` | 62 |
| `appointments_normalize_phone` | appointments | BEFORE INSERT/UPDATE | `trg_normalize_patient_phone()` | 62 |
| `orcamentos_updated_at` | orcamentos | BEFORE UPDATE | `set_updated_at()` | 63 |
| `_appt_revert_lead_phase_on_remove` | appointments | AFTER DELETE/UPDATE(deleted_at) | reverte `phase` para `lead` se sem appt ativo | 818 (legado · provavelmente re-aplicado) |

**Triggers conhecidos do legado:**
- `trg_budget_created_phase` (legacy clinic-dashboard) — ainda existe? Verificar
- `fm_cascade_delete_lead` (legacy) — auditado e fixado em mig 828 contexto
- `_auto_move_lead_to_target_table` (legacy zumbi) — removido em mig 756 (per REFACTOR_LEAD_MODEL doc)

**Conclusão de triggers:** ZERO triggers reversos que reescrevam phase. **RPCs são única porta de entrada para mutações de phase.** Pattern correto.

---

## 9 · Views ATUAIS

| View | Tipo | Função | Status |
|---|---|---|---|
| `budgets` | VIEW compat | Redireciona para `orcamentos` (mig 755) | Mantém (legado) |
| `leads_list_full_fields` | VIEW operacional | Lista leads com queixas, fonte, etc | Em uso |
| `leads_list_*` (variantes) | VIEW operacional | Filtros pre-construídos | Em uso |
| `wa_conversations_operational_view` | VIEW | Mig 147 · 6 KPIs secretaria · agrupa por `operational_owner` | Em uso (Lara v2) |
| `crm_operational_view` | — | **NÃO EXISTE** | Gap para construir |
| `vw_leads_funnel_legacy` ou similares | — | Não detectado | OK |

---

## 10 · RLS ATUAL (resumido)

Padrão por tabela: 4 policies (SELECT, INSERT, UPDATE, DELETE) · todos via `clinic_id = app_clinic_id()`. INSERT com `WITH CHECK` (corrige bug legado). DELETE só admin. `phase_history` é INSERT+SELECT only (audit imutável).

Multi-tenant via JWT (ADR-028).

---

## 11 · Webhooks/automações que tocam phase

- `POST /api/webhook/whatsapp` (Cloud Meta): `processInboundMessage` → cria lead (`phase='lead'`) via RPC. **NÃO** muda phase de leads existentes.
- `POST /api/webhook/whatsapp-evolution` (Evolution): cria lead em conversation com `inbox_role='secretaria'`. **NÃO** muda phase.
- Cron `orcamento-followup`: lê orcamentos parados, envia mensagem WhatsApp. **NÃO** muda phase.
- Cron `wa-chat-sync` e `reactivate`: mexem em `wa_conversations.status`. **NÃO** mudam lead.phase.

✅ Pattern correto: automações **não** mudam phase fora de RPCs auditadas.

---

## 12 · DIFFs ATUAL vs ALVO (síntese)

| Aspecto | Estado atual | Estado alvo | Gap |
|---|---|---|---|
| `leads.phase` valores | 7 | 4 | Drop `reagendado/compareceu/perdido` (deprecado · migrar dados) |
| `lifecycle_status` enum | ❌ NÃO existe | ✅ ativo/perdido/recuperacao/arquivado | Criar coluna + migration de backfill |
| `lost_from_phase` | ✅ Existe (parcial) | ✅ Existe | OK |
| `is_in_recovery` boolean | ✅ Existe | Removido / consolidado em `lifecycle_status='recuperacao'` | Migrar |
| Modelo excludente | Soft-delete leads + INSERT em patients/orcamentos | Single-table com phase='paciente'/'orcamento' | **DECISÃO HUMANA** (ADR-001 inverte) |
| `perdidos` tabela | Espelho/histórico ativo | Demoção a audit-only ou drop | Decidir |
| `crm_operational_view` | ❌ NÃO existe | ✅ Read model canônico | Construir |
| RPCs de lifecycle | ❌ NÃO existem | `lead_recovery_activate`, `lead_archive`, `lead_unarchive` | Criar |
| Matriz `_appointment_status_transition_allowed` | ❌ Não há | ✅ Helper IMMUTABLE | Criar |
| `appointment_finalize(outcome='perdido')` | ✅ Permitido | ❌ Proibido (perda só via `lead_lost`) | Refactor RPC |
| Leads kanban portado | ❌ NÃO | ✅ SIM | Construir UI |

---

## 13 · Riscos imediatos do estado atual

1. **Mig 103 referencia coluna `lifecycle_status` fantasma.** CHECK `chk_leads_lost_consistency` tem `lifecycle_status <> 'perdido'` que apontará para coluna inexistente em runtime. Provavelmente o CHECK foi aceito (CREATE não testou) e qualquer UPDATE/INSERT explodirá com erro 42703.
2. **clinic-dashboard legacy ainda escreve no mesmo DB.** Mutations `.update()` direto em leads/appointments (sem RPC) podem violar a matriz canônica. Risk de race condition.
3. **`compareceu` ainda é phase obrigatória.** Modal de finalização exige `phase=compareceu` antes de chamar `lead_to_paciente` ou `lead_to_orcamento`. Se contrato alvo elimina esse phase, fluxo precisa de RPC alternativa.
4. **Drag-drop só na agenda.** Leads kanban no Next.js inexistente · usuários ainda usam clinic-dashboard legacy.

Ver `09-risk-register.md` para registro completo.
