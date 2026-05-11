# 08 · Legacy Audit

> Auditoria dos termos/práticas proibidos pelo contrato-alvo. Estado em 2026-05-10.

---

## 1 · Termos do contrato proibidos no DB do alvo

| Termo | Local hoje | Status |
|---|---|---|
| `compareceu` | `chk_leads_phase` (válido); `_lead_phase_transition_allowed` matriz; `appointment_attend` RPC; UI modal de finalização | ✅ Funcionando · ❌ alvo elimina |
| `reagendado` (como phase) | `chk_leads_phase`; matriz; UI; appointment.status também tem `remarcado` | ✅ Funcionando · ❌ alvo move só pra appointment.status |
| `pre_consulta`, `em_consulta` (appointment.status) | `chk_appt_status` (válidos) | ❌ alvo consolida em `em_atendimento` |
| `perdido` (como phase) | `chk_leads_phase`; matriz; `lead_lost` RPC | ✅ Funcionando · ❌ alvo é só lifecycle |
| `attending`, `converted` | Grep zero | ✅ Limpo (nunca existiram ou removidos) |
| `deleted_at` em movimentação operacional | ADR-001 modelo excludente · usa quando lead vira paciente/orcamento | ⚠️ **Conflito direto com contrato alvo** |

### 1.1 · Ocorrências de cada termo

#### `compareceu`

| Local | Tipo | Risco |
|---|---|---|
| mig 60 + mig 103 | CHECK constraint | ✅ esperado |
| mig 65 (matriz) | RPC | ✅ esperado |
| `apps/lara/src/app/crm/_actions/lead.actions.ts` | indireto (chama RPC) | ✅ |
| Modal de finalização (UI) | botões "marcar como compareceu" | ⚠️ alvo precisa de novo fluxo |
| `clinic-dashboard/js/agenda-smart.finalize.js` | legacy JS · pode mutar direto | 🟡 confirmar não escreve `.update(phase=...)` |

#### `reagendado`

| Local | Tipo | Risco |
|---|---|---|
| mig 60 + mig 103 | CHECK leads.phase | ✅ |
| mig 65 matriz | permite `agendado ↔ reagendado` | ✅ |
| `clinic-dashboard/legacy agenda-modal.js` | UI usa termo | 🟡 |

#### `pre_consulta` / `em_consulta`

| Local | Tipo |
|---|---|
| mig 103 chk_appt_status | apenas no enum |
| ZERO uso em UI atual (grep limpo) | ✅ |

Likely dead enum. Remover em refactor.

#### `attending` / `converted`

Grep retornou ZERO em ambos os repos. ✅ **Limpos.** Provavelmente nunca foram usados ou foram removidos antes de Abril.

#### `perdido` (como phase)

| Local | Risco |
|---|---|
| mig 60 + 103 CHECK | ✅ esperado |
| mig 65 matriz + RPC `lead_lost` | ✅ esperado |
| `clinic-dashboard/js/ui/funnel-automations/modules/perdido.module.js` | legado · status incerto · auditar se ainda escreve |

---

## 2 · `deleted_at` como mecanismo de movimentação operacional

**Casos em que `deleted_at` é setado:**

| Local | Razão | Conflito com alvo? |
|---|---|---|
| `LeadRepository.softDelete()` | Soft-delete admin (excluir lead) | ✅ Uso legítimo · alvo permite |
| `LeadRepository.toPaciente()` → RPC `lead_to_paciente` | Modelo excludente · move pra patients | ❌ **PROIBIDO no alvo** |
| `LeadRepository.toOrcamento()` → RPC `lead_to_orcamento` | Modelo excludente · move pra orcamentos | ❌ **PROIBIDO no alvo** |
| `LeadRepository.restore()` | Undo soft-delete (exclusão) | ✅ Uso legítimo |
| `AppointmentRepository.softDelete()` | Cancelar definitivamente | ✅ Uso legítimo (appt) |
| `OrcamentoRepository.softDelete()` | Excluir orçamento | ✅ Uso legítimo (orcamento · não é lead) |
| `PatientRepository.softDelete()` | Excluir paciente | ✅ |

**O conflito é ADR-001.** Alvo pede single-table com `phase='paciente'`. Decisão arquitetural pendente · pode requerer:
- Backfill: para cada paciente atual, criar row em leads (se não existe) com `phase='paciente'`
- Drop ou freeze de `public.patients` (?)
- ou versão híbrida: leads canonical para mesa/contadores, patients permanece para dados clínicos específicos

---

## 3 · Mutations diretas em CRM (sem RPC) — débito

### Em Lara v2 (clinicai-v2)

