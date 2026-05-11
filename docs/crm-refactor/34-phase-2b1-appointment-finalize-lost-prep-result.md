# 34 · Fase 2B.1 · `appointment_finalize` lost outcome · PREP (sem apply)

> Preparação da migration 151 CIRÚRGICA. **NÃO APLICADA NO BANCO.** Apply
> controlado fica para Fase 2B.2 após revisão de SQL no chat.

---

## 1 · Resumo executivo

Fase 2A inicialmente reportou risco P0 múltiplo (lead_lost, lead_to_paciente,
lead_to_orcamento, appointment_attend supostamente quebrados). Re-auditoria
independente via `pg_get_functiondef` no banco real, query a query no Studio,
**revisou o diagnóstico**: o banco real diverge da mig 065 local (drift
histórico via Studio) e quase todas as RPCs já estão corretas. Único alvo
real é `appointment_finalize`, que não aceita `p_outcome='perdido'`.

Esta fase entrega:
1. Mig 151 cirúrgica (CREATE OR REPLACE FUNCTION única)
2. Down NO-OP defensivo
3. Rollback note
4. SQL de validação pós-apply (SELECT-only)
5. Este doc

**Sem apply. Sem SQL mutativo. Sem deploy. Sem alteração TS.**

---

## 2 · Diagnóstico corrigido (banco real, não mig 065)

| RPC | Status no banco real (via `pg_get_functiondef`) | Ação Fase 2B.1 |
|---|---|---|
| `lead_lost` | ✅ Correta · escreve `lifecycle_status='perdido'`, preenche `lost_from_phase`/`lost_reason`/`lost_at`/`lost_by`, preserva `phase`, espelha em `public.perdidos`. | **Não alterar** |
| `lead_to_paciente` | ✅ Correta · aceita agendado/orcamento/paciente, **não** soft-deleta lead, registra `phase_history`. | **Não alterar** |
| `lead_to_orcamento` | ✅ Correta · aceita agendado/paciente/orcamento, **não** soft-deleta lead, preserva phase='paciente' quando aplicável. | **Não alterar** |
| `appointment_attend` | ✅ Correta · **não** toca `leads.phase`/`deleted_at`, só seta `appointments.status='na_clinica'`. | **Não alterar** |
| `_lead_phase_transition_allowed` | Aceitável · bloqueia compareceu/reagendado/perdido como phase, permite 4-phase flow. Não permite `agendado→lead` (decisão operacional intencional). | **Não alterar** |
| `appointment_finalize` | ❌ **Drift único** · aceita apenas `paciente | orcamento | paciente_orcamento`, rejeita `'perdido'` com `invalid_outcome`. **Não chama** `lead_lost`. | **Alterar (mig 151)** |

### Paciente "contaminado" da Fase 2A

`lead_id = ce4a01ae-581e-434c-a291-4316617c8727` ("Alden Teste Manual",
5544998787673) tem:

```json
metadata = {
  "phase3_internal_cleanup": true,
  "phase3_cleanup_reason": "alden_mira_test_lead"
}
archived_reason = 'internal_wa_number_cleanup'
```

→ Teste interno arquivado intencionalmente. **Sem backfill.**

---

## 3 · Arquivos criados

| Arquivo | Finalidade | Status |
|---|---|---|
| [db/migrations/20260800000151_clinicai_v2_appointment_finalize_lost_outcome.sql](db/migrations/20260800000151_clinicai_v2_appointment_finalize_lost_outcome.sql) | Migration 151 forward · CREATE OR REPLACE FUNCTION única | ✅ |
| [db/migrations/20260800000151_clinicai_v2_appointment_finalize_lost_outcome.down.sql](db/migrations/20260800000151_clinicai_v2_appointment_finalize_lost_outcome.down.sql) | Down NO-OP defensivo (RAISE NOTICE) | ✅ |
| [docs/database/rollback-notes/20260800000151_clinicai_v2_appointment_finalize_lost_outcome.md](docs/database/rollback-notes/20260800000151_clinicai_v2_appointment_finalize_lost_outcome.md) | Rollback note completo | ✅ |
| [docs/crm-refactor/sql/phase-2b-appointment-finalize-lost-post-apply-validation.sql](docs/crm-refactor/sql/phase-2b-appointment-finalize-lost-post-apply-validation.sql) | 10 SELECTs de validação pós-apply | ✅ |
| docs/crm-refactor/34-phase-2b1-appointment-finalize-lost-prep-result.md | Este doc | ✅ |

