# 33 · Fase 2A · Single-Table Conversion Audit · CLOSURE (P0)

> Auditoria READ-ONLY das RPCs de conversão (`lead_to_paciente`,
> `lead_to_orcamento`, `lead_lost`) contra o contrato ADR-001 single-table.
> Executado 2026-05-11 com autorização explícita do Alden (Fase 2A).
> Grafo + migs autoritativas + 7 probes SQL READ-ONLY no banco real.
>
> **Verdict: `CRM_PHASE_2A_SINGLE_TABLE_AUDIT_READY_P0`** ⚠️
>
> **Achado P0:** A cadeia legacy de conversão VIOLA o contrato single-table
> e já contaminou **1 paciente real em produção** (1/2 pacientes = 50% da base).
> Além disso, o descompasso entre CHECK constraint da mig 150 (4 phases) e o
> corpo das RPCs (ainda escrevem `phase='compareceu'`, `phase='perdido'`)
> tornou parte da cadeia mecanicamente quebrada.

---

## 1 · Resumo executivo

A Fase 1A.2 (mig 150 retroapply) endureceu `chk_leads_phase` para 4 valores
canônicos · MAS a mig 065 (que define as RPCs de conversão) nunca foi
reescrita. Resultado: três tipos de inconsistência coexistem:

| # | Inconsistência | Status |
|---|---|---|
| 1 | `lead_to_paciente` soft-deleta lead na conversão (`SET deleted_at = COALESCE(deleted_at, now())`) | **VIOLA single-table** · 1 paciente contaminado |
| 2 | `lead_to_orcamento` soft-deleta lead | **VIOLA single-table** · 0 contaminados (sorte · ninguém usou ainda) |
| 3 | RPCs ainda referenciam `phase='compareceu'`/`'perdido'`/`'reagendado'` (legacy 7-phase) | CHECK `chk_leads_phase` da mig 150 BLOQUEIA · cadeia attend→finalize→conversão **mecanicamente quebrada** |

**Sem db push. Sem migration nova. Sem SQL mutativo. Sem deploy.**

---

## 2 · Estado local antes

```
Branch: main
HEAD: c4344251cb415f4c220f54c1dd1276b2cc001308
origin/main: c434425  (== HEAD)
Working tree: limpo (apenas Fase 1E entregue)
Project-ref: oqboitkpcvuaudouwvkl
```

---

## 3 · Funções encontradas (Probe 1)

Confirmadas no banco · todas SECURITY DEFINER VOLATILE:

| Schema | Function | Args |
|---|---|---|
| public | `lead_to_paciente` | `(uuid, numeric, timestamptz, timestamptz, text)` |
| public | `lead_to_orcamento` | `(uuid, numeric, jsonb, numeric, text, text, date)` |
| public | `lead_lost` | `(uuid, text)` |
| public | `lead_create` | `(text, text, text, text, text, text, jsonb, uuid, text)` |
| public | `lead_to_appointment` | (...) |
| public | `sdr_change_phase` | `(uuid, text, text)` |

Nenhum `convert_lead*` / `create_patient_from_lead` / etc · só as quatro
canônicas + `lead_create`/`lead_to_appointment`/`sdr_change_phase`.

---

## 4 · Definições auditadas (probes 1 + 2 confirmam = mig 065)

Source autoritativa: `db/migrations/20260800000065_clinicai_v2_crm_rpcs.sql`
(tracker confirma · única migration que define essas RPCs · zero overrides
posteriores · Fase 1A.13 atestou 148/148 alinhadas).

Probe 2 (banco real) bate com mig 065:

| Function | mentions_deleted_at | sets_deleted_at | mentions_lifecycle_status | mentions perdido/compareceu legacy |
|---|---|---|---|---|
| `lead_to_paciente` | ✅ | ✅ | ✅ (filtro) | ✅ |
| `lead_to_orcamento` | ✅ | ✅ | ✅ (filtro) | ✅ |
| `lead_lost` | ✅ | ✅ (filtro de read) | ✅ (filtro) | ✅ (`SET phase='perdido'`) |
| `sdr_change_phase` | ✅ (filtro) | — | ✅ | ✅ |