| Local | Tabela | Operação | Severidade |
|---|---|---|---|
| `appointment.repository.cancel()` | appointments | `UPDATE status='cancelado'` | 🟡 sem matriz · ok hoje (CHECK valida valores · não transição) |
| `appointment.repository.markNoShow()` | appointments | `UPDATE status='no_show'` | 🟡 idem |
| `appointment.repository.update()` | appointments | `UPDATE` campos | ✅ ok (edição genérica) |
| `appointment.repository.softDelete()` | appointments | `UPDATE deleted_at` | ✅ ok |
| `lead.repository.update*()` (vários) | leads | `UPDATE` campos não-críticos (name, score, temperature) | ✅ ok |
| `lead.repository.softDelete()` | leads | `UPDATE deleted_at` | ✅ admin only |
| `orcamento.repository.update*()` | orcamentos | UPDATE | ✅ ok |

**ZERO mutations diretas em phase ou lost_* fora de RPCs.** ✅

### Em clinic-dashboard legacy (vanilla JS)

| Arquivo | Problema | Severidade |
|---|---|---|
| `js/repositories/appointments.repository.js` | `.from('appointments').update()` direto | 🔴 P1 (pode violar matriz futura) |
| `js/components/lead-modal.js` | Mutations via localStorage + UPDATE | 🔴 P0 (stale data perpétuo) |
| `js/sdr/sdr.repository.js` | Mix de RPC + UPDATE direto | 🟡 P2 |
| `js/services/sdr.service.js` | Manipula tags em vez de coluna `temperature` | 🟡 |
| Outros vários | `.update()` espalhados | 🟡 |

---

## 4 · localStorage como fonte operacional (legado)

Em **Lara v2**: nenhum uso operacional (vide doc 07 seção 4). ✅

Em **clinic-dashboard legacy**:

| Arquivo | Chave | Uso | Risco |
|---|---|---|---|
| `js/agenda-leads.js` | `_apptKey()` | Cache de appointments · `getAppointments()` lê localStorage primeiro | 🔴 stale perpétuo |
| `js/anamnese-core.js` | `clinicai_lead_patient_map` | Mapa lead_id→patient_id (wizard anamnese) | 🔴 paciente_id stale |
| `js/sdr.js` | `clinicai_sdr_config` | Período + responsável pref | 🟡 KPIs errados |
| `js/components/leads-table.js` | `clinicai_leads` | Leads list cache | 🔴 contadores erram |
| `js/dashboard-birthdays.js` | `clinicai_leads` | Re-leitura mesmo cache | 🔴 propagação |

---

## 5 · Contadores client-side (sub-amostrados)

Padrão antigo: `.filter().length` sobre array paginado (max 50) → subestima contagens reais.

| Local | Risco |
|---|---|
| `clinic-dashboard/sdr.js` `getAppointments().filter(r=>responsible=='X').length` | 🔴 |
| `clinic-dashboard/leads-table.js` badge "3 leads aguardando" | 🔴 fix paliativo 2026-05-07 |
| Lara v2 `useSecretariaKpis()` | ✅ server-side COUNT |

**Recomendação alvo:** TUDO via `crm_operational_view` + COUNT no DB.

---

## 6 · Triggers/RPCs que movimentam funil sem matriz

| Item | Status |
|---|---|
| `_lead_phase_transition_allowed` (matriz leads) | ✅ existe |
| `_appointment_status_transition_allowed` (matriz appointments) | ❌ NÃO existe |
| `appointment_finalize` | ✅ usa matriz lead-side · não tem matriz appointment-side |
| `appointment.repository.cancel/markNoShow` | ⚠️ UPDATE direto · sem matriz |
| `clinic-dashboard/legacy` | ⚠️ pode escrever fora da matriz |

---

## 7 · Views divergentes

| View | Status | Risco |
|---|---|---|
| `vw_leads_funnel_legacy` | grep zero | ✅ |
| `budgets` (compat) | apontando para `orcamentos` (mig 755) | ✅ |
| `leads_list_*` (várias) | em uso | ⚠️ alvo é consolidar em `crm_operational_view` |
| `wa_conversations_operational_view` | ✅ mig 147 | ✅ pattern correto |

---

## 8 · UI com labels antigas

| Label antiga | Local | Substituir por |
|---|---|---|
| "Compareceu" como badge | UI modal finalize | "Finalizado" + dropdown de outcome |
| "Reagendado" como phase | UI tabela leads | (remover · só appointment) |
| "Lost" inglês em orcamentos.status | `chk_orc_status` | manter ou padronizar pt-br? · decisão |

---

