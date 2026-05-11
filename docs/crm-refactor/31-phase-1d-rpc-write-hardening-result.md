# 31 · Fase 1D · RPC Write Hardening · CLOSURE

> Eliminação dos 3 UPDATEs diretos em colunas críticas (`leads.phase`,
> `appointments.status='cancelado'`, `appointments.status='no_show'`).
> Executado 2026-05-11 com autorização explícita do Alden (Fase 1D).
> Grafo consultado antes de qualquer Read · regra inviolável respeitada.
>
> **Esta fase ENCERRA o débito de write direto em colunas críticas** ·
> próximo bloco é Fase 1E (lifecycle filters / "Perdidos" na UI).

---

## 1 · Resumo executivo

**Resultado:** 3 métodos de repositório migrados de UPDATE direto para
chamada de RPC validada por matriz canônica:

| Método | Antes | Depois | RPC alvo |
|---|---|---|---|
| `LeadRepository.setPhase` | `.update({ phase })` direto | delega para `changePhase()` (RPC) | `sdr_change_phase` |
| `AppointmentRepository.cancel` | `.update({ status: 'cancelado', motivo_cancelamento, cancelado_em })` | delega para `changeStatus(id, 'cancelado', motivo)` + `getById` | `appointment_change_status` |
| `AppointmentRepository.markNoShow` | `.update({ status: 'no_show', motivo_no_show, no_show_em })` | delega para `changeStatus(id, 'no_show', motivo)` + `getById` | `appointment_change_status` |

| Métrica | Before | After |
|---|---|---|
| UPDATEs diretos em `leads.phase` | 1 | **0** ✅ |
| UPDATEs diretos em `appointments.status` (cancelado/no_show) | 2 | **0** ✅ |
| Métodos chamando matriz canônica DB | 1 (`changePhase`) + `changeStatus` | +3 (setPhase, cancel, markNoShow) |
| Typecheck `@clinicai/repositories` | OK | ✅ OK |
| Typecheck `@clinicai/lara` | OK | ✅ OK |
| Typecheck `@clinicai/ui` | OK | ✅ OK |

**Sem db push. Sem migration nova. Sem deploy. Sem alteração no schema do banco.**

---

## 2 · Estado local antes

```
Branch: main
HEAD: 03f4c1b · fix(crm): align lead phase types with database contract
origin/main: 03f4c1b  (== HEAD)
Working tree: limpo (apenas docs/crm-refactor/30 + edits Fase 1D pendentes)
```

---

## 3 · Writes diretos encontrados

### Grafo consultado antes de Read/Edit

```
$ graphify query "LeadRepository setPhase changePhase sdr_change_phase appointment_change_status cancel markNoShow"
→ 65 nodes (lead.repository) + 38 nodes (appointment.repository)
→ Confirmado:
  · LeadRepository.setPhase()    L192
  · LeadRepository.changePhase() L709 (RPC sdr_change_phase já wrappada)
  · AppointmentRepository.cancel()       L252 (UPDATE direto)
  · AppointmentRepository.markNoShow()   L272 (UPDATE direto)
  · AppointmentRepository.changeStatus() L386 (RPC appointment_change_status já wrappada)
```

### Tabela consolidada (write direto antes)

| # | Arquivo | Linha | Método | Bypass |
|---|---|---|---|---|
| 1 | `packages/repositories/src/lead.repository.ts` | 192-194 | `setPhase()` | `_lead_phase_transition_allowed` + `phase_history` |
| 2 | `packages/repositories/src/appointment.repository.ts` | 252-266 | `cancel()` | `_appointment_status_transition_allowed` |
| 3 | `packages/repositories/src/appointment.repository.ts` | 272-286 | `markNoShow()` | `_appointment_status_transition_allowed` |

### Callers identificados (varredura class-wide)

```
$ rg -n "\.setPhase\(|\.cancel\(|\.markNoShow\(" --glob '**/*.{ts,tsx}'
```

