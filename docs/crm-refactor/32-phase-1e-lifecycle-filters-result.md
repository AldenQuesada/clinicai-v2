# 32 · Fase 1E · Lifecycle Filters · "Perdidos" via lifecycle_status · CLOSURE

> Reintrodução do filtro "Perdidos" na UI de leads usando
> `lifecycle_status` (NÃO `phase`). Executado 2026-05-11 com autorização
> explícita do Alden (Fase 1E). Grafo consultado antes de qualquer Read ·
> regra inviolável respeitada.
>
> **Esta fase ENCERRA o débito de UX criado na Fase 1C** (chip "Perdidos"
> tinha sido removido por falta de filtro lifecycle_status no contrato).
> Próximo bloco é **Fase 2 · `lead_archive`/`lead_unarchive` RPCs**.

---

## 1 · Resumo executivo

**Resultado:** `lifecycleStatus` agora é cidadão de primeira classe em
`LeadDTO`, `ListLeadsFilter`, `LeadRepository.list()` e UI `/leads`. Chip
"Perdidos" voltou · filtra `lifecycle_status='perdido'` server-side.
Listas operacionais default (Ativos/Pacientes) excluem `perdido`+`arquivado`.

| Métrica | Before | After |
|---|---|---|
| `LeadDTO.lifecycleStatus` | ❌ ausente | ✅ `LifecycleStatus` |
| `ListLeadsFilter.lifecycleStatus` | ❌ ausente | ✅ |
| `ListLeadsFilter.lifecycleStatuses` (multi) | ❌ ausente | ✅ |
| `ListLeadsFilter.excludeLifecycleStatuses` | ❌ ausente | ✅ |
| `mapLeadRow` mapeia `row.lifecycle_status` | ❌ não | ✅ default `'ativo'` |
| `LeadRepository.list()` filtra lifecycle | ❌ não | ✅ `.eq/.in/.not` |
| Chip "Perdidos" em UI | ❌ removido na Fase 1C | ✅ voltou · `?status=archived` |
| `BroadcastTargetFilter.lifecycle_status` | ❌ ausente | ✅ contrato pronto (TODO UI campanha) |
| `phase='perdido'` em runtime | 0 (já era · Fase 1C) | **0** ✅ |
| Typecheck `@clinicai/repositories` | OK | ✅ OK |
| Typecheck `@clinicai/lara` | OK | ✅ OK |
| Typecheck `@clinicai/ui` | OK | ✅ OK |

**Sem db push. Sem migration nova. Sem deploy. Sem alteração no schema.**

---

## 2 · Estado local antes

```
Branch: main
HEAD: 366339d · fix(crm): route phase and appointment status writes through RPCs
origin/main: 366339d  (== HEAD)
Working tree: limpo
```

---

## 3 · Arquivos alterados

| # | Arquivo | Alteração |
|---|---|---|
| 1 | [packages/repositories/src/types/dtos.ts](packages/repositories/src/types/dtos.ts) | Import `LifecycleStatus`; campo `lifecycleStatus: LifecycleStatus` no `LeadDTO` |
| 2 | [packages/repositories/src/mappers/lead.ts](packages/repositories/src/mappers/lead.ts) | Import `LifecycleStatus`; mapeia `row.lifecycle_status ?? 'ativo'` |
| 3 | [packages/repositories/src/types/inputs.ts](packages/repositories/src/types/inputs.ts) | Import `LifecycleStatus`; 3 campos novos em `ListLeadsFilter` |
| 4 | [packages/repositories/src/lead.repository.ts](packages/repositories/src/lead.repository.ts) | `applyFilters` em `list()` aplica `lifecycleStatus`/`lifecycleStatuses`/`excludeLifecycleStatuses` |
| 5 | [packages/repositories/src/broadcast.repository.ts](packages/repositories/src/broadcast.repository.ts) | `BroadcastTargetFilter.lifecycle_status?: string \| null` |
| 6 | [apps/lara/src/app/(authed)/leads/page.tsx](apps/lara/src/app/(authed)/leads/page.tsx) | `buildFilter` mapeia `status=archived → lifecycleStatus='perdido'`; default exclui `perdido`+`arquivado` |
| 7 | [apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx](apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx) | Chip "Perdidos" (`id='archived'`) voltou |
| 8 | [apps/lara/src/app/(authed)/campanhas/lib/filters.ts](apps/lara/src/app/(authed)/campanhas/lib/filters.ts) | `buildTargetFilter` aceita `lifecycle_status`; `describeFilter` exibe "Ciclo: ..." |
| 9 | [docs/crm-refactor/32-phase-1e-lifecycle-filters-result.md](docs/crm-refactor/32-phase-1e-lifecycle-filters-result.md) | Este doc |

