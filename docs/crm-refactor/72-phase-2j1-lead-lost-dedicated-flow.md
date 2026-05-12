# CRM_PHASE_2J.1 · Dedicated Lead Lost Flow

> **Data:** 2026-05-12
> **Status:** Backend já estava 100% pronto · só UI nova · zero migration
> **HEAD inicial:** `49c78ad` · HEAD final esperado: commit local 2J.1
> **Verdict alvo:** `PASS_CRM_PHASE_2J1_LEAD_LOST_READY_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Fluxo dedicado "Marcar como perdido" no detalhe do appointment · separa **perda comercial** (lifecycle) de **finalização clínica** (phase). UI nova consome RPC `lead_lost` que já existia, repository method `markLost` que já existia e action `markLeadLostAction` que já existia. **Zero migration** · só UI.

Achado: o sistema já tinha contrato canônico completo (RPC + audit em `phase_history` + denormalization em `perdidos` table). A fase 2J removeu `perdido` do `FinalizeWizard` deixando o fluxo órfão na UI. 2J.1 entrega a porta de entrada operacional.

---

## 2 · Por que `perdido` saiu da finalização

Decisão tomada em 2J (commit `67cd50a`):

- **`perdido` é lifecycle comercial** (`leads.lifecycle_status`)
- **`paciente`/`orcamento`/`paciente_orcamento` são phase clínica** (`leads.phase` via `appointment_finalize`)
- Misturar os dois no `FinalizeWizard` confunde semântica · paciente que "virou perdido" tem `phase='paciente'` + `lifecycle='perdido'` (manteve histórico clínico mas saiu da fila ativa)
- Auditoria diferente: perdido vai para `perdidos` table + `phase_history.origin='lifecycle'` · paciente/orcamento vão para `lead_to_*` RPCs + `phase_history.origin='clinical'`

2J.1 entrega o caminho operacional dedicado para a perda comercial.

---

## 3 · Contrato correto

| Aspecto | Valor |
|---|---|
| Trigger | UI botão "Marcar como perdido" no detalhe do appointment (lead-linked) |
| RPC chamada | `public.lead_lost(p_lead_id uuid, p_reason text)` |
| Tipo de mudança | `lifecycle_status` de `ativo` → `perdido` |
| Phase | **PRESERVADA** (não vira `'perdido'` · `phase='perdido'` é regressão) |
| Reason | Obrigatório (mínimo 1 char no RPC · UI compõe label + observação) |
| Idempotência | Mesmo lifecycle+reason retorna `idempotent_skip=true` |
| Audit | Insert em `phase_history (origin='lifecycle', triggered_by='rpc:lead_lost')` |
| Denormalization | Insert em `perdidos` table (para queries de recovery) |
| Paciente | **NÃO cria** |
| Orçamento | **NÃO cria** |
| wa_outbox | **NÃO toca** |
| Appointment | **NÃO toca** (mantém status atual) |

---

## 4 · Auditoria RPC

[`public.lead_lost(p_lead_id uuid, p_reason text)`](packages/repositories/src/lead.repository.ts):

```sql
-- Resumo do corpo (verificado em fase 2J.1):
1. app_clinic_id() tenant guard
2. reason_required check
3. SELECT ... FOR UPDATE (lock pessimista)
4. Idempotency: mesma reason → skip
5. UPDATE leads SET lifecycle_status='perdido', lost_from_phase=phase,
                    lost_reason, lost_at=now(), lost_by=auth.uid(),
                    phase_updated_*, phase_origin='rpc:lifecycle'
   (phase PRESERVADA)
6. INSERT phase_history (from=to=current phase, origin='lifecycle',
                          triggered_by='rpc:lead_lost', reason)
7. INSERT perdidos (id, lead_id, snapshot name/phone/email, lost_*,
                    is_recoverable=true)
   ON CONFLICT (id) DO UPDATE (idempotente também na denormalization)
