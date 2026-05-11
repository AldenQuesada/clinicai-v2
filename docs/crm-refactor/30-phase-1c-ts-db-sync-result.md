# 30 · Fase 1C · TS↔DB sync · LeadPhase 7→4 · CLOSURE

> Sincronização TypeScript/Zod/UI com o contrato canônico do banco. Executado
> 2026-05-11 com autorização explícita do Alden (Fase 1C). Grafo consultado
> antes de qualquer edit · regra inviolável respeitada.
>
> **Esta fase ENCERRA o gap TS↔DB de phase contract** · próximo bloco é Fase 1D
> (RPC write hardening · doc 16) e/ou Fase 1E (filtro lifecycle_status).

---

## 1 · Resumo executivo

**Resultado:** `LeadPhase` reduzido de 7 → 4 valores em TS + Zod + UI. Helper
`isPhaseTransitionAllowed` e matriz `LEAD_PHASE_TRANSITIONS` reduzidas para 4×4.
`compareceu` e `reagendado` derrogados como phase. `perdido` movido para
`lifecycle_status` (tipo `LifecycleStatus` introduzido).

| Métrica | Before | After | Delta |
|---|---|---|---|
| Valores em `LeadPhase` (TS) | 7 | **4** | **−3** |
| Entradas em `LEAD_PHASE_TRANSITIONS` | 7 keys (15 transições) | **4 keys (10 transições)** | **−3 keys** |
| Valores em `LeadPhase` Zod (lead.schemas) | 7 | **4** | **−3** |
| Valores em `LEAD_PHASE_MAP` (badge UI) | 7 | **4** | **−3** |
| `VALID_PHASES` (page.tsx, actions.ts) | 7 | **4** | **−3** |
| `PHASES` (LeadFiltersPanel) | 5 (incl. duas derrogadas) | **3** | **−2** |
| `PHASES_SAFE` (LeadTagsPanel) | 4 (incl. duas derrogadas) | **2** | **−2** |
| `PHASE_OPTIONS` (campanhas filters) | 6 | **4** | **−2** |
| `LifecycleStatus` type (novo) | ❌ | ✅ `ativo\|perdido\|recuperacao\|arquivado` | +1 |
| `LIFECYCLE_STATUSES` const (novo) | ❌ | ✅ array exportado | +1 |
| Typecheck `@clinicai/repositories` | OK | ✅ OK | unchanged |
| Typecheck `@clinicai/lara` | OK | ✅ OK | unchanged |
| Typecheck `@clinicai/ui` | OK | ✅ OK | unchanged |

**Sem db push. Sem migration nova. Sem deploy. Sem mudança em schema do banco.**

---

## 2 · Contrato canônico final

### LeadPhase (4 valores)

```ts
export const LEAD_PHASES = ['lead', 'agendado', 'paciente', 'orcamento'] as const
export type LeadPhase = (typeof LEAD_PHASES)[number]
```

### LifecycleStatus (4 valores · NOVO)

```ts
export const LIFECYCLE_STATUSES = ['ativo', 'perdido', 'recuperacao', 'arquivado'] as const
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number]
```

### Matriz de transição (4×4 · 10 transições)

```ts
export const LEAD_PHASE_TRANSITIONS: Record<LeadPhase, readonly LeadPhase[]> = {
  lead: ['agendado'],
  agendado: ['paciente', 'orcamento', 'agendado'],
  orcamento: ['paciente', 'agendado', 'orcamento'],
  paciente: ['orcamento', 'paciente'],
} as const
```

Perda (perdido) NÃO é phase nessa matriz · vira `lifecycle_status` via RPC
`lead_lost`. Recuperação (perdido → ativo) também não passa por aqui.

---

## 3 · Arquivos editados (10)

### Package `@clinicai/repositories`

