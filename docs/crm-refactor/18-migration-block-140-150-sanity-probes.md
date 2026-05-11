# 18 · Migration Block 140-150 · Sanity Probes

> Auditoria READ-ONLY do bloco 140-150 contra o banco real. Estado 2026-05-10 · project-ref `oqboitkpcvuaudouwvkl` · branch `main` · HEAD `4f28fe9`.

---

## 1 · Resumo executivo

**Resultado:** **11 de 11 migrations** do bloco 140-150 têm seus objetos/efeitos **materializados em prod**. Repair em lote é seguro.

| Métrica | Valor |
|---|---|
| Migrations no bloco | 11 (140-150) |
| MATERIALIZED_CONFIRMED | **11** |
| PARTIAL_CONFIRMATION | 0 |
| NOT_FOUND | 0 |
| NEEDS_MANUAL_REVIEW | 0 |

**Recomendação:** Repair completo do bloco via `supabase migration repair --status applied 20260800000140 ... 20260800000150`. **NÃO EXECUTADO nesta fase.**

---

## 2 · Estado local

```
Branch: main
HEAD: 4f28fe9d279b7914e74e066a87f370a4915f8953
origin/main: 4f28fe9d279b7914e74e066a87f370a4915f8953   (== HEAD)
working tree: limpo (apenas docs/crm-refactor/17 untracked)
```

---

## 3 · Lista das migrations 140-150

| Mig | Arquivo | Tema |
|---|---|---|
| 140 | `20260800000140_clinicai_v2_b2b_comm_dispatch_payload_voucher_id.sql` | Adiciona `voucher_id` ao payload do `_b2b_invoke_edge('b2b-comm-dispatch', ...)` |
| 141 | `20260800000141_clinicai_v2_b2b_invoke_edge_authorization_header.sql` | Helper `_b2b_invoke_edge` passa `Authorization: Bearer <service_role>` (fix 401 gateway) |
| 142 | `20260800000142_clinicai_v2_b2b_comm_dispatch_delivery_policy.sql` | Adiciona conceito `dispatch_kind` + `delivery_policy` (transacional vs queue) |
| 143 | `20260800000143_clinicai_v2_wa_messages_reply_to_provider_msg_id.sql` | ADD COLUMN `wa_messages.reply_to_provider_msg_id text` (quoted reply vínculo) |
| 144 | `20260800000144_clinicai_v2_wa_messages_payload_jsonb.sql` | ADD COLUMN `wa_messages.payload jsonb` (camada WhatsApp Web operacional) |
| 145 | `20260800000145_clinicai_v2_secretaria_default_label.sql` | Rename visual "Luciana" → "Secretaria" como bucket default |
| 146 | `20260800000146_clinicai_v2_secretaria_alden_operational_owner.sql` | Adiciona Alden (profile_id `06757b9f...`) como dono operacional separado |
| 147 | `20260800000147_clinicai_v2_secretaria_owner_normalization_fix.sql` | Default bucket = `secretaria` · Luciana só com assigned_to real |
| 148 | `20260800000148_clinicai_v2_wa_assignment_events_view.sql` | CREATE VIEW `wa_conversation_assignment_events_view` (audit de transbordos) |
| 149 | `20260800000149_clinicai_v2_wa_assignment_events_view_grants.sql` | GRANT SELECT na view 148 para `authenticated` e `service_role` |
| 150 | `20260800000150_clinicai_v2_crm_lifecycle_and_operational_view_retroapply.sql` | Retroapply: lifecycle_status + crm_operational_view (Fase 1A) |

---

## 4 · Static summary por migration

Características de cada mig (resumo da varredura `rg`):