---

## 4 · Escopo da migration 151 (REVISADO · 1:1 com banco real)

### Faz (alteração ADITIVA EXCLUSIVA)

- `CREATE OR REPLACE FUNCTION public.appointment_finalize(...)` com mesma assinatura atual
- **Adiciona `'perdido'` à lista de outcomes aceitos** (junto com paciente/orcamento/paciente_orcamento)
- **Adiciona validação `p_lost_reason`** obrigatório quando `outcome='perdido'`
- **Adiciona branch `'perdido'`** que chama `public.lead_lost(lead_id, reason)` **ANTES** do UPDATE de finalize · appointment só vira `'finalizado'` se `lead_lost` retornar `ok=true`
- **Adiciona guard** para `v_lead_id IS NULL + outcome='perdido'` → erro `lost_requires_lead`
- `NOTIFY pgrst, 'reload schema'`

### Preserva 1:1 (banco real é fonte da verdade)

Para outcomes existentes (`paciente`/`orcamento`/`paciente_orcamento`):

- Validações originais: `payment_status` (pendente/parcial/pago/isento), `orcamento_subtotal >= 0`, `orcamento_items jsonb array`, `orcamento_discount >= 0`
- Lock `FOR UPDATE` no appointment
- Status válido: `na_clinica`, `em_atendimento`
- `v_lead_id IS NULL` handling original:
  - `outcome='paciente'` → finaliza appt de paciente recorrente sem promoção (`note='patient_appointment_no_lead_promotion'`)
  - `outcome IN ('orcamento','paciente_orcamento')` → erro `cannot_create_budget_without_lead`
- **Ordem original mantida:** `UPDATE appointments SET status='finalizado'` **ANTES** das sub-RPCs · sub-RPC pode falhar mas appt já está finalizado (terminal · UI trata via `sub_call.ok` + `appointment_finalized=true`)
- Chamadas atuais para `lead_to_paciente` e `lead_to_orcamento`
- Regra `paciente_orcamento`: orçamento primeiro, paciente depois

### NÃO faz

- ❌ Não altera `lead_lost`
- ❌ Não altera `lead_to_paciente`
- ❌ Não altera `lead_to_orcamento`
- ❌ Não altera `appointment_attend`
- ❌ Não altera `_lead_phase_transition_allowed`
- ❌ Não altera tabelas (`leads`/`appointments`/`patients`/`orcamentos`/`phase_history`)
- ❌ Não faz `DROP`/`DELETE`/`TRUNCATE`/`ALTER TABLE`/`CREATE TYPE`
- ❌ Não faz backfill
- ❌ Não toca GRANT/REVOKE (CREATE OR REPLACE preserva grants existentes)

---

## 5 · Por que `lead_lost` não foi alterada

Banco real confirma:

```
lead_lost:
  - sets_lifecycle_perdido = true
  - sets_phase_perdido     = false   ← preserva phase canônica
  - sets_lost_from_phase   = true
  - sets_lost_reason       = true
```

Função já está alinhada com contrato Fase 1C (`lifecycle_status` ortogonal a
`phase`). A mig 065 local que dizia o contrário está **defasada** · banco
foi atualizado fora do path versionado.

---

## 6 · Por que `lead_to_paciente` / `lead_to_orcamento` não foram alteradas

Banco real confirma para ambas:

- Aceitam phases ativas (agendado/orcamento/paciente) sem exigir `phase='compareceu'`
- **NÃO** fazem `SET deleted_at = COALESCE(deleted_at, now())`
- Registram `phase_history`
- `lead_to_paciente` remapeia appointments/orcamentos pra `patient_id`
- `lead_to_orcamento` preserva `phase='paciente'` quando lead já é paciente