## 9 · Tags vs colunas dedicadas

| Conceito | Hoje | Alvo |
|---|---|---|
| `temperature` (hot/warm/cold) | Coluna `leads.temperature` (v2) · ⚠️ legacy usa tags array | ✅ Coluna |
| `priority` (high/urgent) | Idem | ✅ Coluna |
| `funnel` | Coluna `leads.funnel` | ✅ Coluna |
| `tags` array | Coluna deprecated `leads.tags` (ainda referenciada por código · retorna []) | ❌ Remover totalmente |

---

## 10 · Achados consolidados

### 🔴 P0 (bloqueia o refactor)

1. **`lifecycle_status` fantasma em mig 103** · UPDATE em leads pode explodir runtime (CHECK valida coluna inexistente). Verificar via probe.
2. **Modelo excludente vs novo contrato.** ADR-001 (`deleted_at` em transição) conflita com regra "deleted_at só exclusão real". Decisão arquitetural obrigatória.

### 🔴 P1 (alto risco se ignorado)

3. **clinic-dashboard escreve no mesmo DB.** Mutations diretas + localStorage stale podem corromper estado em qualquer momento.
4. **Matriz de appointment.status ausente.** Status transitado sem validação · pode produzir cancelado→confirmado, finalizado→agendado, etc.
5. **Leads kanban não portado.** Frontend depende de legacy para mover phase via drag.

### 🟡 P2 (débito que cresce)

6. **Tags deprecated ainda referenciadas** (`leads.tags`). Remover do código.
7. **`appointment_change_status` RPC genérica não existe.** Fragmentação atual.
8. **Catálogo de eventos ausente.** Mudar comportamento exige tocar código (vide doc 06).
9. **Mesa operacional implícita.** Termo `mesa_operacional` não existe · contadores recomputados.

### 🟢 Bom (não precisa mexer)

10. ✅ ZERO mutations CRM em apps/lara fora de repos
11. ✅ `phase_history` audit imutável funciona
12. ✅ RLS multi-tenant via JWT
13. ✅ Pattern Repository → Server Action → UI consistente
14. ✅ ZERO uso operacional de localStorage em Lara v2
15. ✅ Grep limpo para `attending`/`converted`/`pre_consulta`/`em_consulta` em código vivo

---

## 11 · Plano de remoção legado (paralelo ao roadmap)

| Item | Fase do roadmap | Critério "ok pra remover" |
|---|---|---|
| `compareceu` da phase | Fase 1 (banco) | Backfill: phase atual em `compareceu` → `agendado` ou `paciente` (decisão por humano) |
| `reagendado` da phase | Fase 1 | Backfill idem · `agendado` |
| `pre_consulta`/`em_consulta` (appt.status) | Fase 1 | Backfill → `em_atendimento` |
| `perdido` como phase | Fase 2 (RPCs) | RPC `lead_lost` deixa de mudar phase · só seta lifecycle |
| `deleted_at` em transição lead→paciente | Fase 2 | Adopt single-table OU manter modelo excludente (decisão) |
| `leads.tags` coluna + código | Fase 7 | Drop column + remover 4 actions/repo methods |
| `public.perdidos` tabela | Fase 7 | Demoção a audit · ou drop |
| clinic-dashboard legacy escrita | Fase 7 | UI completa em Lara v2 cobre 100% · cutover read-only no legacy |
| Legacy JS deprecated (`/public/legacy/js/`) | Fase 7 | Sem refs ativas |
| `temperature` via tags legacy | Fase 7 | Mig de backfill + drop tag |
| `vw_leads_funnel_legacy` (se existir) | Fase 7 | Confirmar grep limpo · drop |

---

## 12 · Status final do legado

| Categoria | Status | Comentário |
|---|---|---|
| Tabelas canônicas v2 | ✅ Robustas | Migrations 60-65 entregaram estrutura sólida |
| RPCs canônicas | ✅ Robustas | 9 RPCs cobrem maior parte · gaps documentados em doc 02 |
| Audit (phase_history) | ✅ Funcional | Append-only · pronto |
| Mutations diretas CRM (Lara v2) | ✅ Zero fora de repos | Pattern respeitado |
| Mutations CRM em legacy | 🔴 Múltiplas | Risco contínuo |
| localStorage operacional | 🔴 Legacy só | Lara v2 está limpa |
| Termos enum antigos | 🟡 Permitidos pela mig 103 | Alvo elimina |
| Mig 103 bug `lifecycle_status` | 🔴 P0 | Provavelmente quebra UPDATE em runtime |
| Modelo excludente | ⚠️ Conflito alvo | Decisão pendente |