8. RETURN {ok, lead_id, phase, lifecycle_status='perdido', lost_from_phase}
```

**SECURITY DEFINER · search_path='public,extensions,pg_temp' · GRANT EXECUTE authenticated+service_role**.

---

## 5 · Banco / Migration

**ZERO migration criada nesta fase.** RPC + audit + denormalization já existem desde rounds anteriores (mig 65 ou anterior). Schema `wa_message_templates` ou outras tabelas: zero alteração.

Coluna `leads.lifecycle_status` aceita: `ativo, perdido, recuperacao, arquivado` (CHECK existente).
Coluna `leads.lost_from_phase` aceita: `lead, agendado, paciente, orcamento` (CHECK existente).

---

## 6 · Backend / actions

### 6.1 · Repository (já existia)

[packages/repositories/src/lead.repository.ts](../../packages/repositories/src/lead.repository.ts) · método `markLost(leadId, reason)` linha 657. Zero mudança.

### 6.2 · Zod schema (já existia)

[apps/lara/src/app/crm/_schemas/lead.schemas.ts](../../apps/lara/src/app/crm/_schemas/lead.schemas.ts) · `MarkLeadLostSchema` linha 130:

```ts
{ leadId: uuid, reason: string (min 2, max 500) }
```

Zero mudança.

### 6.3 · Server action (já existia)

[apps/lara/src/app/crm/_actions/lead.actions.ts](../../apps/lara/src/app/crm/_actions/lead.actions.ts) · `markLeadLostAction` linha 208. Zero mudança.

---

## 7 · UI entregue

### 7.1 · Page (server)

[apps/lara/src/app/crm/agenda/[id]/page.tsx](../../apps/lara/src/app/crm/agenda/[id]/page.tsx):
- Calcula `canMarkLeadLost` server-side baseado em:
  - `lead != null`
  - `lead.lifecycleStatus === 'ativo'` (não já perdido)
  - `lead.phase !== 'paciente'` (não já promovido)
  - `!actionFlags.isTerminal` (appointment não terminal)
- Passa flag + `leadId` para `AppointmentActions`

### 7.2 · Actions bar (client)

[apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx](../../apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx):
- Botão novo "Marcar como perdido" (ícone `UserX` lucide) · variant outline
- Visível só quando `canMarkLeadLost && leadId`
- Abre `LeadLostModal`

### 7.3 · LeadLostModal

Modal com 3 partes:
1. **Alert amarelo informativo:** "perdido é status comercial, não clínico · isto move o lead para Recuperação e remove da fila ativa · histórico/anamnese/consent permanecem intactos"
2. **Select motivo** com 7 opções predefinidas:
   - `sem_resposta` · Sem resposta
   - `preco` · Preço acima do orçamento
   - `desistiu` · Desistiu / não quer mais
   - `sem_interesse` · Não tinha interesse real
   - `reagendara_futuro` · Reagendará no futuro
   - `fora_perfil` · Fora do perfil da clínica
   - `outro` · Outro motivo (observação obrigatória)
3. **Textarea observação:**
   - Opcional para 6 reasons
   - **Obrigatória** quando `reason='outro'` (validação client-side: min 2 chars)
   - Max 500 chars

**String final para RPC:**
- Com observação: `"{label}: {notes}"`
- Sem: apenas `label`

Reset automático on close (useEffect).

### 7.4 · Toast

- Success: "Lead marcado como perdido · fora da fila ativa (histórico preservado)"
- Failure: `fromResult(r)` propaga erro do action

---

## 8 · Smoke transacional · resultado

```
SMOKE_RESULT_2J1:
  baseline: worker71_off=true, leads_perdido_phase=0, leads_perdido_lifecycle=0,
            perdidos_total=9

  TESTE A · Lead ativo perdido (happy path):
    result.ok: true
    result.lifecycle_status: 'perdido' ✅
    result.phase: 'lead' (preservada) ✅
    result.lost_from_phase: 'lead' ✅
    phase_after: 'lead' (NÃO 'perdido') ✅
    lifecycle_after: 'perdido' ✅
    has_lost_at: true ✅
    phase_history_rows: 1 (audit registrado) ✅
    perdidos_rows: 1 (denormalization) ✅
    phase_preserved: true ✅
    lifecycle_changed: true ✅
    phase_NOT_perdido: true ✅ (regressão evitada)

  TESTE B · Sem motivo:
    ok: false
    error: 'reason_required' ✅

  TESTE C · Idempotência (segunda chamada com mesma reason):
    ok: true
    idempotent_skip: true ✅
    lifecycle_status: 'perdido' (inalterado)

  TESTE D · Lead já paciente · RPC permite (UI bloqueia):
    result.ok: true
    lifecycle_after: 'perdido'
    phase_after_preserved: 'paciente' ✅ (phase clínica intocada)
    Nota: UI bloqueia via canMarkLeadLost=false quando phase='paciente'
    Defesa em profundidade: UI primária · RPC backward-compat permissivo

  worker71_off_still: true ✅
  wa_outbox_delta: 0 ✅