| Mig | Tipo | Idempotente | DDL | DML | Notas |
|---|---|---|---|---|---|
| 140 | `CREATE OR REPLACE FUNCTION` × 2 | ✅ | 0 ALTER | 8 UPDATE | reescreve trigger functions |
| 141 | `CREATE OR REPLACE FUNCTION` × 1 + GRANT | ✅ | 0 ALTER | 1 INSERT | helper edge invocation |
| 142 | `CREATE OR REPLACE FUNCTION` × 4 + GRANT | ✅ | 0 ALTER | múltiplos UPDATE | reescreve 4 trigger functions |
| 143 | `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` | ✅ | 1 ALTER | 0 | aditiva, sem risco |
| 144 | `ADD COLUMN IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` | ✅ | 1 ALTER | 0 | aditiva, sem risco |
| 145 | `CREATE OR REPLACE VIEW` | ✅ | 0 | 0 | rename visual via CASE |
| 146 | `CREATE OR REPLACE VIEW` + COMMENT | ✅ | 0 | 0 | adiciona Alden bucket |
| 147 | `CREATE OR REPLACE VIEW` + `UPDATE wa_conversations` (soft-delete 4 debug rows) | ⚠️ | 0 | 1 UPDATE pontual | soft-delete one-time · seguro em rerun (idempotente · WHERE filtra os mesmos IDs) |
| 148 | `CREATE OR REPLACE VIEW` | ✅ | 0 | 0 | view audit nova |
| 149 | `REVOKE ALL` + `GRANT SELECT` | ✅ | 0 | 0 | grants (no-op em rerun) |
| 150 | `ADD COLUMN IF NOT EXISTS` × 4 + `DROP+ADD CONSTRAINT` × 4 + `CREATE OR REPLACE VIEW` + COMMENTs | ✅ | 4 ALTER | 0 | retroapply documentado |

**Conclusão:** todas usam padrões idempotentes. Apenas mig 147 tem 1 UPDATE pontual de soft-delete, mas é seguro em rerun (filtra IDs específicos · sem efeito se rows já estiverem soft-deletadas).

---

## 5 · Probes read-only executados

### A · Views relevantes existem

```sql
SELECT relname, relkind FROM pg_class WHERE relname IN
  ('crm_operational_view','wa_conversations_operational_view','wa_conversation_assignment_events_view')
```

| relname | relkind | object_type |
|---|---|---|
| `crm_operational_view` | `v` | view |
| `wa_conversation_assignment_events_view` | `v` | view |
| `wa_conversations_operational_view` | `v` | view |

✅ **3/3 views confirmadas.**

### B · RPCs / functions relevantes

```sql
SELECT proname, args, returns FROM pg_proc WHERE proname IN (...)
```

| proname | args | returns |
|---|---|---|
| `_appointment_status_transition_allowed` | `p_from text, p_to text` | boolean |
| `_b2b_dispatch_application_received` | `()` | trigger |
| `_b2b_invoke_edge` | `p_path text, p_body jsonb` | jsonb |
| `_b2b_sync_voucher_from_appointment` | `()` | trigger |
| `_b2b_voucher_dispatch_on_status_change` | `()` | trigger |
| `_lead_phase_transition_allowed` | `p_from text, p_to text` | boolean |
| `appointment_change_status` | `p_appointment_id uuid, p_new_status text, p_reason text` | jsonb |
| `lead_recovery_activate` | `p_lead_id uuid, p_reason text` | jsonb |
| `leads_bulk_change_phase` | `p_ids text[], p_phase text` | jsonb |

✅ **9/9 functions/RPCs confirmadas.**

### C · Colunas críticas materializadas

| table | column | data_type | nullable | default |
|---|---|---|---|---|
| `appointments` | `motivo_cancelamento` | text | YES | NULL |
| `appointments` | `motivo_no_show` | text | YES | NULL |
| `appointments` | `status` | text | NO | `'agendado'::text` |
| `leads` | `archived_at` | timestamptz | YES | NULL |
| `leads` | `archived_reason` | text | YES | NULL |
| `leads` | `lifecycle_status` | text | **NO** | `'ativo'::text` |
| `leads` | `lost_from_phase` | text | YES | NULL |
| `leads` | `phase` | text | NO | `'lead'::text` |
| `wa_messages` | `payload` | **jsonb** | YES | NULL |
| `wa_messages` | `reply_to_provider_msg_id` | text | YES | NULL |