Conclusão: contrato single-table (ADR-001) já respeitado. Sem trabalho aqui.

---

## 7 · Por que NÃO houve backfill

Único lead com `deleted_at IS NOT NULL` + `phase='paciente'` é teste interno
arquivado intencionalmente (ver §2). Não há contaminação de produção real
que justifique UPDATE corretivo.

---

## 8 · Contrato novo de `appointment_finalize` para `'perdido'`

### Validações novas

```sql
IF p_outcome NOT IN ('paciente','orcamento','paciente_orcamento','perdido') THEN
  RETURN { ok:false, error:'invalid_outcome', hint:'...' };

IF p_outcome='perdido' AND (p_lost_reason IS NULL OR trim(p_lost_reason)='') THEN
  RETURN { ok:false, error:'lost_reason_required' };
```

### Fluxo do branch `'perdido'` (único branch novo · ordem inversa intencional)

1. Tenant guard via `app_clinic_id()` (validação compartilhada)
2. Validar outcome inclui `'perdido'`
3. Validar `p_lost_reason` não-vazio
4. Validar `p_payment_status` se passado
5. Lock `FOR UPDATE` no appointment
6. Status válido: `na_clinica` ou `em_atendimento`
7. Se `v_lead_id IS NULL` + outcome='perdido': retorna `error='lost_requires_lead'`
8. Chama `public.lead_lost(v_lead_id, p_lost_reason)` · captura retorno em `v_lost_call`
9. Se `(v_lost_call->>'ok')::boolean IS NOT TRUE`:
   - Retorna `{ ok:false, error:'lead_lost_failed', appointment_finalized:false, lost_call }`
   - **NÃO** finaliza appointment
10. Se ok=true:
    - `UPDATE appointments SET status='finalizado', value/payment_status/obs/updated_at`
    - Retorna `{ ok:true, appointment_finalized:true, lost_call }`

### Garantias respeitadas (branch perdido)

- ✅ Não escreve `leads.phase` (lead_lost cuida via lifecycle_status)
- ✅ Não escreve `leads.deleted_at`
- ✅ Não cria patient
- ✅ Não cria orçamento
- ✅ Não mexe `phase_history` (lead_lost cuida)
- ✅ Appointment só finaliza após `lead_lost.ok=true` (regra **específica** do branch perdido · paciente/orcamento/paciente_orcamento mantêm ordem original 1:1 com banco)

---

## 9 · Static safety scan

### Padrões PERIGOSOS

```
$ rg "DROP TABLE|DROP COLUMN|TRUNCATE|ALTER TYPE|CREATE TYPE|DROP TYPE|DELETE FROM|UPDATE public\.leads|UPDATE leads|INSERT INTO public\.leads|INSERT INTO leads"
```

| Arquivo | Hits |
|---|---|
| `20260800000151_*.sql` | **0** ✅ |
| `20260800000151_*.down.sql` | **0** ✅ |

### Ocorrências esperadas em 151.sql

```
$ rg "perdido|lead_lost|appointment_finalize|phase|deleted_at|UPDATE public\.appointments|status = 'finalizado'"
```

| Token | Onde aparece | Justificativa |
|---|---|---|
| `perdido` (literal) | Validação outcome, hints, branch CASE, error strings, comentários | **Esperado** · novo branch |
| `lead_lost` | Chamada à RPC + comentários | **Esperado** · alvo do branch perdido |
| `appointment_finalize` | `CREATE OR REPLACE FUNCTION` + comentários | **Esperado** · função sendo definida |
| `phase` | Apenas em **comentários** (descrições do que outras RPCs fazem) | **Esperado** · zero mutação de `leads.phase` |
| `deleted_at` | Apenas em `WHERE deleted_at IS NULL` no SELECT do appointment | **Esperado** · filtro de leitura |
| `UPDATE public.appointments` | 4 ocorrências (paciente_recorrente, perdido, paciente, orcamento, paciente_orcamento) | **Esperado** · única tabela tocada |
| `status = 'finalizado'` | Check idempotência + UPDATE de finalize | **Esperado** |

