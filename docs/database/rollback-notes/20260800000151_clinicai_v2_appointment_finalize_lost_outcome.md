# Rollback Note · Mig 151 · `appointment_finalize` aceita outcome='perdido'

**Migration:** `20260800000151_clinicai_v2_appointment_finalize_lost_outcome.sql`
**Tipo:** CIRÚRGICA · forward-only · CREATE OR REPLACE FUNCTION única
**Data alvo de apply:** TBD (Fase 2B.2 · controlado · review prévio do SQL)
**Project ref:** `oqboitkpcvuaudouwvkl`

---

## 1 · Objetivo

Eliminar o drift confirmado entre UI/TypeScript/Zod e a RPC `public.appointment_finalize`:

- **UI** (`apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx`) oferece outcome `paciente | orcamento | perdido` no FinalizeWizard.
- **TS/Zod** (`packages/repositories/src/types/enums.ts`, `apps/lara/src/app/crm/_schemas/appointment.schemas.ts`) permitem outcome=`'perdido'` end-to-end.
- **RPC `appointment_finalize`** (estado real do banco, confirmado via `pg_get_functiondef`) aceita apenas `paciente | orcamento | paciente_orcamento` · responde `'invalid_outcome'` para `'perdido'`.

A mig 151 adiciona o branch `'perdido'` na função, mantendo os demais branches inalterados.

---

## 2 · Bug corrigido

Cadeia de falha pré-mig 151:

1. Operador finaliza atendimento no Lara → escolhe "Perdido" + motivo → submit.
2. `finalizeAppointmentAction` valida com sucesso, repassa para a RPC.
3. RPC retorna `{ ok: false, error: 'invalid_outcome' }`.
4. Lead não é marcado como perdido. Appointment fica como `na_clinica`/`em_atendimento` sem finalizar.
5. Operador acha que perdeu o lead no fluxo · sem feedback claro.

Pós-mig 151:

1. Operador finaliza como "Perdido" + motivo → submit.
2. RPC chama `public.lead_lost(lead_id, reason)`.
3. `lead_lost` (já correta no banco) escreve `lifecycle_status='perdido'`, preenche `lost_from_phase`/`lost_reason`/`lost_at`/`lost_by`, espelha em `public.perdidos`, registra `phase_history`.
4. Se `lead_lost` retorna `ok=true`, RPC finaliza o appointment (`status='finalizado'` + valor + payment + obs).
5. Se `lead_lost` falhar, appointment **NÃO** é finalizado · RPC retorna `error='lead_lost_failed'` + payload `lost_call` pra UI tratar.

---

## 3 · Por que `lead_lost` não foi alterada

Verificação independente via `pg_get_functiondef('public.lead_lost'::regproc)`:

- Escreve `lifecycle_status='perdido'` (não `phase`).
- Preenche `lost_from_phase`, `lost_reason`, `lost_at`, `lost_by`.
- Preserva `phase` atual (4-phase válida).
- Atualiza `public.perdidos` (espelho/histórico).
- Idempotente.

A mig 065 local que documentava `lead_lost` está **defasada** · o banco real foi atualizado fora do path versionado (provavelmente via Studio). Banco é fonte da verdade. Não há motivo para mexer em `lead_lost`.

---

## 4 · Por que `lead_to_paciente` / `lead_to_orcamento` não foram alteradas

Mesma razão: verificação no banco real (não na mig 065) mostrou que ambas:

- Aceitam phases ativas (`agendado`/`orcamento`/`paciente`) sem exigir `phase='compareceu'`.
- **NÃO** soft-deletam o lead (`deleted_at` permanece NULL).
- Atualizam `phase` corretamente sob contrato 4-phase.
- Registram `phase_history`.
- Remapeiam `appointments`/`orcamentos` para `patient_id` quando promove paciente.

Conclusão: respeitam ADR-001 single-table. Mig 065 está defasada · banco já está alinhado com o contrato canônico.

---

## 5 · Por que `appointment_attend` e `_lead_phase_transition_allowed` não foram alteradas

- `appointment_attend` no banco real **não** escreve `leads.phase='compareceu'` (mig 065 desatualizada) · apenas seta `appointments.status='na_clinica'` + bloqueia cancelado/no_show/bloqueado. OK como está.
- `_lead_phase_transition_allowed` ainda referencia phases legacy (`compareceu`/`reagendado`/`perdido`) mas **bloqueia escrita** dessas phases · permite fluxo 4-phase canonical · não há `agendado→lead`. Decisão Alden: NÃO mexer · pode ser regra operacional intencional.