✅ **Mig 143 e 144 confirmadas** (colunas em `wa_messages`)
✅ **Mig 150 confirmada** (4 colunas em `leads`)

### D · Constraints relevantes

| table | conname | definition |
|---|---|---|
| `appointments` | `chk_appt_status` | CHECK status IN **11 valores** (sem `pre_consulta`/`em_consulta`) |
| `leads` | `chk_leads_phase` | CHECK phase IN (`lead`, `agendado`, `paciente`, `orcamento`) |
| `leads` | `chk_leads_lifecycle_status` | CHECK lifecycle IN (`ativo`, `perdido`, `recuperacao`, `arquivado`) |
| `leads` | `chk_leads_lost_from_phase` | CHECK NULL ou IN (`lead`, `agendado`, `paciente`, `orcamento`) |
| `leads` | `chk_leads_lost_consistency` | CHECK coerência via `lifecycle_status='perdido'` |

✅ Contrato v2 ENDURECIDO no banco. Mig 150 idempotente.

### E · `wa_conversation_assignment_events_view` definition

View existe e tem 21 colunas (`audit_id`, `audit_at`, `operation`, `conversation_id`, `clinic_id`, `actor_user_id`, `actor_role`, `audit_reason`, `changed_fields`, `assignment_action`, `from_owner`, `from_assigned_to`, `from_assigned_to_name`, `to_owner`, `to_assigned_to`, `to_assigned_to_name`, `old_assigned_at`, `new_assigned_at`, `phone`, `display_name`, `status`).

Note: doc original do prompt mencionou `event_type`, mas coluna real é `assignment_action`. View materializada com schema próprio.

### F · Distribuição de eventos de assignment (mig 148)

```
| assignment_action  | from_owner  | to_owner    | total |
| assigned           | secretaria  | mirian      | 13    |
| returned           | mirian      | secretaria  | 8     |
| returned           | alden       | secretaria  | 3     |
| assigned           | secretaria  | alden       | 2     |
| reassigned         | mirian      | alden       | 1     |
| profile_changed    | luciana     | luciana     | 1     |
| reassigned         | mirian      | luciana     | 1     |
```

✅ **29 eventos de transbordo** registrados · view operacional e funcional.

### G · GRANTs na view (mig 149)

| grantee | privilege_type |
|---|---|
| `authenticated` | SELECT ✅ |
| `service_role` | SELECT ✅ |
| `postgres` | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE (owner) |

✅ **Anon e PUBLIC corretamente sem GRANT** (REVOKE aplicado · mig 149).

### H · `wa_conversations_operational_view` por `operational_owner` (migs 145-147)

| operational_owner | count |
|---|---|
| `secretaria` | 104 |
| `mirian` | 3 |
| `luciana` | 1 |

✅ **Bucket default = `secretaria`** (mig 147 confirmada). Luciana ainda tem 1 conv real assigned.

### I · `leads` por phase × lifecycle (mig 150)

| phase | lifecycle_status | total |
|---|---|---|
| `lead` | `ativo` | 116 |
| `lead` | `arquivado` | 1 |
| `orcamento` | `ativo` | 1 |
| `paciente` | `ativo` | 1 |
| `paciente` | `arquivado` | 1 |

✅ **120 leads · zero rows em phases legadas** (`compareceu/reagendado/perdido` não existem).

### J · `crm_operational_view` mesa_operacional (mig 150)

| mesa_operacional | lifecycle_status | lead_phase | count |
|---|---|---|---|
| `lead` | `ativo` | `lead` | 116 |
| `orcamento` | `ativo` | `orcamento` | 1 |
| `paciente_orcamento` | `ativo` | `paciente` | 1 |

✅ View canônica funcional · 118 rows · `paciente_orcamento` derivado corretamente.

### K · `_b2b_invoke_edge` body contains Authorization + delivery_policy (migs 141+142)

```
Authorization     : 2 hits
delivery_policy   : 10 hits
dispatch_kind     : 10 hits
```