```

ROLLBACK forçado · zero dado persistente.

[Arquivo smoke](sql/phase-2j1-lead-lost-dedicated-flow-smoke.sql) | [Validation](sql/phase-2j1-lead-lost-dedicated-flow-validation.sql)

---

## 9 · Validation flags esperadas

| Flag | Esperado |
|---|---|
| worker71_off | true |
| lead_lost_fn_ready | true |
| lead_lost_signature_includes_reason | true |
| phase_perdido_count | **0** (regressão = >0) |
| lifecycle_perdido_count | 0+ (depende de uso) |
| lifecycle_perdido_without_reason | 0 (RPC sempre exige) |
| lifecycle_perdido_without_ts | 0 (RPC sempre seta now()) |
| lost_contract_ready | true |
| unsafe_outbox_count | 0 |
| **can_continue** | **true** |

---

## 10 · Riscos residuais

1. **Lead paciente pode ter `lifecycle_status='perdido'` via RPC direto** · não bypassa pela UI (canMarkLeadLost=false), mas service_role/scripts ainda podem. Comportamento intencional: cliente comercial pode "abandonar" mesmo após virar paciente (paciente recorrente que parou de comparecer). Audit registra `lost_from_phase='paciente'`.

2. **Reason composta no UI vs raw no RPC** · UI manda `"Sem resposta: details"` para RPC que aceita qualquer string. Audit em `phase_history.reason` armazena composição completa. Parsing posterior é trivial via split por `:`.

3. **`perdidos` table denormaliza:** snapshot de name/phone/email no momento da perda. Se lead mudar nome/contato depois, denormalization fica stale. Comportamento esperado (Recovery flow deve checar `leads` para dados atuais).

4. **Sem mutex global:** dois usuários clicando simultaneamente "Marcar como perdido" no mesmo lead · RPC tem FOR UPDATE lock + idempotency · segundo retorna skip. Sem race condition.

5. **Sem UI no card do lead (`/crm/leads/[id]`)** · esta fase entrega só no appointment detail. Lead card sem appointment vinculado ainda não tem botão. Pode ser estendido em fase futura (escopo curto · 5 min).

---

## 11 · Rollback

`git revert <commit>` cobre toda a UI nova. Zero migration · zero ajuste DB. RPC `lead_lost` continua existente e funcional.

Para reverter dados (se necessário · ex: marcou perdido por engano):
```sql
-- ⚠️  uso administrativo · não há UI de "desmarcar perdido"
UPDATE public.leads
   SET lifecycle_status = 'ativo',
       lost_from_phase = NULL,
       lost_reason = NULL,
       lost_at = NULL,
       lost_by = NULL,
       updated_at = now()
 WHERE id = '<lead_uuid>' AND lifecycle_status = 'perdido';

-- Audit · marcar reversão
INSERT INTO public.phase_history (clinic_id, lead_id, from_phase, to_phase,
                                   origin, triggered_by, actor_id, reason)
SELECT clinic_id, id, phase, phase, 'lifecycle', 'manual:revert_lost',
       '<admin_uid>', 'Reversão de marca perdido por admin'
  FROM public.leads WHERE id = '<lead_uuid>';
```

---

## 12 · Próxima fase

Consultar [73-next-prompt-after-2j1.md](73-next-prompt-after-2j1.md):

1. **2H.1** · Cleanup zumbis status (`em_consulta`/`pre_consulta`/`compareceu`/`reagendado`)
2. **2AUX** · Modal agendamento completo (wizard rich)
3. **2R.2** · No-show/cancelamento/remarcação refinement
4. **2RC** · Recuperação comercial (consume `perdidos` table)
5. **2L.2.1** · Template approval mirror (gated por Meta readiness)