---

## 6 · Por que NÃO há backfill

A Fase 2A inicialmente identificou 1 paciente "contaminado" (`lead_id = ce4a01ae-581e-434c-a291-4316617c8727`, "Alden Teste Manual", phone 5544998787673).

Inspeção do `metadata` desse lead revelou:

```json
{
  "phase3_internal_cleanup": true,
  "phase3_cleanup_reason": "alden_mira_test_lead"
}
```

E `leads.archived_reason = 'internal_wa_number_cleanup'`.

→ É um teste interno arquivado intencionalmente, não vítima de bug. Backfill seria errado.

A Fase 2A.A (re-auditoria via probes uma-a-uma) confirmou que esse é o único lead com `deleted_at IS NOT NULL` + phase='paciente' na base · não há contaminação de produção a corrigir.

---

## 7 · Como aplicar pós-revisão (Fase 2B.2 · NÃO executar agora)

Comparação pré-apply (READ-ONLY):

```sql
-- Confirmar SQL atual antes do CREATE OR REPLACE
SELECT pg_get_functiondef('public.appointment_finalize'::regproc);
```

Apply (via Management API ou Studio · escolha do operador):

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
  db/migrations/20260800000151_clinicai_v2_appointment_finalize_lost_outcome.sql
```

Repair tracker:

```bash
mkdir -p supabase/migrations
: > supabase/migrations/20260800000151_repair_marker.sql
supabase migration repair --status applied 20260800000151
rm -rf supabase/migrations
```

Validação pós-apply: rodar
`docs/crm-refactor/sql/phase-2b-appointment-finalize-lost-post-apply-validation.sql`
(SELECTs apenas).

Smoke manual end-to-end:

1. Criar lead → agendar consulta → `appointment_attend` → `FinalizeWizard` outcome=perdido + motivo.
2. Conferir `leads.lifecycle_status='perdido'`, `lost_reason` preenchido, `appointment.status='finalizado'`.
3. Conferir `crm_operational_view` mostra `mesa_operacional='perdido'` para esse lead.

---

## 8 · Down · NO-OP defensivo

`20260800000151_*.down.sql` é apenas `RAISE NOTICE`. Rollback real exige
**forward migration nova** (`mig 152`) com `CREATE OR REPLACE FUNCTION` para
restaurar a versão desejada · NÃO há revert automático porque:

- A versão antiga rejeita `outcome='perdido'` (bug que esta mig fixa).
- A versão antiga não está versionada localmente (mig 065 está defasada · não bate com prod).
- Restaurar mig 065 quebraria `paciente_orcamento`.

---

## 9 · Riscos do apply

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Mig 151 introduz drift em paciente/orcamento branches | Baixa | Branches paciente/orcamento mantêm assinatura+chamadas idênticas · revisar pré-apply com `pg_get_functiondef` |
| Sub-call ordering diferente do legacy (sub-RPC antes do UPDATE) | Média | Por design · contrato novo: appointment só finaliza se sub-RPC OK · evita estado órfão · UI já trata `appointment_finalized=false` |
| `paciente_orcamento` stage atômico parcial (orçamento ok + paciente fail) | Baixa | Erro retorna `stage='paciente'` + `orcamento_call`/`paciente_call` para UI tratar |
| RPC `lead_lost` mudou desde a última inspeção | Muito baixa | Validação pós-apply chama lead_lost via smoke · `lifecycle_status='perdido'` confirma |
| GRANT EXECUTE perdido após CREATE OR REPLACE | Baixa | `CREATE OR REPLACE FUNCTION` preserva grants existentes (não é DROP+CREATE) |

---

## 10 · Confirmações negativas (estado da prep)

- ❌ Zero apply no banco
- ❌ Zero SQL mutativo executado
- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero Management API call
- ❌ Zero deploy
- ❌ Zero alteração em `lead_lost` / `lead_to_paciente` / `lead_to_orcamento` / `appointment_attend` / `_lead_phase_transition_allowed`
- ❌ Zero backfill
- ❌ Zero alteração em código TS (typecheck não precisou rodar)

---

## 11 · Histórico

- **2026-05-11:** Mig 151 PREPARADA via Fase 2B.1 (sem apply)
- **Diagnóstico revisado:** banco real (`pg_get_functiondef`) revelou que apenas `appointment_finalize` tinha drift · demais RPCs já corretas
- **Próximo:** Fase 2B.2 · review de SQL no chat → apply controlado → repair → smoke E2E
