# 13 · DB Probes · estado real v2

> 8 probes SQL READ-ONLY executadas em 2026-05-10 via Management API contra o banco real do CLINIIC AI v2 (project ref `oqboitkpcvuaudouwvkl`).
>
> Verdict: `CRM_DB_PROBES_READY`.

---

## 1 · Resumo executivo

**Achado central:** **o banco v2 JÁ ESTÁ no contrato-alvo da Fase 1**.

- `leads.phase` aceita apenas **4 valores** (`lead, agendado, paciente, orcamento`) — não 7
- `leads.lifecycle_status text NOT NULL DEFAULT 'ativo'` aceita **4 valores** (`ativo, perdido, recuperacao, arquivado`)
- `lost_from_phase` aceita apenas **4 valores**
- `archived_at`, `archived_reason` existem
- `is_in_recovery boolean` coexiste como legado (pode ser depreciado)
- `crm_operational_view` é REGULAR (não materialized) · projeta 17 colunas com `mesa_operacional`, `has_active_budget`, `is_no_show` derivados
- `_appointment_status_transition_allowed`, `_lead_phase_transition_allowed`, `appointment_change_status`, `lead_recovery_activate`, `leads_bulk_change_phase` — **todas existem**
- **Total: 120 leads** · 116 em `lead/ativo` · 1 `orcamento/ativo` · 1 `paciente/ativo` · 2 `arquivado` (soft-deleted)

**Gap real identificado:**

- **R-025 confirmado.** Zero migrations em `db/migrations/` criam `crm_operational_view`, `lifecycle_status` enum, `archived_at`/`archived_reason`, `mesa_operacional`. Foram aplicadas via Studio (ad-hoc). Migration retroativa para versionamento é Fase 1A.
- **R-010 reabre** com nova questão: TS code ainda usa 7 phases (`compareceu, reagendado, perdido`) mas DB SÓ aceita 4. Discrepância crítica · qualquer INSERT/UPDATE com esses valores quebra CHECK. **Investigar por que ainda não estourou em produção** (provável: RPCs refatoradas silenciosamente).
- RPCs **ausentes**: `lead_archive`, `lead_unarchive` (cobertura via `appointment_change_status` para appt cancel/no_show é OK).

---

## 2 · Estado local

```
?? docs/crm-refactor/
```

Branch `main` · HEAD `14169cb feat(mira): implicit voucher intent for partner messages`. Apenas a pasta `docs/crm-refactor/` (13 docs) untracked. **Nenhum código/migration/banco alterado.**

---

## 3 · Probe 1 · Definição de `crm_operational_view`

```sql
SELECT pg_get_viewdef('public.crm_operational_view'::regclass, true);
```

**Resultado (formatado):**

```sql
SELECT l.clinic_id,
       l.id AS lead_id,
       p.id AS patient_id,
       l.name,
       l.phone,
       l.email,
       l.phase AS lead_phase,
       l.lifecycle_status,
       l.lost_from_phase,
       a.id AS appointment_id,
       a.status AS appointment_status,
       a.scheduled_date,
       a.start_time,
       a.end_time,
       o.id AS budget_id,
       o.status AS budget_status,
       CASE
           WHEN l.lifecycle_status = 'perdido'    THEN 'perdido'
           WHEN l.lifecycle_status = 'arquivado'  THEN 'arquivado'
           WHEN p.id IS NOT NULL AND o.id IS NOT NULL THEN 'paciente_orcamento'
           WHEN p.id IS NOT NULL THEN 'paciente'
           WHEN o.id IS NOT NULL THEN 'orcamento'
           WHEN a.id IS NOT NULL AND a.deleted_at IS NULL THEN 'agendado'
           ELSE 'lead'
       END AS mesa_operacional,
       CASE WHEN a.status = 'no_show' THEN true ELSE false END AS is_no_show,
       CASE WHEN o.id IS NOT NULL THEN true ELSE false END AS has_active_budget
  FROM leads l
  LEFT JOIN patients p
         ON p.id = l.id
        AND p.clinic_id = l.clinic_id
        AND p.deleted_at IS NULL
  LEFT JOIN LATERAL (
       SELECT ... FROM appointments a1
        WHERE a1.clinic_id = l.clinic_id
          AND a1.lead_id   = l.id
          AND a1.deleted_at IS NULL
        ORDER BY a1.scheduled_date DESC, a1.start_time DESC
        LIMIT 1
  ) a ON true
  LEFT JOIN LATERAL (
       SELECT ... FROM orcamentos o1
        WHERE o1.clinic_id = l.clinic_id
          AND o1.deleted_at IS NULL
          AND (o1.status <> ALL (ARRAY['approved','lost']))
          AND (o1.lead_id = l.id OR (p.id IS NOT NULL AND o1.patient_id = p.id))
        ORDER BY o1.created_at DESC
        LIMIT 1
  ) o ON true
 WHERE l.deleted_at IS NULL;
```