(Probe 2 mostra `mentions_*=true` em todos · grosso indicador. Análise
fina da mig 065 abaixo é o que conta.)

---

## 5 · Achados por função

### 5.1 · `lead_to_paciente` (mig 065 L588-721)

**Trecho relevante:**

```sql
-- L628
IF v_lead.phase <> 'compareceu' THEN
  RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', ...);
END IF;

-- L691-698
UPDATE public.leads
   SET phase            = 'paciente',
       phase_updated_at = now(),
       phase_updated_by = auth.uid(),
       phase_origin     = 'rpc',
       deleted_at       = COALESCE(deleted_at, now()),   -- ← VIOLA single-table
       updated_at       = now()
 WHERE id = p_lead_id;
```

**Classificação: `VIOLATES_SINGLE_TABLE_SOFT_DELETE` + `MECHANICALLY_BROKEN`**

- Soft-deleta o lead na conversão → some da `crm_operational_view`
- Exige pré-condição `phase='compareceu'` · valor proibido pelo CHECK da mig 150
- Hoje, no estado puro do banco, **só consegue rodar se alguém burlar o CHECK
  ou se a coluna phase nunca chegou no banco endurecido** (caso do paciente
  contaminado · ver §7)

### 5.2 · `lead_to_orcamento` (mig 065 L727-822)

**Trecho relevante:**

```sql
-- L770
IF v_lead.phase <> 'compareceu' THEN
  RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', ...);
END IF;

-- L795-802
UPDATE public.leads
   SET phase            = 'orcamento',
       phase_updated_at = now(),
       phase_updated_by = auth.uid(),
       phase_origin     = 'rpc',
       deleted_at       = COALESCE(deleted_at, now()),   -- ← VIOLA single-table
       updated_at       = now()
 WHERE id = v_lead.id;
```

**Classificação: `VIOLATES_SINGLE_TABLE_SOFT_DELETE` + `MECHANICALLY_BROKEN`**

Mesma estrutura do `lead_to_paciente`. Hoje impossível executar em prod
porque pré-condição exige phase='compareceu' (proibida pelo CHECK).

### 5.3 · `lead_lost` (mig 065 L828-901)

**Trecho relevante:**

```sql
-- L861-867
IF NOT public._lead_phase_transition_allowed(v_lead.phase, 'perdido') THEN
  RETURN jsonb_build_object('ok', false, 'error', 'illegal_phase_transition', ...);
END IF;

-- L878-887
UPDATE public.leads
   SET phase            = 'perdido',                     -- ← CHECK violado!
       phase_updated_at = now(),
       phase_updated_by = auth.uid(),
       phase_origin     = 'rpc',
       lost_reason      = p_reason,
       lost_at          = now(),
       lost_by          = auth.uid(),
       updated_at       = now()
 WHERE id = v_lead.id;
```

**Classificação: `MECHANICALLY_BROKEN` (CHECK violation)**

- Escreve `phase='perdido'` direto · valor proibido pelo `chk_leads_phase` da mig 150
- NÃO atualiza `lifecycle_status='perdido'` (que seria o caminho correto pós-Fase 1C)
- NÃO preenche `lost_from_phase` (exigido pelo `chk_leads_lost_consistency` da mig 150)
- Probe 4 confirma: `phase_perdido_soft_deleted=0` (zero rows com phase='perdido') ·
  RPC nunca conseguiu rodar com sucesso pós-mig 150

### 5.4 · `appointment_attend` (mig 065 L328-418) — colateral

**Trecho:**

```sql
-- L394-400
UPDATE public.leads
   SET phase            = 'compareceu',                  -- ← CHECK violado!
       phase_updated_at = now(),
       phase_updated_by = auth.uid(),
       phase_origin     = 'auto_transition',
       updated_at       = now()
 WHERE id = v_lead.id;
```

**Classificação: `MECHANICALLY_BROKEN`** — `phase='compareceu'` proibido pelo CHECK.

Consequência em cadeia: sem `appointment_attend` setando phase, nenhuma das
sub-RPCs (`lead_to_paciente`, `lead_to_orcamento`) consegue passar pela
pré-condição `phase='compareceu'`.