---

## 4 · Contrato de filtro `lifecycleStatus`

### `ListLeadsFilter` (camelCase público)

```ts
export interface ListLeadsFilter {
  // ... (phase/funnel/etc inalterados)
  lifecycleStatus?: LifecycleStatus              // single eq
  lifecycleStatuses?: LifecycleStatus[]          // multi in
  excludeLifecycleStatuses?: LifecycleStatus[]   // not in
}
```

### `LeadRepository.list()` · `applyFilters` (snake_case interno)

```ts
if (filter.lifecycleStatus) {
  out = out.eq('lifecycle_status', filter.lifecycleStatus)
}
if (filter.lifecycleStatuses?.length) {
  out = out.in('lifecycle_status', filter.lifecycleStatuses)
}
if (filter.excludeLifecycleStatuses?.length) {
  out = out.not(
    'lifecycle_status',
    'in',
    `(${filter.excludeLifecycleStatuses.join(',')})`,
  )
}
```

### `LeadDTO` (camelCase exposto)

```ts
export interface LeadDTO {
  // ...
  phase: LeadPhase
  phaseUpdatedAt: string | null
  phaseUpdatedBy: string | null
  phaseOrigin: PhaseOrigin | null

  /** Ortogonal a phase · ativo/perdido/recuperacao/arquivado. */
  lifecycleStatus: LifecycleStatus
}
```

`mapLeadRow` default seguro: `row.lifecycle_status ?? 'ativo'` (rows
pré-mig 110 nunca tinham coluna · trigger DB hoje preenche).

---

## 5 · Como "Perdidos" funciona agora

### URL contract

| URL | Filtro server-side resultante |
|---|---|
| `/leads` (default · `?status=active`) | `excludePhases: ['paciente', 'orcamento']` + `excludeLifecycleStatuses: ['perdido', 'arquivado']` |
| `/leads?status=patient` | `phases: ['paciente']` + `excludeLifecycleStatuses: ['perdido', 'arquivado']` |
| `/leads?status=archived` | `lifecycleStatus: 'perdido'` (mostra **apenas** perdidos · phase agnostic) |
| `/leads?status=all` | sem filtros derivados · mostra tudo |

### UI chip

`LeadFiltersPanel.STATUS` agora tem 4 opções:
```ts
[
  { id: 'active',   label: 'Ativos'    },
  { id: 'patient',  label: 'Pacientes' },
  { id: 'archived', label: 'Perdidos'  },   // ← voltou nesta fase
  { id: 'all',      label: 'Todos'     },
]
```

Selecionar "Perdidos" gera `?status=archived` na URL · `buildFilter` em
`/leads/page.tsx` converte para `lifecycleStatus='perdido'` sem nunca
tocar em `phase`.

### Por que default exclui `arquivado` também

`lifecycle_status='arquivado'` é o estado-alvo das RPCs `lead_archive`/
`lead_unarchive` que serão entregues na Fase 2. Hoje o valor é
tecnicamente válido no DB mas o backfill da mig 110 deixou todos como
'ativo' · zero rows existem. Excluir agora previne regressão quando
Fase 2 começar a popular.

---

## 6 · Confirmação · zero `phase='perdido'` em runtime

```
$ rg -n "phase.{0,4}perdido" --glob '**/*.{ts,tsx}'
packages/ui/src/components/badge.tsx:68:                    [comentário]
apps/lara/src/app/crm/_schemas/lead.schemas.ts:45:        [comentário]
apps/lara/src/app/(authed)/leads/page.tsx:32:              [comentário]
apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx:66:  [comentário]
```

✅ Apenas **comentários explicativos** sobre por que `phase='perdido'`
foi derrogado (Fase 1C). Zero código que escreva ou compare phase com
'perdido'.

```
$ rg -n "phase: ['\"]perdido['\"]|phase = ['\"]perdido['\"]|'phase', 'perdido'|\"phase\", \"perdido\"|phase=perdido" --glob '**/*.{ts,tsx}'
(zero matches)
```

✅ Zero hits.

---

## 7 · Ocorrências restantes de `'perdido'` (todas justificadas)