✅ **Migs 141 e 142 confirmadas via body do `_b2b_invoke_edge`.**

### L · `_b2b_voucher_dispatch_on_status_change` body contains voucher_id (mig 140)

```
voucher_id     : 1 hit
dispatch_kind  : 1 hit
status_change  : 1 hit
```

✅ **Mig 140 confirmada via body do trigger function.**

### M · `wa_conversations_operational_view` contém Alden (mig 146)

```
06757b9f     : 5 hits  (UUID Alden hardcoded)
alden        : 1 hit
secretaria   : 6 hits
mirian       : 4 hits
luciana      : 5 hits
```

✅ **Mig 146 confirmada · profile_id Alden presente na view.**

---

## 6 · Resultado por objeto (consolidado)

| Objeto | Tipo | Status | Probe |
|---|---|---|---|
| `crm_operational_view` | VIEW | ✅ existe + funcional | A, J |
| `wa_conversations_operational_view` | VIEW | ✅ existe + funcional (com Alden) | A, H, M |
| `wa_conversation_assignment_events_view` | VIEW | ✅ existe + dados | A, E, F |
| `_b2b_invoke_edge(text, jsonb)` | FUNCTION | ✅ existe com Authorization+delivery_policy | B, K |
| `_b2b_voucher_dispatch_on_status_change()` | TRIGGER FN | ✅ existe com voucher_id | B, L |
| `_b2b_sync_voucher_from_appointment()` | TRIGGER FN | ✅ existe | B |
| `_b2b_dispatch_application_received()` | TRIGGER FN | ✅ existe | B |
| `_appointment_status_transition_allowed(text,text)` | FUNCTION | ✅ existe | B |
| `_lead_phase_transition_allowed(text,text)` | FUNCTION | ✅ existe | B |
| `appointment_change_status(uuid,text,text)` | RPC | ✅ existe | B |
| `lead_recovery_activate(uuid,text)` | RPC | ✅ existe | B |
| `leads_bulk_change_phase(text[],text)` | RPC | ✅ existe | B |
| `wa_messages.reply_to_provider_msg_id` | COLUMN | ✅ existe (text NULL) | C |
| `wa_messages.payload` | COLUMN | ✅ existe (jsonb NULL) | C |
| `leads.lifecycle_status` | COLUMN | ✅ existe (text NOT NULL default 'ativo') | C, I |
| `leads.lost_from_phase` | COLUMN | ✅ existe (text NULL) | C |
| `leads.archived_at` | COLUMN | ✅ existe (timestamptz NULL) | C |
| `leads.archived_reason` | COLUMN | ✅ existe (text NULL) | C |
| `chk_leads_phase` | CONSTRAINT | ✅ 4 valores | D, I |
| `chk_leads_lifecycle_status` | CONSTRAINT | ✅ 4 valores | D |
| `chk_leads_lost_from_phase` | CONSTRAINT | ✅ 4 valores | D |
| `chk_leads_lost_consistency` | CONSTRAINT | ✅ via lifecycle_status | D |
| `chk_appt_status` | CONSTRAINT | ✅ 11 valores (sem pre_consulta/em_consulta) | D |
| GRANTs `wa_conversation_assignment_events_view` | PRIVILEGE | ✅ authenticated + service_role only | G |

---

## 7 · Resultado por migration