### 5.5 · `_lead_phase_transition_allowed` (mig 065 L50-76)

Matriz canônica ainda referencia 7 phases (compareceu/reagendado/perdido).
Não é "violação" porque IMMUTABLE · só retorna boolean. Mas a matriz aceita
transições que o CHECK depois rejeita · descoordenação semântica.

### 5.6 · `sdr_change_phase` (mig 065 L912+) — partial risk

Wrapper genérico que roteia para sub-RPCs · herda os mesmos problemas
(não consegue rotear para `perdido` porque `lead_lost` quebra).

---

## 6 · Código runtime auditado

Wrappers TS em `LeadRepository`:

| Método | Linha | RPC chamada | Mutação client-side |
|---|---|---|---|
| `toPaciente()` | L609 | `lead_to_paciente` | Nenhuma · só `.rpc(...)` |
| `toOrcamento()` | L636 | `lead_to_orcamento` | Nenhuma |
| `markLost()` | L657 | `lead_lost` | Nenhuma |
| `changePhase()` | L709 | `sdr_change_phase` | Nenhuma |
| `setPhase()` | L192 | delega para `changePhase()` (Fase 1D) | Nenhuma |

✅ **Zero soft-delete client-side.** Toda a mutação acontece nas RPCs. O bug
é puramente DB · TS está correto desde a Fase 1D.

E2E test `apps/lara/e2e/authed/lead-to-orcamento.spec.ts:117` ainda comenta
"_lead source orig deve ter sido soft-deleted via lead_to_orcamento_" ·
expectativa precisa ser reescrita junto com a mig nova (Fase 2B).

---

## 7 · Dados operacionais auditados (probes 3, 4, 6, 8, 10)

### Probe 3 · Distribuição leads por (phase, lifecycle_status, deleted_at)

- 1 lead `(phase=paciente, lifecycle_status=arquivado)` com `deleted_at IS NOT NULL`
- 1 lead `(phase=paciente, lifecycle_status=ativo)` com `deleted_at IS NULL`
- (demais distribuições não relevantes pra audit)

### Probe 4 · Soft-deleted total

```
lost_via_to_paciente         = 1   ← contaminação confirmada
lost_via_to_orcamento        = 0
phase_perdido_soft_deleted   = 0   ← lead_lost nunca conseguiu rodar
deleted_other                = 1   ← provável exclusão manual real
deleted_total_overall        = 2
leads_total_overall          = 120
```

### Probe 6 · Orçamentos órfãos

`budgets_linked_to_deleted_leads = 0` · zero orçamentos apontando para leads
soft-deletados (consistente com `lost_via_to_orcamento=0`).

### Probe 8 · Patients ⇄ leads (UUID compartilhado)

```
patients_total                            = 2
patients_with_lead_row                    = ?  (não capturado mas ≥1)
patients_with_lead_soft_deleted           = 1  ← contaminação confirmada
patients_orphan_no_lead_row               = ?
```

→ **1 paciente real está com lead_row soft-deletado.** Esse paciente NÃO
aparece na `crm_operational_view` porque a view filtra `deleted_at IS NULL`
antes de derivar `mesa_operacional`.

### Probe 10 · View vs realidade

```
leads_phase_paciente_total       = 2
leads_phase_paciente_in_view     = 1   ← 1 paciente visível, 1 sumiu
view_mesa_paciente               = 0
view_mesa_paciente_orcamento     = 1   ← paciente ativo + orçamento aberto
view_mesa_orcamento              = ?
```

**`view_mesa_paciente = 0` é o smoking gun.** A mesa "paciente" derivada na
view é alcançável apenas para leads com `deleted_at IS NULL` + `phase=paciente`
+ sem orçamento aberto. Hoje, dos 2 pacientes do banco:
- 1 (ativo, com orçamento aberto) → cai em `mesa_operacional='paciente_orcamento'`
- 1 (arquivado, soft-deletado) → some completamente

Nunca nenhum paciente vai aparecer como `mesa_operacional='paciente'`
enquanto a RPC continuar soft-deletando.

---

## 8 · `crm_operational_view`

Probe 9 confirma a definição capturada na mig 150 (linha 109-165). Trecho-chave:

