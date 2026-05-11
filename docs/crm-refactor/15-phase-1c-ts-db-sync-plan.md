# 15 · Phase 1C · TS ↔ DB sync plan

> **Status:** plano (não-executado nesta fase)
> **Pré-requisito:** Migration 150 retroapply aplicada e validada
> **Objetivo:** alinhar TypeScript com o contrato real do banco (4 phases + 4 lifecycle)

---

## 1 · Contrato canônico (verdade)

Após Fase 1A (migration 150), o banco aceita:

| Coluna | Valores |
|---|---|
| `leads.phase` | `lead` · `agendado` · `paciente` · `orcamento` |
| `leads.lifecycle_status` | `ativo` · `perdido` · `recuperacao` · `arquivado` |
| `leads.lost_from_phase` | `lead` · `agendado` · `paciente` · `orcamento` ou `NULL` |

**Tudo mais é drift.** TypeScript precisa refletir isso.

---

## 2 · Arquivos a alterar

### 2.1 · `packages/repositories/src/types/enums.ts`

**Achados (linhas atuais):**
```ts
// linha 13: type LeadPhase = 'lead' | 'agendado' | 'reagendado' | 'compareceu' | 'paciente' | 'orcamento' | 'perdido';
// linhas 20-24: union expandida com 7 valores
// linha 96: type AppointmentFinalizeOutcome = 'paciente' | 'orcamento' | 'perdido'
```

**Alteração necessária:**

| O que | De | Para |
|---|---|---|
| `LeadPhase` union (~linha 13) | 7 valores | 4 valores (`lead`, `agendado`, `paciente`, `orcamento`) |
| Lista de valores literais (~linhas 20-24) | drop `reagendado`, `compareceu`, `perdido` | mantém 4 |
| Adicionar `LeadLifecycleStatus` | (não existe) | `'ativo' \| 'perdido' \| 'recuperacao' \| 'arquivado'` |
| `AppointmentFinalizeOutcome` | inclui `'perdido'` | apenas `'paciente'` `'orcamento'` `'paciente_orcamento'` |

**Risco:** alto. Esses tipos são importados por ~20 arquivos. TypeCheck vai apontar todos os call-sites quebrados — que é exatamente o que queremos.

**Teste recomendado:**
```bash
pnpm --filter @clinicai/repositories run typecheck
```
Após fix, esperar zero erros · pegar lista de breaks como guia para os outros arquivos.

---

### 2.2 · `packages/repositories/src/helpers/phase-transitions.ts`

**Achados (linhas atuais 22-28):**
```ts
lead: ['agendado', 'perdido'],
agendado: ['reagendado', 'compareceu', 'perdido', 'agendado'],
reagendado: ['agendado', 'compareceu', 'perdido', 'reagendado'],
compareceu: ['paciente', 'orcamento', 'perdido', 'compareceu'],
orcamento: ['paciente', 'agendado', 'perdido', 'orcamento'],
paciente: ['perdido', 'paciente'],
perdido: ['lead', 'agendado', 'reagendado', 'perdido'],
```

**Alteração necessária:**

Substituir matriz 7×7 por matriz **4×4** alinhada com `_lead_phase_transition_allowed` do banco. Matriz alvo (do doc 04):

```ts
export const LEAD_PHASE_TRANSITIONS: Record<LeadPhase, LeadPhase[]> = {
  lead:      ['agendado', 'lead'],            // no-op + única transição forward
  agendado:  ['paciente', 'orcamento', 'lead', 'agendado'],
  paciente:  ['agendado', 'paciente'],         // nova consulta
  orcamento: ['paciente', 'agendado', 'orcamento'],
}
```

**Importante:** perda agora é via `lifecycle_status` (não phase). Adicionar matriz separada:

```ts
export const LEAD_LIFECYCLE_TRANSITIONS: Record<LeadLifecycleStatus, LeadLifecycleStatus[]> = {
  ativo:       ['perdido', 'arquivado', 'ativo'],
  perdido:     ['recuperacao', 'arquivado', 'perdido'],
  recuperacao: ['ativo', 'perdido', 'arquivado', 'recuperacao'],
  arquivado:   ['ativo', 'arquivado'],
}
```

**Risco:** médio. Helpers consumidos por validators TS antes de chamar RPC. Drift entre TS e SQL pode permitir UI/Actions oferecerem transições que o DB rejeita.