→ Conformidade total com escopo cirúrgico.

---

## 10 · Riscos (REVISADO · pós-correção de drift)

| Risco | Probabilidade | Mitigação |
|---|---|---|
| SQL desta mig (revisado) diverge da estrutura atual do banco em algum detalhe não capturado nas regras 1:1 | Baixa | **REVIEW OBRIGATÓRIO** pré-apply: rodar `SELECT pg_get_functiondef('public.appointment_finalize'::regproc)` e comparar branches paciente/orcamento/paciente_orcamento contra mig 151. Se houver drift residual, editar mig antes do apply. |
| `paciente_orcamento` parcial: orçamento ok + paciente fail (comportamento existente) | Baixa | Retorna `stage='paciente'` + `orcamento_call`/`paciente_call` no payload · UI trata caso a caso · idêntico ao banco hoje |
| Sub-RPC `lead_to_paciente`/`lead_to_orcamento` falhar com appt já finalizado (comportamento existente) | Baixa | UI já trata via `sub_call.ok` + `appointment_finalized=true` · status quo preservado |
| GRANT EXECUTE perdido | Muito baixa | `CREATE OR REPLACE FUNCTION` preserva grants (não é DROP+CREATE) |
| UI/TS quebrar pela mudança | Nenhuma | TS/UI já aceitam outcome=perdido desde Fase 1C · contrato TS↔DB agora alinha |

### Diff vs versão anterior desta mig (interno · Fase 2B.1 pré-revisão)

Versão anterior endurecia a ordem para TODOS os branches (sub-RPC antes do UPDATE). Revisão identificou drift funcional: o banco real para paciente/orcamento/paciente_orcamento faz `UPDATE → sub-RPC`. Versão atual:

- Mantém `UPDATE → sub-RPC` para paciente/orcamento/paciente_orcamento (1:1 banco real)
- Aplica `sub-RPC → UPDATE` **apenas** para o branch perdido (regra nova explícita)

---

## 11 · Como aplicar na Fase 2B.2 (NÃO executar agora)

```bash
# 1. Comparar SQL atual no banco vs SQL desta mig (READ-ONLY)
#    Cole no Studio:
SELECT pg_get_functiondef('public.appointment_finalize'::regproc);

# 2. Apply via Management API (após review do diff)
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000151_clinicai_v2_appointment_finalize_lost_outcome.sql

# 3. Repair tracker
mkdir -p supabase/migrations
: > supabase/migrations/20260800000151_repair_marker.sql
supabase migration repair --status applied 20260800000151
rm -rf supabase/migrations

# 4. Validação pós-apply (cole no Studio · 10 SELECTs)
#    docs/crm-refactor/sql/phase-2b-appointment-finalize-lost-post-apply-validation.sql

# 5. Smoke E2E manual
#    /crm/agenda/[id] · FinalizeWizard outcome=perdido + motivo
#    Esperado: leads.lifecycle_status='perdido', appointment.status='finalizado'
```

---

## 12 · Confirmações negativas (nada aplicado)

- ❌ Zero `supabase db push`
- ❌ Zero `supabase migration up`
- ❌ Zero `supabase migration repair`
- ❌ Zero Management API call
- ❌ Zero SQL mutativo executado em qualquer ambiente
- ❌ Zero deploy
- ❌ Zero alteração em código TS (typecheck não foi necessário)
- ❌ Zero alteração em `lead_lost` / `lead_to_paciente` / `lead_to_orcamento` / `appointment_attend` / `_lead_phase_transition_allowed`
- ❌ Zero backfill

---

## 13 · Histórico

- **2026-05-11:** Fase 2B.1 entrega 5 artefatos prontos para review · zero apply
- **Diagnóstico:** revisado com base no banco real (não mig 065)
- **Próximo:** review do SQL no chat (com pg_get_functiondef pré-apply) → Fase 2B.2 apply controlado → validation + smoke E2E