```sql
SELECT ..., CASE
    WHEN l.lifecycle_status = 'perdido'::text   THEN 'perdido'
    WHEN l.lifecycle_status = 'arquivado'::text THEN 'arquivado'
    WHEN p.id IS NOT NULL AND o.id IS NOT NULL  THEN 'paciente_orcamento'
    WHEN p.id IS NOT NULL                       THEN 'paciente'
    WHEN o.id IS NOT NULL                       THEN 'orcamento'
    WHEN a.id IS NOT NULL AND a.deleted_at IS NULL THEN 'agendado'
    ELSE 'lead'
  END AS mesa_operacional, ...
FROM public.leads l
LEFT JOIN public.patients p ON p.id = l.id AND p.clinic_id = l.clinic_id AND p.deleted_at IS NULL
...
WHERE l.deleted_at IS NULL;     -- ← FILTRO TERMINAL · esconde soft-deleted
```

**A view respeita o contrato single-table CORRETAMENTE** · o problema é que
as RPCs sabotam a premissa ao soft-deletar o lead.

Se as RPCs PARAREM de soft-deletar, a view derivaria `mesa_operacional` para
pacientes/orçamentos automaticamente sem mudança de SQL na view.

---

## 9 · Viola ou não viola ADR single-table?

**VIOLA · em três dimensões:**

1. **Contratual:** `lead_to_paciente` e `lead_to_orcamento` fazem `SET deleted_at = COALESCE(deleted_at, now())` · `deleted_at` deveria significar exclusão real, não transição de funil.

2. **Mecânica:** o descompasso entre o CHECK `chk_leads_phase` (4 phases) e o corpo das RPCs (escrevem compareceu/perdido/etc) deixou `appointment_attend`, `lead_lost` e a cadeia attend→finalize→paciente/orcamento parcialmente ou totalmente inoperantes em prod.

3. **Dados:** 1/2 pacientes (50%) está com `lead_row.deleted_at IS NOT NULL` e sumiu da `crm_operational_view`. Não é hipotético · é contaminação real.

---

## 10 · Recomendação

**OPÇÃO B · Criar mig nova para corrigir RPCs de conversão.** Próxima fase
deve ser **Fase 2B · mig 151 (`crm_rpcs_single_table_alignment`)**:

### 10.1 · Reescrita das RPCs (idempotente · CREATE OR REPLACE)

1. **`appointment_attend`**
   - REMOVER `UPDATE leads SET phase = 'compareceu'`
   - Setar apenas `appointments.status = 'na_clinica'` + `chegada_em`
   - Opcionalmente registrar `leads.last_attend_at` (se quisermos preservar sinal · coluna nova)

2. **`appointment_finalize`**
   - REMOVER exigência `status IN ('na_clinica',...)` ou expandir para incluir `aguardando/confirmado` (pular o pulo de phase=compareceu)
   - Manter roteamento outcome → sub-RPC

3. **`lead_to_paciente`**
   - REMOVER pré-condição `phase='compareceu'` · aceitar qualquer phase ativa
   - REMOVER `deleted_at = COALESCE(deleted_at, now())`
   - Manter `phase='paciente'` (4-phase legal)
   - Manter INSERT em `patients` com mesmo UUID (já idempotente)
   - Re-mapear appointments/orcamentos do lead para o patient (já faz · L674-688)

4. **`lead_to_orcamento`**
   - REMOVER pré-condição `phase='compareceu'`
   - REMOVER `deleted_at = COALESCE(deleted_at, now())`
   - Manter `phase='orcamento'` (4-phase legal)
   - Cria orçamento como hoje (mantém lead_id ativo · sem soft-delete)

5. **`lead_lost`**
   - REMOVER `UPDATE leads SET phase='perdido'`
   - Setar `lifecycle_status='perdido'` + `lost_reason` + `lost_at` + `lost_from_phase = (phase atual antes da troca)`
   - Manter `phase` como está (paciente perde igual a lead perde · sem mudar phase)

6. **`_lead_phase_transition_allowed`**
   - Reescrever matriz para 4-phase (espelho `LEAD_PHASE_TRANSITIONS` em [packages/repositories/src/helpers/phase-transitions.ts](packages/repositories/src/helpers/phase-transitions.ts))

