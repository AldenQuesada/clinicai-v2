# 16 · Phase 1D · RPC write hardening plan

> **Status:** plano (não-executado nesta fase)
> **Pré-requisito:** Fase 1A (mig 150) + Fase 1C (TS↔DB sync) entregues
> **Objetivo:** trocar todos os UPDATEs diretos em colunas críticas por chamadas a RPC, garantindo que matriz/audit/eventos sejam respeitados em 100% dos paths

---

## 1 · Contexto

A auditoria identificou 3 mutações diretas em colunas críticas que bypassam as matrizes server-side existentes no banco:

- `_lead_phase_transition_allowed(from, to)` (existe)
- `_appointment_status_transition_allowed(from, to)` (existe)

Mutações diretas via `.from('tabela').update(...)` no Supabase client funcionam (RLS permite), mas:

- Não validam transição contra matriz
- Não registram `phase_history`
- Não disparam audit colateral
- Permitem estados ilegais silenciosamente (`finalizado → cancelado`, `perdido → lead direto`, etc)

Este doc lista as 3 mutações identificadas + plano de refactor.

---

## 2 · Mutações identificadas

### 2.1 · `LeadRepository.setPhase()` · phase via UPDATE direto

**Arquivo:** `packages/repositories/src/lead.repository.ts`
**Linha aprox.:** ~193 (definição) e 195 (`.update({ phase })`)

**Código atual:**
```ts
/**
 * Atualiza phase direto · NAO registra phase_history. Use changePhase()
 * (RPC sdr_change_phase) quando precisar do audit trail.
 */
async setPhase(leadId: string, phase: LeadPhase): Promise<void> {
  await this.supabase.from('leads').update({ phase }).eq('id', leadId)
}
```

**Problemas:**
- Bypassa `_lead_phase_transition_allowed` (DB rejeitará valores fora dos 4 phases válidos via CHECK, mas não valida matriz from→to)
- Não registra `phase_history` (audit hole)
- Comentário admite o problema mas mantém o método "para usos sem audit"
- Probe não encontrou consumer atual real · candidato a **DELETAR**

**Correção futura (Fase 1D):**

**Opção A · Deletar o método (recomendado).** Forçar todos os callers a usar `changePhase()` que chama RPC `sdr_change_phase`.

```ts
// Remover método setPhase. Adicionar JSDoc deprecation se quiser sinalizar:
// @deprecated use changePhase() — preserva matriz + phase_history
```

**Opção B · Reimplementar via RPC.**

```ts
async setPhase(leadId: string, phase: LeadPhase, reason = 'manual_update'): Promise<void> {
  const { error } = await this.supabase.rpc('sdr_change_phase', {
    p_lead_id: leadId,
    p_to_phase: phase,
    p_reason: reason,
  })
  if (error) throw error
}
```

**Risco:** baixo. Probe não encontra consumer no `apps/lara/src` (grep `setPhase\(` retornará uses do tipo TS, não do método). Confirmar antes de deletar.

**Teste:**
- Grep `\.setPhase\(` em `apps/lara/src` + `packages/*`
- Se zero hits ativos: deletar
- Se hits: refatorar caller para usar `changePhase()`
- Unit test em `lead.repository.spec.ts`: assert `setPhase` lança erro de matriz quando transição ilegal

---

### 2.2 · `AppointmentRepository.cancel()` · status='cancelado' direto

**Arquivo:** `packages/repositories/src/appointment.repository.ts`
**Linha aprox.:** ~252-266

**Código atual:**
```ts
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
```

**Problemas:**
- Bypassa `_appointment_status_transition_allowed` matrix
- Pode cancelar appointment `finalizado` (ilegal pela matriz)
- `appointment_change_status` RPC existe no banco · cobre essa transição com validação
- `cancelado_em` é set client-side · servidor poderia preencher

**Correção futura · achado pelo grafo:** `AppointmentRepository` já tem `.changeStatus()` em L386 (wrapper de RPC `appointment_change_status` com matriz). Não criar chamada `supabase.rpc()` duplicada · reusar o método irmão.

```ts
async cancel(id: string, motivo: string): Promise<AppointmentDTO | null> {
  if (!motivo || !motivo.trim()) return null
  const result = await this.changeStatus(id, 'cancelado', motivo.trim())
  if (!result.ok) return null
  // Re-fetch o appt para retornar DTO completo (changeStatus retorna RpcResult tipado)
  return this.getById(id)
}
```

**Risco:** baixo. Reusa método já validado. `getById` pra preservar contrato de retorno (DTO completo). Trade-off: 1 RPC + 1 SELECT em vez de 1 UPDATE+RETURNING.

**Teste:**
- Unit test: assert `cancel()` retorna `null` quando matriz rejeita (ex: appt já `finalizado`)
- E2E manual: cancelar appt na agenda · confirmar `motivo_cancelamento`/`cancelado_em` preenchidos server-side pela RPC (não mais client-side)
- Probe SQL prévia (opcional): `SELECT pg_get_functiondef('appointment_change_status'::regproc)` para confirmar que RPC seta `motivo_cancelamento` quando `new_status='cancelado'`

---

### 2.3 · `AppointmentRepository.markNoShow()` · status='no_show' direto

**Arquivo:** `packages/repositories/src/appointment.repository.ts`
**Linha aprox.:** ~272-289

**Código atual:**
```ts
async markNoShow(id: string, motivo: string): Promise<AppointmentDTO | null> {
  if (!motivo || !motivo.trim()) return null
  const { data, error } = await this.supabase
    .from('appointments')
    .update({
      status: 'no_show',
      motivo_no_show: motivo.trim(),
      no_show_em: new Date().toISOString(),
    })
    .eq('id', id)
    .select(APPT_COLUMNS)
    .single()
  if (error || !data) return null
  return mapAppointmentRow(data)
}
```