**Observações:**

1. View consome `leads`, `patients`, `appointments`, `orcamentos`. NÃO consome `wa_conversations`, `phase_history`.
2. Filtro `l.deleted_at IS NULL` exclui leads soft-deleted (incluindo arquivados que foram deleted).
3. `mesa_operacional` é puramente derivada via CASE. Ordem importa: lifecycle terminal vence > paciente_orcamento > paciente > orcamento > agendado > lead.
4. `has_active_budget` é booleana baseada em existência de orçamento NÃO aprovado/perdido E NÃO soft-deleted.
5. JOIN `patients` por `p.id = l.id` (modelo excludente · UUID preservado).
6. Orcamento pode estar atrelado a `lead_id` OU `patient_id` (XOR · cobre ambos casos).
7. **Falta:** colunas do contrato-alvo §6 do doc 04 ausentes — `responsavel_atual_user_id`, `next_action_at`, `sla_state`, `last_inbound_at`, `unread_count`, `primary_conv_id`.

---

## 4 · Probe 2 · Tipo da view

```sql
SELECT relname, relkind, CASE relkind WHEN 'v' THEN 'regular_view' WHEN 'm' THEN 'materialized_view' ELSE relkind::text END AS object_type
FROM pg_class WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname='public') AND relname='crm_operational_view';
```

| relname | relkind | object_type |
|---|---|---|
| `crm_operational_view` | `v` | **regular_view** |

**Implicação:** todo SELECT recomputa joins · não há refresh, não há lag. Performance OK até ~10k leads, suspeitamos. **Decisão Q6 do doc 11 efetivamente resolvida** (já é regular).

---

## 5 · Probe 3 · Colunas de `public.leads` (críticas)

| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` |
| `clinic_id` | uuid | NO | `_default_clinic_id()` |
| `phase` | text | NO | `'lead'::text` |
| `lifecycle_status` | text | **NO** | **`'ativo'::text`** |
| `lost_from_phase` | text | YES | NULL |
| `lost_reason` | text | YES | NULL |
| `lost_at` | timestamptz | YES | NULL |
| `lost_by` | uuid | YES | NULL |
| `archived_at` | timestamptz | YES | NULL |
| `archived_reason` | text | YES | NULL |
| `is_in_recovery` | boolean | NO | `false` |
| `deleted_at` | timestamptz | YES | NULL |
| `updated_at` | timestamptz | NO | `now()` |

**Confirmações:**

- ✅ `lifecycle_status` existe · NOT NULL · default `'ativo'`
- ✅ `lost_from_phase` existe · nullable
- ✅ `archived_at` + `archived_reason` existem
- ⚠️ `is_in_recovery` coexiste com `lifecycle_status='recuperacao'` — **redundante** · Q9 doc 11 pode ser estendida para consolidação

---

## 6 · Probe 4 · Constraints de `public.leads`

| Constraint | Definição |
|---|---|
| `chk_leads_phase` | `CHECK phase IN ('lead','agendado','paciente','orcamento')` |
| `chk_leads_lifecycle_status` | `CHECK lifecycle_status IN ('ativo','perdido','recuperacao','arquivado')` |
| `chk_leads_lost_from_phase` | `CHECK lost_from_phase IS NULL OR lost_from_phase IN ('lead','agendado','paciente','orcamento')` |
| `chk_leads_lost_consistency` | `CHECK lifecycle_status<>'perdido' OR (lifecycle_status='perdido' AND lost_reason NOT NULL AND length(trim(lost_reason))>0 AND lost_from_phase NOT NULL AND lost_from_phase IN (...) AND lost_at NOT NULL)` |
| `chk_leads_funnel` | `CHECK funnel IN ('procedimentos','fullface','olheiras')` |
| `chk_leads_source` | `CHECK source IN (9 valores)` |
| `leads_clinic_id_fkey` | FK `clinic_id` REFERENCES `clinics(id)` ON DELETE CASCADE |
| `leads_pkey` | PRIMARY KEY (id) |

**Achados críticos:**

- ✅ `phase` aceita **APENAS 4 valores** (não 7 como TS sugere)
- ✅ `lifecycle_status` aceita **APENAS 4 valores** do contrato-alvo
- ✅ `chk_leads_lost_consistency` valida coerência via `lifecycle_status` corretamente · **não há BUG** (R-001 confirmado RESOLVED)
- ✅ `lost_from_phase` validado contra **4 valores** (não 6 do legacy)
- ❌ Não há CHECK que valide `archived_at` consistency (poderia exigir `archived_at IS NOT NULL` quando `lifecycle_status='arquivado'`)

**Discrepância TS↔DB:**

| Onde | Valores |
|---|---|
| DB `chk_leads_phase` | `{lead, agendado, paciente, orcamento}` (4) |
| `packages/repositories/src/types/enums.ts` `LeadPhase` | `{lead, agendado, reagendado, compareceu, paciente, orcamento, perdido}` (7) |
| `packages/repositories/src/helpers/phase-transitions.ts` matriz | 7 phases |
| `apps/lara/src/app/crm/_schemas/lead.schemas.ts` enum | 7 phases |
| `apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx` | mostra `reagendado` como filtro |

**Risco:** se qualquer caller tentar `INSERT/UPDATE leads SET phase IN ('compareceu','reagendado','perdido')`, o DB rejeita com CHECK violation. Por que ainda não estourou em produção?

**Hipótese:** todas as RPCs canônicas (`appointment_attend`, `appointment_finalize`, `lead_lost`) já foram refatoradas para nunca setar esses valores. Helpers `phase-transitions.ts` em TS mantêm matriz expandida por compat de filtros UI (que apenas LEEM, não escrevem). Precisa confirmação com leitura das RPCs.

---

## 7 · Probe 5 · RPCs CRM existentes

### EXISTEM no DB v2

| RPC | Argumentos | Returns |
|---|---|---|
| `_lead_phase_transition_allowed` | `p_from text, p_to text` | `boolean` (matriz lead) |
| `_appointment_status_transition_allowed` | `p_from text, p_to text` | `boolean` (matriz appt) |
| `_sdr_record_phase_change` | `p_lead_id uuid, p_to_phase text, p_triggered text, p_changed_by uuid` | `void` |
| `lead_create` | `p_phone text, p_name text, p_source text, p_source_type text, p_funnel text, p_email text, p_metadata jsonb, p_assigned_to uuid, p_temperature text` | `jsonb` |
| `lead_to_appointment` | `p_lead_id uuid, p_scheduled_date date, p_start_time time, p_end_time time, p_professional_id uuid, p_professional_name text, p_procedure_name text, p_consult_type text, p_eval_type text, p_value numeric, p_origem text, p_obs text` | `jsonb` |
| `appointment_attend` | `p_appointment_id uuid, p_chegada_em timestamptz` | `jsonb` |
| `appointment_finalize` | `p_appointment_id uuid, p_outcome text, p_value numeric, p_payment_status text, p_notes text, p_lost_reason text, p_orcamento_items jsonb, p_orcamento_subtotal numeric, p_orcamento_discount numeric` | `jsonb` |
| `appointment_change_status` | `p_appointment_id uuid, p_new_status text, p_reason text` | `jsonb` |
| `lead_to_paciente` | `p_lead_id uuid, p_total_revenue numeric, p_first_at timestamptz, p_last_at timestamptz, p_notes text` | `jsonb` |
| `lead_to_orcamento` | `p_lead_id uuid, p_subtotal numeric, p_items jsonb, p_discount numeric, p_notes text, p_title text, p_valid_until date` | `jsonb` |
| `lead_to_perdidos` | `p_lead_id uuid, p_lost_reason text, p_is_recoverable boolean, p_notes text` | `jsonb` (legado) |
| `lead_lost` | `p_lead_id uuid, p_reason text` | `jsonb` |
| `lead_recover` | `p_lead_id uuid, p_to_phase text, p_reason text` | `jsonb` (legado · genérico) |
| `lead_recovery_activate` | `p_lead_id uuid, p_reason text` | `jsonb` (alvo) |
| `perdido_to_lead` | `p_id uuid, p_to_phase text, p_reason text` | `jsonb` (legado) |
| `sdr_change_phase` | `p_lead_id uuid, p_to_phase text, p_reason text` | `jsonb` (roteador) |
| `leads_bulk_change_phase` | `p_ids text[], p_phase text` | `jsonb` |
| `b2b_refer_lead_safe` | `p_partnership_id uuid, p_clinic_id uuid, p_phone text, p_name text, p_email text, p_partner_slug text, p_metadata jsonb` | `jsonb` |
| `bulk_import_leads_with_destination` | `p_payload jsonb, p_default_destination text` | `jsonb` |
| `sdr_admin_reset_patient` | `p_lead_id uuid, p_to_phase text, p_reason text` | `jsonb` |

### Triggers ativos

| Trigger | Função |
|---|---|
| `_appt_revert_lead_phase_on_remove` | reverte phase ao apagar appt |
| `_audit_lead_soft_delete` | audit soft-delete |
| `_auto_move_lead_to_target_table` | ⚠️ função existe (legado · checar se ainda está ligada) |
| `_b2b_voucher_to_lead_bridge` | bridge B2B voucher → lead |
| `_b2b_trigger_lead_auto_attribution` | B2B attribution |
| `_b2b_trigger_lead_first_budget` | B2B first budget |
| `_b2b_sync_voucher_from_appointment` | sync voucher de appt |
| `fm_cascade_delete_lead` | cascade delete |
| `_vpi_*` | VPI triggers (4) |
| `_lp_leads_audit_trg` | LP audit |
| `_leads_extract_docs` | extrai cpf/rg do nome |
| `_trg_agenda_alert_on_lead_tag` | alerta agenda |
| `lp_leads_webhook_trg` | webhook LP |

### NÃO EXISTEM (do alvo)

| RPC | Comentário |
|---|---|
| ❌ `lead_archive(p_lead_id, p_reason)` | Gap real · necessária para Fase 2 |
| ❌ `lead_unarchive(p_lead_id)` | Gap real · necessária |
| ❌ `appointment_cancel(p_appt_id, p_reason)` | Substituído por `appointment_change_status(.., 'cancelado', reason)` · cobertura OK |
| ❌ `appointment_no_show(p_appt_id, p_reason)` | Idem · `appointment_change_status(.., 'no_show', reason)` cobre |

**Conclusão das RPCs:** das 17 do alvo, 15 existem. 2 faltam (archive/unarchive) e 2 são "cobertas por genérica".

---

## 8 · Probe 6 · Distribuição phase + lifecycle (dados reais)

```sql
SELECT phase, lifecycle_status, count(*) AS total,
       count(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted,
       count(*) FILTER (WHERE lost_from_phase IS NOT NULL) AS with_lost_from,
       count(*) FILTER (WHERE archived_at IS NOT NULL) AS with_archived,
       count(*) FILTER (WHERE is_in_recovery IS TRUE) AS with_recovery
FROM public.leads GROUP BY phase, lifecycle_status ORDER BY total DESC;
```

| phase | lifecycle | total | deleted | with_lost_from | with_archived | with_recovery |
|---|---|---|---|---|---|---|
| `lead` | `ativo` | **116** | 0 | 1 | 0 | 0 |
| `lead` | `arquivado` | 1 | 1 | 0 | 1 | 0 |
| `orcamento` | `ativo` | 1 | 0 | 1 | 0 | **1** |
| `paciente` | `ativo` | 1 | 0 | 0 | 0 | 0 |
| `paciente` | `arquivado` | 1 | 1 | 0 | 1 | 0 |
| **TOTAL** | | **120** | 2 | 2 | 2 | 1 |

**Achados:**

- **Zero rows com phase `compareceu`, `reagendado`, ou `perdido`** — confirmação dura de que o banco já usa 4 phases
- **Zero rows com lifecycle `perdido` ou `recuperacao`** — apesar de CHECK aceitar
- 1 lead com `is_in_recovery=true` mas `lifecycle_status='ativo'` — dualidade redundante (vide Q9)
- 1 lead com `lost_from_phase` setado mas `lifecycle_status='ativo'` — perdeu e voltou para `ativo`
- 2 arquivados (1 lead + 1 paciente) · ambos soft-deleted

**Volume baixo (120 leads)** facilita backfill se necessário, mas a verdade é que **não há backfill necessário em phase** — DB já está no contrato-alvo.

---

## 9 · Probe 7 · Distribuição da `crm_operational_view`

```sql
SELECT mesa_operacional, lifecycle_status, lead_phase, count(*) AS total,
       count(*) FILTER (WHERE has_active_budget IS TRUE) AS with_budget,
       count(*) FILTER (WHERE is_no_show IS TRUE) AS with_no_show
FROM public.crm_operational_view GROUP BY mesa_operacional, lifecycle_status, lead_phase ORDER BY total DESC;
```

| mesa | lifecycle | phase | total | with_budget | with_no_show |
|---|---|---|---|---|---|
| `lead` | `ativo` | `lead` | **116** | 0 | 0 |
| `orcamento` | `ativo` | `orcamento` | 1 | 1 | 0 |
| `paciente_orcamento` | `ativo` | `paciente` | 1 | 1 | 0 |

**Achados:**

- View retorna **118 rows** (não 120) · as 2 rows arquivadas (deleted_at) são FILTRADAS por design
- `paciente_orcamento` está sendo derivado corretamente (paciente com `has_active_budget=true`)
- Zero perdidos/arquivados visíveis na view → confirma que **leads arquivados não aparecem em mesas operacionais**
- **Gap UX:** se quiser tela "Arquivados", precisa de outra fonte ou expandir o filtro da view

---

## 10 · Probe 8 · Gap de migrations no repo

```bash
rg -l "crm_operational_view|mesa_operacional|has_active_budget" db supabase
rg -l "lifecycle_status|archived_at|archived_reason" db supabase
```

**Resultado:**

- ✅ Migrations versionadas em `db/migrations/` que mencionam `lifecycle_status`: APENAS 1 (`mig 20260800000103` · `chk_leads_lost_consistency`)
- ❌ ZERO migrations criam `crm_operational_view`, `mesa_operacional`, `has_active_budget`
- ❌ ZERO migrations criam coluna `lifecycle_status` (apenas referência no CHECK · não há ADD COLUMN)
- ❌ ZERO migrations criam `archived_at`, `archived_reason`

**Confirmação dura de R-025:**

A view + 3 colunas (`lifecycle_status`, `archived_at`, `archived_reason`) foram aplicadas **fora do path versionado** (Supabase Studio · ad-hoc). Reproducibilidade comprometida · dev/preview branches não têm essas estruturas.

**Ação:** retroaplicar migration `.sql` versionada · sugestão de nome:

```
db/migrations/20260800000150_clinicai_v2_crm_lifecycle_and_operational_view.sql
```

Conteúdo proposto (capturado dos probes):

```sql
-- A) Colunas que existem no banco mas não no repo
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'ativo';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS archived_reason text NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lost_from_phase text NULL;