| Mig | Status | Evidência | Recomendação |
|---|---|---|---|
| **140** | **MATERIALIZED_CONFIRMED** | `_b2b_voucher_dispatch_on_status_change` contém `voucher_id` (probe L) | repair |
| **141** | **MATERIALIZED_CONFIRMED** | `_b2b_invoke_edge` body tem `Authorization` (probe K) | repair |
| **142** | **MATERIALIZED_CONFIRMED** | `_b2b_invoke_edge` body tem `delivery_policy`+`dispatch_kind` (probe K) · `_b2b_dispatch_application_received` existe (probe B) | repair |
| **143** | **MATERIALIZED_CONFIRMED** | `wa_messages.reply_to_provider_msg_id` existe (probe C) | repair |
| **144** | **MATERIALIZED_CONFIRMED** | `wa_messages.payload` existe (probe C) | repair |
| **145** | **MATERIALIZED_CONFIRMED** | `wa_conversations_operational_view` retorna `secretaria` como bucket dominante (probe H · 104 rows) | repair |
| **146** | **MATERIALIZED_CONFIRMED** | View contém UUID Alden `06757b9f` (probe M · 5 hits) | repair |
| **147** | **MATERIALIZED_CONFIRMED** | Default = `secretaria` (probe H) · Luciana só com 1 row real | repair |
| **148** | **MATERIALIZED_CONFIRMED** | View `wa_conversation_assignment_events_view` existe e retorna 29 eventos (probes E, F) | repair |
| **149** | **MATERIALIZED_CONFIRMED** | GRANTs corretos: `authenticated` e `service_role` SELECT only · anon revoked (probe G) | repair |
| **150** | **MATERIALIZED_CONFIRMED** | 4 colunas + 4 CHECKs + view ativos (probes C, D, I, J) | repair |

---

## 8 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Mig 150 nunca foi rodada via `db push` mas o estado já existe | Certeza | Repair seguro · `--status applied` não executa SQL |
| Mig 147 contém UPDATE pontual de soft-delete · rerodar não tem efeito | Baixa | UPDATE filtra IDs específicos · idempotente |
| Drift entre body real do banco e arquivo `.sql` (alguém editou via Studio depois) | Muito baixa | Probes confirmam objetos · não comparam body literal completo |
| `migration repair` afeta produção | Sim, por design | Apenas registra no tracker · não roda DDL/DML |
| Repair em lote falha parcialmente | Baixa | CLI processa por versão · falha individual não derruba lote |

---

## 9 · Estratégia recomendada

**A · Repair completo do bloco 140-150 em lote.**

Justificativa:
- 11/11 materializadas (zero gap, zero PARTIAL)
- Todas usam padrões idempotentes (DDL com IF NOT EXISTS, CREATE OR REPLACE)
- Probes cobrem objetos visíveis e bodies de funções
- 1 chamada CLI · ~30s · low risk

**Após sucesso, próximos blocos:**
- Bloco 120-139 (20 migs)
- Bloco 100-119 (20 migs · cuidado com mig 110 + 127)
- Bloco 077-099 (23 migs)
- Bloco 001-012 (12 migs · seeds Mira/B2B antigos)

Cada bloco vai precisar de probes próprios antes do repair.

---

## 10 · Comando de repair sugerido (NÃO EXECUTADO)

```bash
# NÃO EXECUTAR sem autorização explícita do Alden
supabase migration repair --status applied \
  20260800000140 \
  20260800000141 \
  20260800000142 \
  20260800000143 \
  20260800000144 \
  20260800000145 \
  20260800000146 \
  20260800000147 \
  20260800000148 \
  20260800000149 \
  20260800000150
```

**Pré-requisitos:**
- ✅ Acesso `SUPABASE_ACCESS_TOKEN` configurado (já existe em `clinic-dashboard/.env`)
- ✅ Project-ref `oqboitkpcvuaudouwvkl` (já confirmado · doc 13)
- ⚠️ Confirmação explícita do Alden antes de rodar

**Validação pós-repair:**
```bash
supabase migration list | grep -E "20260800000(14[0-9]|150)"
# Esperado: 11 rows com Local + Remote columns preenchidos
```

---

## 11 · Próximo passo

**Fase 1A.5 · Repair do Bloco 140-150 (se Alden autorizar).**

Sequência:
1. Alden autoriza
2. Rodar `supabase migration repair --status applied 20260800000140 ... 20260800000150`
3. Validar tracker com `supabase migration list`
4. Atualizar doc 18 com resultado do repair
5. Iniciar Fase 1A.6 · Sanity probes do Bloco 120-139

**Se NÃO autorizar:** parar e aguardar decisão. Próximas auditorias podem rodar em paralelo · não há urgência operacional.