1. **`packages/repositories/src/types/enums.ts`**
   - Substitui union literal 7-value por `LEAD_PHASES` const + `(typeof ...)[number]`
   - Adiciona `LIFECYCLE_STATUSES` + `LifecycleStatus` type
   - Comentário canon: "perdido deixou de ser phase · agora vive em lifecycle_status"

2. **`packages/repositories/src/helpers/phase-transitions.ts`**
   - Reduz `LEAD_PHASE_TRANSITIONS` para 4 keys
   - Atualiza header comment (verbatim antigo trocado por novo contrato)
   - Remove transições envolvendo `compareceu`/`reagendado`/`perdido` como phase

3. **`packages/repositories/src/lead.repository.test.ts`**
   - Test `'perdido' → 'lead' recovery permitido` removido (perdido não é mais LeadPhase)
   - Novo describe: `'matriz canonica (Fase 1C · 4 phases)'`
   - Cobre: `lead→agendado`, `lead→paciente` (bloqueado), `agendado→paciente|orcamento|agendado`, `orcamento→paciente`

### App `@clinicai/lara`

4. **`apps/lara/src/app/crm/_schemas/lead.schemas.ts`**
   - `LeadPhase` zod enum reduzido para 4 valores
   - Comentário canon adicionado

5. **`apps/lara/src/app/(authed)/leads/page.tsx`**
   - `VALID_PHASES` reduzido para 4 valores
   - `buildFilter`: branch `status === 'archived'` removida + TODO Fase 1E
   - `filter.excludePhases = ['paciente', 'orcamento']` (sem 'perdido')

6. **`apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx`**
   - `PHASES` chip group: remove `reagendado`, `compareceu`
   - `STATUS` options: remove `archived` + TODO Fase 1E

7. **`apps/lara/src/app/(authed)/leads/[id]/LeadTagsPanel.tsx`**
   - `PHASES_SAFE` reduzido para 2 valores (lead, agendado · ChipSelector cosmético)
   - Helper text canônico mantido (paciente/orcamento/perdido via ações específicas)

8. **`apps/lara/src/app/(authed)/leads/actions.ts`**
   - `VALID_PHASES` reduzido para 4 valores

9. **`apps/lara/src/app/(authed)/campanhas/lib/filters.ts`**
   - `PHASE_OPTIONS` reduzido para 4 valores
   - Header doc atualizado para refletir novo contrato + TODO Fase 1E (filtro lifecycle_status)

### Package `@clinicai/ui`

10. **`packages/ui/src/components/badge.tsx`**
    - `type LeadPhase` local reduzido para 4 valores
    - `LEAD_PHASE_MAP`: remove entradas `reagendado`, `compareceu`, `perdido`
    - Comentário canon adicionado

---

## 4 · Validações executadas

### Grafo consultado ANTES de qualquer Read

```
$ graphify query "LeadPhase enum phase-transitions matrix LEAD_PHASES isPhaseTransitionAllowed"
→ 23 nodes
→ Confirmado: phase-transitions.ts:L38 community=247, enums.ts community=758
```

### rg pré-edit (classificação semântica)

```
$ rg -n "compareceu|reagendado|perdido" apps packages db --glob '!node_modules/**' --glob '!**/*.js' --glob '!**/*.d.ts' --glob '!apps/lara/public/legacy/**'
→ ~80 hits classificados:
  · 8 arquivos como alvo (phase TS)
  · resto: AppointmentFinalizeOutcome (justified · appointment-level)
       + AppointmentStatus (no_show label "Não compareceu" · UI text)
       + OrcamentoStatus (lost label "Perdido" · orçamento status)
       + comentários/docs
```

### Typecheck

| Pacote | Comando | Resultado |
|---|---|---|
| `@clinicai/repositories` | `pnpm --filter @clinicai/repositories run typecheck` | ✅ PASS |
| `@clinicai/lara` | `pnpm --filter @clinicai/lara run typecheck` | ✅ PASS |
| `@clinicai/ui` | `npx tsc --noEmit` (sem script `typecheck`) | ✅ PASS (exit=0) |