**Teste recomendado:**
- Comparar matriz TS atualizada com `_lead_phase_transition_allowed` via probe SQL (paridade 4×4)
- Comparar `LEAD_LIFECYCLE_TRANSITIONS` com regra que `lead_recovery_activate`/`lead_archive` aplicam

---

### 2.3 · `apps/lara/src/app/crm/_schemas/lead.schemas.ts`

**Achados (linhas 48-52):**
```ts
'reagendado',
'compareceu',
'paciente',
'orcamento',
'perdido',
```

**Alteração:** Drop `reagendado`, `compareceu`, `perdido` da Zod enum. Adicionar Zod schema para `lifecycle_status`:

```ts
export const LeadLifecycleStatusSchema = z.enum(['ativo', 'perdido', 'recuperacao', 'arquivado'])
export const LeadPhaseSchema = z.enum(['lead', 'agendado', 'paciente', 'orcamento'])
```

**Risco:** baixo. Zod failures viram `Result` errors em Server Actions · falham early.

**Teste recomendado:** rodar `pnpm test` no app lara · ver se validators bloqueiam payloads legados.

---

### 2.4 · `apps/lara/src/app/(authed)/leads/page.tsx`

**Achados (linhas 35-39 + 112-114):**
```ts
// 35-39: array de phases mostradas no filtro padrão
'reagendado',
'compareceu',
// 39: 'perdido'

// 112: filter.excludePhases = ['paciente', 'orcamento', 'perdido']
// 114: filter.phases = ['perdido']
```

**Alteração:**

| Linha | De | Para |
|---|---|---|
| 35-39 | array com `reagendado/compareceu/perdido` | array `['lead', 'agendado']` (foco em ativos não-paciente) |
| 112 | `excludePhases = ['paciente', 'orcamento', 'perdido']` | `excludePhases = ['paciente', 'orcamento']` + filter `lifecycle_status != 'perdido'` |
| 114 | `filter.phases = ['perdido']` (mostra perdidos) | `filter.lifecycleStatus = 'perdido'` (filtro por lifecycle) |

**Risco:** médio. Mudança de filtros impacta o que aparece em `/leads`. Aceitar que filtro "Perdidos" agora consulta lifecycle, não phase.

**Teste recomendado:** navegar `/leads`, verificar que cada filtro mostra rows esperados. Usar dados do probe P6 como ground truth (116 leads ativos).

---

### 2.5 · `apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx`

**Achados (linhas 39-40):**
```ts
{ id: 'reagendado', label: 'Reagendado' },
{ id: 'compareceu', label: 'Compareceu' },
```

**Alteração:** Remover esses 2 itens do array de filter chips. Não há substituto direto · esses estados não existem mais como phase.

**Opcional:** adicionar novo chip "Perdidos" que filtra por `lifecycle_status='perdido'` em vez de `phase='perdido'`.

**Risco:** baixo (UI puramente).

**Teste recomendado:** abrir `/leads`, ver painel de filtros · confirmar que opções inválidas sumiram.

---

### 2.6 · `apps/lara/src/app/(authed)/leads/[id]/LeadTagsPanel.tsx`

**Achados (linhas 36-37):**
```ts
{ id: 'reagendado', label: 'Reagendado' },
{ id: 'compareceu', label: 'Compareceu' },
```

**Alteração:** Remover esses 2 itens. Não há substituto · UI de mudança de phase não oferece mais esses estados.

**Risco:** baixo. Se algum lead em produção tem `phase='reagendado'` ou `'compareceu'`, a UI continua exibindo o badge mas não permite "mudar para". Probe P6 mostra zero rows nesse estado · sem impacto real.

**Teste recomendado:** abrir `/leads/[id]` de lead em phase `lead/agendado/paciente/orcamento` · confirmar opções de mudança são apenas válidas pela matriz 4-phase.

---

### 2.7 · `apps/lara/src/app/(authed)/campanhas/lib/filters.ts`

**Achados (linhas 5, 19, 22):**
```ts
// linha 5: comentário "phase: lead | agendado | compareceu | orcamento | paciente | perdido"
// linha 19: { value: 'compareceu', label: 'Compareceu' }
// linha 22: { value: 'perdido', label: 'Perdido' }
```

**Alteração:**

| O que | De | Para |
|---|---|---|
| Comentário linha 5 | menciona 6 phases | menciona 4 phases `lead/agendado/paciente/orcamento` |
| linha 19 (`compareceu`) | filter option | drop |
| linha 22 (`perdido`) | filter option como phase | drop; adicionar filter `lifecycleStatus = 'perdido'` separado |