-- B) CHECK constraints (vide probe 4)
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS chk_leads_phase,
  ADD CONSTRAINT chk_leads_phase CHECK (phase IN ('lead','agendado','paciente','orcamento'));

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS chk_leads_lifecycle_status,
  ADD CONSTRAINT chk_leads_lifecycle_status CHECK (lifecycle_status IN ('ativo','perdido','recuperacao','arquivado'));

-- ... (resto vai do probe 4 verbatim)

-- C) View canônica (probe 1 verbatim)
CREATE OR REPLACE VIEW public.crm_operational_view AS
  SELECT ... (já capturada · §3 deste doc);
```

---

## 11 · Impacto sobre Fase 1

A Fase 1 originalmente proposta no doc 10 era:

- ~Adicionar `lifecycle_status` enum + colunas + backfill~ → ❌ JÁ EXISTE
- ~Backfill leads em `phase` ∈ {`reagendado`, `compareceu`, `perdido`} para 4-phase~ → ❌ ZERO ROWS para migrar
- ~Drop `pre_consulta`/`em_consulta` do enum appointment.status~ → ⚠️ AINDA aplicar (probe não cobriu mas mig 103 ainda mantém)
- ~Fix mig 103 bug~ → ❌ NÃO HÁ BUG
- ✅ Decisão Q1 (modelo excludente) — único item REAL da Fase 1 que sobrou

**Fase 1 colapsa de "DB structural changes + backfill" para "decisão Q1 + retroapply migration versionada".**

Roadmap revisado:

| Fase | Original | Revisado |
|---|---|---|
| 1A | Add lifecycle_status + view + backfill | **Retroapply migration versionada** (R-025) · sem mudança DB · só `.sql` para reproducibilidade |
| 1B | Backfill phase | ❌ Não há trabalho · DB já está no contrato |
| 1C | Drop pre_consulta/em_consulta de appt.status | ⚠️ Confirmar enum atual via probe extra · backfill se houver rows |
| 1D | Decisão Q1 + execução | ✅ Mantém · é a peça crítica |
| 2 | Criar matriz appt + RPCs | ❌ Matriz já existe · ❌ change_status existe · apenas criar `lead_archive`/`lead_unarchive` (2 RPCs) |
| 3 | Criar crm_operational_view | ❌ Existe · apenas adicionar colunas faltantes (`responsavel_atual`, `next_action_at`, `sla_state`, `last_inbound_at`, `unread_count`, `primary_conv_id`) |
| 4 | Catálogo eventos | ✅ Mantém · construir |
| 5 | Frontend mesas + kanban | ✅ Mantém · construir |
| 6 | Drag-drop + actions via RPC | ✅ Mantém |
| 7 | Decommission legado | ✅ Mantém · cutover painel.miriandpaula.com.br |
| 8-11 | Validações + analytics + docs | ✅ Mantém |

**Refactor real é ~50% menor do que o doc 10 indicava.**

---

## 12 · Decisões ainda pendentes

| Q | Status | Notas |
|---|---|---|
| Q1 (modelo excludente vs single-table) | **PENDENTE — crítica** | Banco ainda usa modelo excludente (patients table com `p.id = l.id`). View funciona, mas decisão impacta `lead_to_paciente` RPC e fluxo de finalização. |
| Q2 (backfill compareceu/reagendado/perdido) | **RESOLVIDA** | Zero rows · sem backfill necessário |
| Q3 (paciente_orcamento tag vs view) | **RESOLVIDA** | View já deriva via `has_active_budget` |
| Q4 (perdidos table drop) | PENDENTE | Probe não cobriu `perdidos` table · checar se ainda recebe writes |
| Q5 (remarcado: novo appt ou status?) | PENDENTE | Probe não cobriu |
| Q6 (view regular vs materialized) | **RESOLVIDA** | É regular · OK por enquanto |
| Q7 (arquivado em paciente?) | **RESOLVIDA** | DB permite (lifecycle_status='arquivado' com phase='paciente' existe — 1 row · `paciente/arquivado`) |
| Q8 (RBAC RPCs) | PENDENTE | Probe não cobriu permissions |
| Q9 (temperature/priority via tags) | PENDENTE | Sem impacto na decisão Q1 · pode esperar |
| Q10 (cutover legacy) | PENDENTE | Estratégica · não bloqueia Fase 1A |
| Q11 (mig 103 bug) | **RESOLVIDA** | Não há bug |

**5 perguntas resolvidas pelos probes. 6 ainda pendentes (1 crítica + 5 estratégicas).**

---

## 13 · Recomendação final

**Próxima ação:**

1. **Fase 0.6 · Decisão Q1 (Alden)** · 30min de revisão. Modelo excludente vs single-table. Sem essa decisão, `lead_to_paciente` RPC fica indefinida.
2. **Probes adicionais READ-ONLY (se Alden quiser):**
   - Definição completa de `appointment.status` CHECK (drop pre_consulta/em_consulta?)
   - Definição da matriz `_appointment_status_transition_allowed`
   - Existência da tabela `perdidos` (ainda usada?)
   - Permissões EXECUTE nas RPCs (RBAC para Q8)
3. **Fase 1A · Retroapply migration versionada** (R-025) · não muda banco, só cria `.sql` no repo
4. **Fase 1D · Decisão Q1 executada** (refactor `lead_to_paciente` se decisão for single-table)

**NÃO É URGENTE:**
- Catálogo de eventos (Fase 4)
- Cutover legacy (Fase 7)
- Drop pre_consulta/em_consulta (cosmético)

**É URGENTE:**
- Decisão Q1 (bloqueia avanço)
- Retroapply da migration versionada (governança · 1h de trabalho)

---

## 14 · Riscos confirmados/atualizados

| ID | Status pós-probe |
|---|---|
| R-001 (lifecycle fantasma) | ✅ RESOLVED · CHECK funciona, coluna existe |
| R-002 (ADR-001 vs alvo) | ⚠️ P0 mantido · banco usa modelo excludente · decisão pendente Q1 |
| R-003 (clinic-dashboard mesmo DB) | ⚠️ P1 · não bloqueia · Fase 7 |
| R-004 (matriz appointment ausente) | ✅ RESOLVED · `_appointment_status_transition_allowed` EXISTE no DB |
| R-005 (leads kanban não portado) | ⚠️ P1 mantido · construir UI · Fase 5 |
| R-006 (view ausente) | ✅ RESOLVED · existe e funciona |
| R-007 (catálogo eventos ausente) | ⚠️ P1 mantido · Fase 4 |
| R-008 (localStorage stale) | ⚠️ P2 · clinic-dashboard escopo · Fase 7 |
| R-009 (mutations appt direto) | ⚠️ P1 mantido · `cancel/markNoShow` ainda direto · use `appointment_change_status` RPC em vez |
| R-010 (compareceu no fluxo) | 🔄 reaberto: TS↔DB discrepância · 7 phases em TS vs 4 em DB · investigar por que não estoura |
| R-024 (`setPhase` direto) | ⚠️ P1 mantido · troca para `sdr_change_phase` RPC |
| R-025 (migration ausente) | ✅ CONFIRMADO · retroapply em Fase 1A |
| R-026 (TS espelha SQL) | ✅ CONFIRMADO + AGRAVADO · TS tem MAIS phases que SQL (drift real) · sincronizar |

---

## 15 · Conclusão técnica

O CLINIIC AI v2 está **muito mais avançado** do que a auditoria original detectou. O contrato-alvo enterprise (4 phases + 4 lifecycle + view canônica + matriz appt + RPCs de recovery) **já está aplicado no banco**.

O **maior débito** é de **governança** (R-025 · migration não versionada) e **alinhamento código↔DB** (R-026 · TS tem 7 phases mas DB aceita 4).

A **única decisão arquitetural** que ainda bloqueia é Q1 (modelo excludente). Tudo o mais é execução incremental.