- `LeadRepository.setPhase()` → **zero callers de runtime** (apenas refs em docs 12 e 16 da Fase 0). Mantido com `@deprecated` por contrato público (assinatura preservada · regra Alden "preservar pública se em uso").
- `AppointmentRepository.cancel()` → 1 caller: `cancelAppointmentAction` ([appointment.actions.ts:119](apps/lara/src/app/crm/_actions/appointment.actions.ts#L119)).
- `AppointmentRepository.markNoShow()` → 1 caller: `markNoShowAction` ([appointment.actions.ts:157](apps/lara/src/app/crm/_actions/appointment.actions.ts#L157)).

`setLeadPhaseAction` ([leads/actions.ts:184](apps/lara/src/app/(authed)/leads/actions.ts#L184)) JÁ usava `repos.leads.changePhase()` (RPC) desde antes desta fase · apenas o comentário interno (que mencionava `reagendado`/`compareceu`) foi atualizado para refletir o contrato pós-Fase 1C.

---

## 4 · Alterações feitas

### 4.1 · `packages/repositories/src/lead.repository.ts:192`

```ts
// ANTES
async setPhase(leadId: string, phase: LeadPhase): Promise<void> {
  await this.supabase.from('leads').update({ phase }).eq('id', leadId)
}

// DEPOIS
/**
 * @deprecated Use `changePhase()` direto · setPhase hoje delega para a
 * RPC `sdr_change_phase` (Fase 1D · 2026-05-11), mas a assinatura
 * antiga foi preservada apenas por compatibilidade. NÃO faz UPDATE
 * direto mais · respeita matriz canônica + grava `phase_history`.
 */
async setPhase(leadId: string, phase: LeadPhase): Promise<void> {
  await this.changePhase(leadId, phase, 'repository_set_phase')
}
```

**Reason default:** `'repository_set_phase'` (preenche `phase_history.origin` com
sinal de que veio do helper compat).

**Doc-string de `changePhase()` (L709) também atualizado** para remover menção
obsoleta a `reagendado`/`compareceu` (derrogados na Fase 1C).

### 4.2 · `packages/repositories/src/appointment.repository.ts:252`

```ts
// ANTES
async cancel(id: string, motivo: string): Promise<AppointmentDTO | null> {
  if (!motivo || !motivo.trim()) return null
  const { data, error } = await this.supabase
    .from('appointments')
    .update({
      status: 'cancelado',
      motivo_cancelamento: motivo.trim(),
      cancelado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .select(APPT_COLUMNS)
    .single()
  if (error || !data) return null
  return mapAppointmentRow(data)
}

// DEPOIS
async cancel(id: string, motivo: string): Promise<AppointmentDTO | null> {
  if (!motivo || !motivo.trim()) return null
  const result = await this.changeStatus(id, 'cancelado', motivo.trim())
  if (!result.ok) return null
  return this.getById(id)
}
```

**RPC `appointment_change_status` (mig 72)** já preenche `cancelado_em`,
`motivo_cancelamento`, `updated_at` server-side (linhas 179-185 da mig).
Validação de reason mínima (2 chars) também já é feita server-side.

### 4.3 · `packages/repositories/src/appointment.repository.ts:272`

```ts
// ANTES
async markNoShow(id: string, motivo: string): Promise<AppointmentDTO | null> {
  if (!motivo || !motivo.trim()) return null
  const { data, error } = await this.supabase
    .from('appointments')
    .update({
      status: 'no_show',
      motivo_no_show: motivo.trim(),
      no_show_em: new Date().toISOString(),
    })
    ...
}

// DEPOIS
async markNoShow(id: string, motivo: string): Promise<AppointmentDTO | null> {
  if (!motivo || !motivo.trim()) return null
  const result = await this.changeStatus(id, 'no_show', motivo.trim())
  if (!result.ok) return null
  return this.getById(id)
}
```

**Idem cancel:** RPC preenche `no_show_em`, `motivo_no_show`, `updated_at`
server-side (linhas 186-192 da mig 72).

### 4.4 · `apps/lara/src/app/(authed)/leads/actions.ts:180` (comentário)

Comentário interno do `setLeadPhaseAction` atualizado para refletir contrato
pós-Fase 1C (4 phases, perda via `lead_lost`).

---

## 5 · RPCs usadas (todas pré-existentes)

| RPC | Source | Validações server-side |
|---|---|---|
| `sdr_change_phase(uuid, text, text)` | mig 65 | matriz `_lead_phase_transition_allowed` · grava `phase_history` · grant authenticated/service_role |
| `appointment_change_status(uuid, text, text)` | mig 72 | matriz `_appointment_status_transition_allowed` · timestamps server-side · reason min 2 chars · bloqueia `na_clinica`/`finalizado` (use RPCs dedicadas) · grant authenticated/service_role |

Nenhuma migration nova foi criada. Nenhuma RPC alterada. Nenhum GRANT versionado.

---

## 6 · Ocorrências restantes (zero criticas)

### Grep `\.from\('leads'\)\.update\(\{[^}]*phase\b` em `packages/`

```
packages/repositories/src/lead.repository.js:111  ← build output (gitignored)
```

✅ Zero hits em `.ts` runtime. O `.js` é build output `.gitignored` (`.gitignore:31 packages/*/src/**/*.js`) · regenera no próximo build.

### Grep `\.from\('appointments'\)\.update\(\{[^}]*status\b` em `packages/`

```
(zero matches em *.ts)
```

✅ Zero hits.

### Grep `status: 'cancelado'|status: 'no_show'` em `packages/**/*.ts`

```
(zero matches)
```

✅ Zero literais de status crítico em UPDATE direto.

### O que permanece (justified)

- `softDelete(id)` em ambos repos · usa `.update({ deleted_at })` · OK, não é status crítico (escopo doc 16 § 7)
- `setTemperature`, `setFunnel`, `updateScore`, `addTags`, etc · campos não-críticos (não passam por matriz) · OK
- `update(id, fields)` genérico do `LeadRepository` · não toca `phase` (filtra explicitamente)

---

## 7 · Checks executados

### Typecheck

| Pacote | Comando | Resultado |
|---|---|---|
| `@clinicai/repositories` | `pnpm --filter @clinicai/repositories run typecheck` | ✅ PASS |
| `@clinicai/lara` | `pnpm --filter @clinicai/lara run typecheck` | ✅ PASS |
| `@clinicai/ui` | `npx tsc --noEmit` (sem script) | ✅ PASS (exit=0) |

### git diff --check

```
$ git diff --check
(zero warnings)
exit=0
```

### Working tree pós-edit

```
$ git status --short
 M apps/lara/src/app/(authed)/leads/actions.ts
 M packages/repositories/src/appointment.repository.ts
 M packages/repositories/src/lead.repository.ts
```

3 arquivos modificados · diff total: ~25 linhas líquidas removidas (deletadas
~40 linhas de UPDATE direto + adicionadas ~15 linhas delegando para RPCs).

---

## 8 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| `setPhase` agora pode falhar silenciosamente em matriz inválida (era silent OK antes) | Baixa | Zero callers em runtime · sinalizado `@deprecated` · `phase_history` registra ausência se mantriz rejeitar |
| `cancel`/`markNoShow` agora fazem 2 round-trips (RPC + getById) | Baixa | +1 SELECT por cancel é desprezível · ganho de validação server-side compensa |
| RPC `appointment_change_status` poderia rejeitar transições antes permitidas via UPDATE direto (ex: `finalizado → cancelado`) | Média | Comportamento DESEJADO · matriz canônica enforced. UI deve mostrar erro. Caller decide se quer soft-delete em vez de cancel. |
| Caller espera DTO completo mas RPC + getById retorna null se algo der errado | Baixa | Idêntico ao comportamento antigo (UPDATE direto também retornava null em erro) |

---

## 9 · Próximo passo recomendado

**Fase 1E · Lifecycle filters / "Perdidos" na UI** (doc 30 §6):

1. Estender `ListLeadsFilter` com `lifecycleStatus?` + `excludeLifecycleStatuses?`
2. Adicionar handling em `LeadRepository.list()` `applyFilters`
3. Mapear `leads.lifecycle_status` em `LeadDTO`
4. Re-adicionar chip "Perdidos" em `LeadFiltersPanel.STATUS` (status='archived')
5. Mapear `buildFilter` em `/leads/page.tsx` para usar lifecycle_status
6. (Bonus) Adicionar filtro por `lifecycle_status='perdido'` em campanhas (recuperação)

---

## 10 · Confirmações negativas

- ❌ Zero `supabase db push`
- ❌ Zero `supabase migration up`
- ❌ Zero `supabase migration repair`
- ❌ Zero migration nova criada
- ❌ Zero alteração de schema do banco
- ❌ Zero deploy
- ❌ Zero edit em UI além do comentário obsoleto em `setLeadPhaseAction`

---

## 11 · Histórico

- **2026-05-11:** Fase 1D executada com autorização explícita de Alden
- **Grafo:** consultado antes de qualquer Read · regra inviolável respeitada
- **Latência total:** ~5min · 3 arquivos · zero conflict
- **Falhas typecheck:** 0
- **Commit alvo:** `fix(crm): route phase and appointment status writes through RPCs`
- **Fase 1D RPC write hardening · ENCERRADA** ✅