**Risco:** baixo · filtros de campanha (broadcasts). Se uma campanha tinha critério `phase='perdido'`, precisa reescrever para `lifecycle_status='perdido'`.

**Teste recomendado:** abrir editor de campanha, listar campanhas existentes que usavam `compareceu` ou `perdido` como phase no critério (provavelmente zero · mas conferir).

---

### 2.8 · `packages/ui/src/components/badge.tsx`

**Achados (linhas 71-84 + 135):**
```ts
| 'reagendado'           // linha 71
| 'compareceu'           // linha 72
| 'perdido'              // linha 75 (parte de PhaseBadgeVariant)
reagendado: { label: 'Reagendado', variant: 'info' },    // linha 83
compareceu: { label: 'Compareceu', variant: 'warning' }, // linha 84
no_show:    { label: 'Não compareceu', variant: 'destructive' }, // linha 135 (status de appointment · OK manter)
```

**Alteração:**

- **Linhas 71, 72:** drop `reagendado` e `compareceu` do tipo union de phase badge.
- **Linhas 83, 84:** drop entradas do registry.
- **Linha 75 (`perdido`):** depende. Se badge é puramente visual e mostra "Perdido" baseado em `lifecycle_status`, mantém — mas troca semântica. Sugiro renomear: `lifecycle.perdido` em vez de `phase.perdido` em outro registry.
- **Linha 135 (`no_show`):** OK, é `appointment.status='no_show'`. Não tocar.

**Risco:** baixo · badge é puramente cosmético. Se algum lugar consome `<Badge phase="reagendado">`, TypeScript pega.

**Teste recomendado:** `pnpm --filter @clinicai/ui run typecheck` · achar todos os consumers que usavam phase legada.

---

## 3 · Ordem de execução recomendada (Fase 1C)

1. **Migration 150 aplicada e validada** (Fase 1A)
2. Editar `packages/repositories/src/types/enums.ts` primeiro (fonte de tipos)
3. Editar `packages/repositories/src/helpers/phase-transitions.ts` (matriz)
4. Rodar `pnpm typecheck` cross-monorepo · listar todos os erros
5. Para cada erro, ajustar o arquivo correspondente (ordem provável: schemas → page.tsx → filters → painéis → badge)
6. Adicionar testes de unit para validar matriz TS bate com SQL
7. Sanity check: rodar app lara local · navegar `/leads`, `/crm/*` · confirmar UI funciona

---

## 4 · Risco geral · resumo

| Aspecto | Severidade | Comentário |
|---|---|---|
| Compilação TS | Alta (intencional) | Mudança força revisão de todos os consumers |
| Runtime UI | Baixa | Probe P6 mostra ZERO rows em phases legadas · UI nunca renderiza esses badges hoje |
| Server Actions | Baixa | Validators Zod ficam mais estritos · payloads inválidos falham early com 400 claro |
| Campanhas / broadcasts | Baixa | Critério em campanha por `phase='perdido'` raro · migrar para `lifecycle_status` |
| Drift remanescente | Médio | Helper TS deve permanecer espelho da matriz SQL · documentar em ADR-026 quando criar |

---

## 5 · Critério de aceite Fase 1C

- [ ] `pnpm typecheck` em todo o monorepo passa sem erros
- [ ] Grep `reagendado|compareceu` em `apps/lara/src` + `packages/*` retorna apenas:
  - referências documentais (comentários explicando que não existe mais)
  - registros legados em `apps/lara/public/legacy/**` (órfãos · OK)
  - `no_show` em badge.tsx (não relacionado)
- [ ] `pnpm test` em packages e apps passa
- [ ] Navegação manual de `/leads` e `/crm/*` funciona com dados reais
- [ ] Pull request descreve as 8 mudanças e o impacto
- [ ] Sem necessidade de migration nova (apenas TS)

---

## 6 · Não fazer nesta fase

- ❌ Não alterar RPCs (Fase 1D / Fase 2)
- ❌ Não tocar em `appointment_finalize` (mantém outcome 'perdido' até Fase 1D refactor)
- ❌ Não dropar `is_in_recovery` boolean (Fase 7 cleanup)
- ❌ Não tocar em legacy `apps/lara/public/legacy/**` (órfão · Fase 7)
- ❌ Não tocar em `clinic-dashboard` v1 (cutover · Fase 7)