| Local | Justificativa |
|---|---|
| `enums.d.ts` | Build output `.gitignore`-d · regenera no próximo build |
| `enums.ts:31` (`LIFECYCLE_STATUSES`) | Enum canônico do lifecycle · single source of truth |
| `enums.ts:104` (`AppointmentFinalizeOutcome`) | Outcome de `appointment_finalize` RPC · orquestração roteia para `lead_lost` |
| `appointment.schemas.ts:41,160` | Zod enum do outcome (appointment-level) |
| `appointment.actions.ts:246` | Param tipado do action de finalize |
| `_actions-bar.tsx:423,443,463,520,593,620` | UI de finalize · permite escolher outcome='perdido' (campo lostReason obrigatório) |
| `/leads/page.tsx:103,109,112,114` | `lifecycleStatus='perdido'` no buildFilter (FASE 1E, this commit) |
| `LeadFiltersPanel.tsx:66` + `actions.ts:181` | Comentários explicativos |

Conclusão: o token `'perdido'` agora aparece apenas como:
1. Valor de `LifecycleStatus`
2. Valor de `AppointmentFinalizeOutcome` (RPC orquestra · não escreve `phase='perdido'`)
3. Filtro server-side por `lifecycle_status` (esta fase)
4. Comentários

---

## 8 · Checks executados

### Typecheck

| Pacote | Comando | Resultado |
|---|---|---|
| `@clinicai/repositories` | `pnpm --filter @clinicai/repositories run typecheck` | ✅ PASS |
| `@clinicai/lara` | `pnpm --filter @clinicai/lara run typecheck` | ✅ PASS |
| `@clinicai/ui` | `npx tsc --noEmit` | ✅ PASS (exit=0) |

### git diff --check

```
exit=0 · zero warnings
```

### Working tree pós-edit

```
$ git status --short
 M apps/lara/src/app/(authed)/campanhas/lib/filters.ts
 M apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx
 M apps/lara/src/app/(authed)/leads/page.tsx
 M packages/repositories/src/broadcast.repository.ts
 M packages/repositories/src/lead.repository.ts
 M packages/repositories/src/mappers/lead.ts
 M packages/repositories/src/types/dtos.ts
 M packages/repositories/src/types/inputs.ts
?? docs/crm-refactor/32-phase-1e-lifecycle-filters-result.md
```

---

## 9 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Coluna `leads.lifecycle_status` ausente em rows antigos | Baixa | mig 110 + trigger DB já preenchem · `mapLeadRow` default `'ativo'` |
| Default `excludeLifecycleStatuses` esconde leads que UI quer ver | Baixa | Apenas `status=active`/`patient` aplica · `archived` mostra **só** perdidos, `all` desliga |
| `BroadcastTargetFilter.lifecycle_status` sem suporte na RPC | Aceito | Contrato preparado · RPC ignora keys desconhecidas no jsonb · UI ainda não expõe option |
| Filtro `excludeLifecycleStatuses` em multi-tenant com lifecycle_status null em rows raros | Baixa | `lifecycle_status` é NOT NULL no DB (mig 110 backfill 100%) |

---

## 10 · Próximo passo recomendado

**Fase 2 · `lead_archive` / `lead_unarchive` RPCs** (doc 02 + 04):
- Criar mig 151 com 2 RPCs SECURITY DEFINER
- `lead_archive(lead_id, reason?)` → `lifecycle_status='arquivado'`
- `lead_unarchive(lead_id, reason?)` → `lifecycle_status='ativo'`
- Adicionar wrapper em `LeadRepository`
- Adicionar action `archiveLeadAction` / `unarchiveLeadAction`
- UI: botão "Arquivar" no detalhe do lead

OU

**Fase 2A · Auditoria single-table de `lead_to_paciente`/`lead_to_orcamento`** (doc 16 §4.1):
- `pg_get_functiondef('lead_to_paciente'::regproc)` (SQL READ-ONLY)
- Confirmar se as RPCs ainda fazem `UPDATE leads SET deleted_at = now()` (ADR-001 derrogado)
- Se sim, planejar mig 151 que reescreve sem soft-delete

---

## 11 · Confirmações negativas

- ❌ Zero `supabase db push`
- ❌ Zero `supabase migration up`
- ❌ Zero `supabase migration repair`
- ❌ Zero migration nova criada
- ❌ Zero alteração de schema do banco
- ❌ Zero deploy
- ❌ Zero `phase='perdido'` reintroduzido

---

## 12 · Histórico

- **2026-05-11:** Fase 1E executada com autorização explícita de Alden
- **Grafo:** consultado antes de qualquer Read · regra inviolável respeitada
- **Latência total:** ~8min · 8 arquivos + 1 doc · zero conflict
- **Falhas typecheck:** 0
- **Commit alvo:** `fix(crm): filter lost leads by lifecycle status`
- **Fase 1E lifecycle filters · ENCERRADA** ✅