**Problemas:**
- Idem `cancel()` · bypassa matriz appt
- `no_show_em` set client-side

**Correção futura · idem cancel():**

```ts
async markNoShow(id: string, motivo: string): Promise<AppointmentDTO | null> {
  if (!motivo || !motivo.trim()) return null
  const result = await this.changeStatus(id, 'no_show', motivo.trim())
  if (!result.ok) return null
  return this.getById(id)
}
```

**Risco:** mesmo que `cancel()`. Confirmar (via probe SQL) que RPC `appointment_change_status` preenche `motivo_no_show` quando `p_new_status='no_show'` (não `motivo_cancelamento`).

**Teste:** análogo a 2.2.

---

## 3 · Tabela consolidada

| # | Arquivo | Linha | Método | UPDATE direto | RPC alvo | Risco |
|---|---|---|---|---|---|---|
| 1 | `packages/repositories/src/lead.repository.ts` | ~193 | `setPhase()` | `update({ phase })` | `sdr_change_phase` (ou deletar) | Baixo |
| 2 | `packages/repositories/src/appointment.repository.ts` | ~252 | `cancel()` | `update({ status: 'cancelado', motivo_cancelamento, cancelado_em })` | `appointment_change_status` | Médio |
| 3 | `packages/repositories/src/appointment.repository.ts` | ~272 | `markNoShow()` | `update({ status: 'no_show', motivo_no_show, no_show_em })` | `appointment_change_status` | Médio |

---

## 4 · Não está nesta fase (bonus a considerar)

### 4.1 · `lead_to_paciente` e `lead_to_orcamento` RPCs (Q1 do doc 11)

Sob a nova doutrina ADR `single-table` (doc 14), essas RPCs precisam ser refatoradas para **não soft-deletar `leads`** na transição. Não é fase 1D estrita — é a parte funcional da Fase 1D que decorre da decisão Q1.

**Plano:**
- Inspecionar RPC atual via `pg_get_functiondef('lead_to_paciente'::regproc)`
- Reescrever (mig nova · provavelmente 151) para:
  - Set `phase='paciente'`
  - INSERT em `patients` apenas se ainda não existir com `id=lead.id`
  - **NÃO** fazer `UPDATE leads SET deleted_at = now()`
  - Registrar `phase_history`
- Mesma reforma para `lead_to_orcamento`

**Risco:** médio-alto. Toca contrato canônico do core CRM.

### 4.2 · `lead.repository.ts` outras mutations não-críticas

- `setTemperature` (linha ~200) · não vai pra matriz · OK manter direto
- `setFunnel` (linha ~159) · não vai pra matriz · OK manter direto
- `updateScore` (linha ~105) · idem
- `addTags`/`removeTags`/`toggleTag` (deprecated cols) · serão removidas na Fase 7

Estas não estão no escopo da Fase 1D.

### 4.3 · `lead_to_perdidos` e `perdido_to_lead` RPCs legadas

Existem no banco mas Lara v2 deve preferir `lead_lost` + `lead_recovery_activate`. Não dropar — deixar para Fase 7. Lara v2 hoje já não chama essas RPCs.

---

## 5 · Ordem de execução recomendada (Fase 1D)

1. **Pré-requisito:** Fase 1A (mig 150) + Fase 1C (TS sync) entregues
2. **Probe SQL** das RPCs alvo:
   - `pg_get_functiondef('appointment_change_status'::regproc)`
   - `pg_get_functiondef('sdr_change_phase'::regproc)`
   - `pg_get_functiondef('lead_to_paciente'::regproc)` (para Q1 cleanup)
   - `pg_get_functiondef('lead_to_orcamento'::regproc)`
3. Refatorar 3 mutações:
   - `setPhase()` (deletar ou via RPC)
   - `cancel()` via `appointment_change_status`
   - `markNoShow()` via `appointment_change_status`
4. Unit tests + E2E manual
5. (Q1 cleanup) Refatorar `lead_to_paciente`/`lead_to_orcamento` RPCs em mig nova (151)
6. Update repos para deixar de filtrar `deleted_at` em queries operacionais
7. Confirmar `phase_history` recebe rows nas transições

---

## 6 · Critério de aceite Fase 1D

- [ ] Grep `\.from\('leads'\)\.update\(\{[^}]*phase` em `packages/repositories` retorna zero hits
- [ ] Grep `\.from\('appointments'\)\.update\(\{[^}]*status` em `packages/repositories` retorna zero hits (exceto `softDelete` que mexe em `deleted_at`)
- [ ] Cada caller agora chama RPC equivalente · validada por unit test
- [ ] `phase_history` registra row a cada transição feita via Lara v2 nova
- [ ] Smoke test: cancelar appt na UI · ver audit · ver status persistido · sem erro
- [ ] Q1 cleanup: `lead_to_paciente` não seta `deleted_at` (verificar com `SELECT prosrc FROM pg_proc WHERE proname='lead_to_paciente'`)

---

## 7 · Não fazer nesta fase

- ❌ Não dropar `setPhase` sem confirmar zero consumers ativos
- ❌ Não tocar `setTemperature`, `setFunnel`, `updateScore`, `addTags` (não-críticos)
- ❌ Não tocar `softDelete` no AppointmentRepository (correto, lida com `deleted_at`)
- ❌ Não tocar `clinic-dashboard` v1 ou `apps/lara/public/legacy/**`
- ❌ Não criar RPCs novas além de `lead_archive`/`lead_unarchive` (Fase 2)