7. **`sdr_change_phase`**
   - Validar que aceita apenas phases canônicas
   - Roteamento `perdido` deve chamar `lead_lost` (que agora age em `lifecycle_status`)

### 10.2 · Backfill cirúrgico do paciente contaminado

```sql
-- DRY-RUN primeiro (SELECT pra ver o que mudaria):
SELECT l.id, l.phase, l.lifecycle_status, l.deleted_at, p.id IS NOT NULL AS has_patient_row
FROM public.leads l
LEFT JOIN public.patients p ON p.id = l.id AND p.clinic_id = l.clinic_id
WHERE l.deleted_at IS NOT NULL
  AND l.phase = 'paciente'
  AND p.id IS NOT NULL
  AND p.deleted_at IS NULL;
-- esperado: 1 linha (o paciente contaminado)

-- Backfill (vai dentro da mig 151, atrás de DO block sanity):
UPDATE public.leads
   SET deleted_at = NULL,
       updated_at = now()
 WHERE phase = 'paciente'
   AND deleted_at IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.patients p
      WHERE p.id = leads.id AND p.clinic_id = leads.clinic_id AND p.deleted_at IS NULL
   );
-- esperado: 1 row affected
```

Após backfill, a view automaticamente derivará `mesa_operacional='paciente'`
(ou `paciente_orcamento` se houver orçamento aberto · que é o caso atual).

### 10.3 · Atualizar e2e tests

`apps/lara/e2e/authed/lead-to-orcamento.spec.ts:117` precisa ser reescrito
para esperar `deleted_at IS NULL` pós-conversão (e não soft-delete).

---

## 11 · Próximo passo

**Fase 2B · mig 151 `crm_rpcs_single_table_alignment`** (escopo §10):

1. Criar `db/migrations/20260800000151_clinicai_v2_crm_rpcs_single_table_alignment.sql`
2. Criar `.down.sql` correspondente (rollback NO-OP defensivo · não voltar para soft-delete)
3. Static safety scan (zero `DROP TABLE`, `DROP COLUMN`, `ALTER TYPE`, etc)
4. Pedir autorização explícita do Alden pra apply (Management API · mesmo padrão Fase 1A.11.C)
5. Aplicar + repair tracker
6. Regenerar types (`pnpm db:types`)
7. Atualizar wrappers TS (docstrings + e2e test)
8. Smoke test manual: criar lead → agendar → atender → finalizar como paciente → confirmar mesa=paciente na view

---

## 12 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Mig 151 fica desalinhada com runtime ativo (Lara em prod) | Baixa | RPCs hoje estão mecanicamente quebradas · mig 151 é fix · nada que dependa do estado atual quebra |
| Backfill atinge paciente errado | Baixa | DRY-RUN antes · WHERE conservador (exige patient row + soft-deleted lead) |
| `appointment_finalize` mudar de pré-condição pode confundir UI | Baixa | UI Lara hoje já não passa por `appointment_attend` antes (provavelmente caminho UI legado) · validar no smoke |
| e2e test legado falhar pós-mig | Baixa | Reescrever junto com mig (mesma PR) |

---

## 13 · Confirmações negativas

- ❌ Zero alteração de banco · Probe 1-10 são todos SELECT
- ❌ Zero migration nova criada · doc-only
- ❌ Zero SQL mutativo
- ❌ Zero `supabase db push`
- ❌ Zero `supabase migration repair`
- ❌ Zero deploy
- ❌ Zero alteração de código funcional

---

## 14 · Histórico

- **2026-05-11:** Fase 2A executada com autorização explícita de Alden · auto-mode
- **Grafo:** consultado antes de qualquer Read · regra inviolável respeitada
- **Probes rodados pelo Alden no Studio:** 1, 2, 3, 4, 6, 8, 9 + 10 (inferido de mig 150 e confirmado pelo Alden)
- **Verdict:** `CRM_PHASE_2A_SINGLE_TABLE_AUDIT_READY_P0` ⚠️
- **Achado P0:** 1 paciente real contaminado · 50% da base de pacientes
- **Próximo:** Fase 2B · mig 151 + backfill cirúrgico