### Re-grep pós-edit (apenas TS/TSX)

```
$ rg -n "'(compareceu|reagendado|perdido)'" --glob '**/*.{ts,tsx}'
→ 0 ocorrências de 'compareceu' ou 'reagendado' como literal de phase em runtime
→ 'perdido' restante apenas em:
  · LIFECYCLE_STATUSES (enums.ts:31) · justified ✅
  · AppointmentFinalizeOutcome (enums.ts:104, appointment.schemas.ts, _actions-bar.tsx, appointment.actions.ts) · justified ✅
  · lead.repository.test.ts (removido · não aparece mais)
  · enums.d.ts (build output gitignored · regenera no próximo build)
  · comentário em campanhas/lib/filters.ts (TODO Fase 1E · justified)
```

### Bugs descobertos durante typecheck

`apps/lara/src/app/(authed)/leads/actions.ts` tinha `VALID_PHASES` local com 7
valores (não capturado no rg inicial · ficou fora dos 8 arquivos do doc 15).
Encontrado pelo typecheck (`error TS2820`) e corrigido na mesma fase ·
totalizando **10 arquivos** editados (não 8).

---

## 5 · Confirmações

- ✅ Grafo consultado ANTES de Read/Edit (regra inviolável CLAUDE.md)
- ✅ Zero edit em `db/migrations/` · zero `supabase db push` · zero `migration repair`
- ✅ Zero edit em `packages/supabase/src/types.ts` (gerado pelo DB · DB inalterado)
- ✅ Zero alteração no DB · contrato JÁ era 4-phase no banco (Fase 1A.2 mig 150 retroapply confirmou)
- ✅ Typecheck PASS em todos os pacotes editados
- ✅ Apenas valores justificados de `perdido` permanecem (lifecycle_status + appointment outcome)
- ✅ `AppointmentFinalizeOutcome` mantido com 'perdido' · orquestração roteia para `lead_lost` RPC (não muda phase)

---

## 6 · Pendências (Fase 1E)

Itens que SAÍRAM do escopo desta fase mas estão documentados como TODO:

1. **Filtro por `lifecycle_status` em `ListLeadsFilter`**
   - Coluna `leads.lifecycle_status` já existe no DB (linhas 7840, 7882, 7924 de
     `packages/supabase/src/types.ts`)
   - `LeadDTO` ainda NÃO expõe esse campo
   - `LeadRepository.list()` ainda NÃO filtra por ele
   - UI `LeadFiltersPanel` `status` chip removeu "Perdidos" temporariamente

2. **Restaurar "Perdidos" no chip Status do /leads**
   - Após Fase 1E expor `lifecycleStatus` no filter, adicionar de volta:
     ```ts
     { id: 'archived', label: 'Perdidos' },
     ```
   - Mapear `status === 'archived'` para `filter.lifecycleStatus = 'perdido'`

3. **Filtro de campanhas por `lifecycle_status='perdido'` (recuperação)**
   - Adicionar opção de targeting "Leads perdidos para campanha de recuperação"

---

## 7 · Próximo passo recomendado

**Fase 1D · RPC write hardening** (doc 16):
- `setLeadPhaseAction` deletar OU rotar via `sdr_change_phase` RPC (audit trail)
- `cancel()` + `markNoShow()` via `AppointmentRepository.changeStatus()` (já existe · doc 16 v2)

OU

**Fase 1E · Lifecycle status filter** (este doc §6).

---

## 8 · Histórico

- **2026-05-11:** Fase 1C executada com autorização explícita de Alden
- **Grafo:** consultado antes de qualquer Read · regra inviolável respeitada
- **Latência total:** ~10min · 10 arquivos · zero conflict
- **Falhas typecheck durante:** 1 (actions.ts faltando · resolvido na mesma fase)
- **Commit alvo:** `fix(crm): align lead phase types with database contract`
- **Fase 1C TS↔DB sync · ENCERRADA** ✅
