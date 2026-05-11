# 09 · Risk Register

> Registro de riscos identificados na auditoria. Estado em 2026-05-10.
>
> Severidade: P0 (bloqueia refactor) · P1 (alto · resolver antes de Fase 2) · P2 (médio · roadmap normal) · P3 (baixo · backlog).

---

## P0 · Bloqueantes

### R-001 · `lifecycle_status` fantasma em mig 103

| Campo | Valor |
|---|---|
| Risco | Mig 103 (`chk_leads_lost_consistency`) referencia coluna `lifecycle_status` que NÃO existe em `public.leads`. CHECK aceito porque CREATE não força resolução; qualquer UPDATE/INSERT em leads pode explodir com PostgreSQL error 42703. |
| Impacto | Operação CRM inteira pode quebrar. |
| Probabilidade | Alta (a cada mutation em leads). |
| Mitigação | Probe SQL imediato: `EXPLAIN UPDATE public.leads SET name='probe' WHERE id='00000000-0000-0000-0000-000000000000'`. Se erro 42703 aparecer, escrever mig de correção (drop CHECK + recriar corretamente · ou criar a coluna `lifecycle_status` enum). |
| Owner | Alden + Claude |
| Status | Investigar imediatamente |

### R-002 · ADR-001 (modelo excludente) vs contrato alvo

| Campo | Valor |
|---|---|
| Risco | Contrato alvo proíbe `deleted_at` em movimentação de funil. ADR-001 usa `deleted_at` quando lead vira paciente/orçamento. Conflito direto · não é resolvível sem decisão arquitetural. |
| Impacto | Bloqueia desenho final da `crm_operational_view`, do refactor de phase enum, e da semântica de `phase='paciente'` em `leads`. |
| Mitigação | Decisão humana entre: (a) single-table (paciente fica em leads com phase='paciente'), (b) manter modelo excludente e ajustar contrato, (c) híbrido (leads canonical pra mesa/contadores, patients permanece pra dados clínicos). |
| Owner | Alden |
| Status | Pergunta humana #1 (vide doc 11) |

### R-003 · clinic-dashboard legacy escreve no mesmo DB sem coordenação

| Campo | Valor |
|---|---|
| Risco | Painel legado em `painel.miriandpaula.com.br` (vanilla JS) faz `.update()` direto em leads/appointments/orcamentos + cacheia em localStorage. Mutações simultâneas podem corromper estado · matriz canônica é bypassed. |
| Impacto | Inconsistência entre o que Lara v2 mostra e o que o painel legado mostra. localStorage perpetuamente stale. |
| Mitigação | Curto prazo: documentar e monitorar. Longo prazo: cutover completo para Lara v2 + decommission legado em Fase 7. |
| Owner | Alden + Time |
| Status | Risco aceito durante transição · monitorar |

---

## P1 · Alto

### R-004 · Matriz `_appointment_status_transition_allowed` ausente

| Campo | Valor |
|---|---|
| Risco | `appointments.status` muda via UPDATE direto em vários lugares (Lara repos · legacy JS) sem validação de transição. Pode produzir `cancelado → confirmado`, `finalizado → agendado`, etc. |
| Impacto | Inconsistência operacional. |
| Mitigação | Criar helper IMMUTABLE `_appointment_status_transition_allowed(from, to)` + RPCs `appointment_change_status`, `appointment_cancel` que usam a matriz. Bloquear UPDATE direto via revoking permissions ou usar trigger. |
| Owner | Backend |
| Status | Roadmap Fase 2 |

### R-005 · Leads kanban não portado para Next.js

| Campo | Valor |
|---|---|
| Risco | Frontend depende de clinic-dashboard legacy para drag-drop por phase. Cada uso passa por mutations diretas via legacy. |
| Impacto | Cutover de legado bloqueado · UX dividido. |
| Mitigação | Construir `/crm/leads/kanban` (Next.js + @dnd-kit + RPC `sdr_change_phase`) em Fase 5/6. |
| Owner | Frontend |
| Status | Roadmap Fase 5 |

### R-006 · `crm_operational_view` ausente

| Campo | Valor |
|---|---|
| Risco | Sem view canônica, KPIs e mesas operacionais são recomputadas no frontend ou em endpoints ad-hoc · lógica fragmentada, fácil de divergir. |
| Impacto | Cada nova tela duplica regra de derivação de mesa/contadores. |
| Mitigação | Construir `crm_operational_view` em Fase 3. Backfill testes de paridade contra contadores atuais. Decidir regular vs materialized. |
| Owner | Backend |
| Status | Roadmap Fase 3 |

### R-007 · Catálogo de eventos ausente (`crm_event_catalog` / `crm_events_log`)

| Campo | Valor |
|---|---|
| Risco | 35 eventos operacionais (lead/appt/orcamento/patient/message/copilot) sem registro central. Lógica espalhada em crons, webhooks, repos. Cada nova regra mexe em código. |
| Impacto | Compliance/audit difíceis · UI de controle não pode ser construída sem catálogo. |
| Mitigação | Construir catálogo em Fase 4. Seed inicial 34 eventos (vide doc 06). |
| Owner | Backend |
| Status | Roadmap Fase 4 |

### R-008 · localStorage stale em clinic-dashboard

| Campo | Valor |
|---|---|
| Risco | 5+ chaves localStorage são fonte de verdade no clinic-dashboard. Nunca sincronizam com server. Ex: wizard anamnese pode criar appointment com `patient_id` errado se DB mudou desde último write. |
| Impacto | Bugs silenciosos · clientes potencialmente afetados sem visibilidade. |
| Mitigação | Migrar features críticas (kanban, agenda, anamnese) para Lara v2 e descomissionar legacy. |
| Owner | Frontend + Alden |
| Status | Risco aceito · roadmap Fase 5-7 |

### R-009 · Mutations diretas em `appointment.status` (Lara repo)

| Campo | Valor |
|---|---|
| Risco | `appointment.repository.cancel()` e `markNoShow()` setam status sem usar RPC. Sem matriz, transição ilegal silenciosa. |
| Impacto | Estado inconsistente. |
| Mitigação | Após Fase 2 (matriz), refatorar repos para usar RPCs `appointment_cancel` e `appointment_no_show`. |
| Owner | Backend |
| Status | Roadmap Fase 2 |

### R-010 · `compareceu` no caminho crítico do modal de finalização

| Campo | Valor |
|---|---|
| Risco | Modal de finalização exige `phase='compareceu'` antes de chamar `lead_to_paciente`/`lead_to_orcamento`. Alvo elimina esse phase. |
| Impacto | Refactor força mudança no modal + no fluxo `attend → finalize`. |
| Mitigação | Decisão de migração: pular `compareceu` (`agendado → paciente` direto via RPC ajustada) ou manter checkpoint via `appointment.status='em_atendimento'`. |
| Owner | Backend + UX |
| Status | Roadmap Fase 2-3 |

---

## P2 · Médio

### R-011 · Drag-drop sem idempotency key

| Risco | `dragDropAppointmentAction` faz local conflict check + RPC `checkConflicts`. Em condição de corrida (cliente clica 2x ou network reenvia), pode produzir double-booking. |
| Mitigação | Adicionar idempotency key + dedup server-side. |
| Status | Backlog |

### R-012 · Copilot ignora orcamento ativo

| Risco | Smart Reply não tem `orcamento_id` no contexto. Pode sugerir respostas contraditórias a propostas em aberto. |
| Mitigação | Ampliar payload do copilot. |
| Status | Backlog |

### R-013 · `leads.tags` coluna deprecated ainda referenciada

| Risco | 4 actions + 3 repo methods escrevem em coluna que retorna []. Manutenção piora confusão. |
| Mitigação | Remover métodos + actions em Fase 7. |
| Status | Roadmap Fase 7 |

### R-014 · `leads_bulk_change_phase` ausente em v2

| Risco | RPC bulk existe em legacy (mig 623) mas não foi re-aplicada em v2. UI bulk faz vários sdr_change_phase em sequência (lento, sem atomicidade). |
| Mitigação | Re-aplicar versão consolidada com matriz. |
| Status | Roadmap Fase 2 |

### R-015 · `mesa_operacional` derived inexistente

| Risco | Conceito do alvo não tem nome no código. Cada tela infere mesa de seu jeito. |
| Mitigação | Definir em `crm_operational_view`. |
| Status | Fase 3 |

### R-016 · Secretaria KPIs com refetch 30s e risco de stale

| Risco | Webhook que atualiza `operational_owner` em `wa_conversations` falha → counts divergem por até 30s + manual refresh. |
| Mitigação | Cache invalidation hook + alertas Sentry. |
| Status | Backlog |

### R-017 · `evolution-gap-monitor` cron mencionado mas não localizado

| Risco | Mig 872 cria `cross_instance_bridge`; cron `evolution-gap-monitor` é mencionado em código mas implementação não encontrada. Divergência multi-instance pode ocorrer silenciosamente. |
| Mitigação | Confirmar existência via arquivo + testes. Implementar se ausente. |
| Status | Investigar |

### R-018 · Schema `legacy_2026_04_28` ainda vivo

| Risco | Snapshot pré-mig 60. FKs externas com NOT VALID. Rows orfãos podem ainda apontar pra ele. |
| Mitigação | Cleanup em Camada 12 do plano original. |
| Status | Documentado |

---

## P3 · Baixo

### R-019 · `LeadDetailClient.tsx` é 22KB

| Risco | Componente grande · manutenção piora. |
| Mitigação | Split eventual. |
| Status | Backlog |

### R-020 · Mira app cross-app modifies orcamentos

| Risco | Sem isolation, `OrcamentoRepository` instanciado em mira pode escrever em orçamentos B2B + CRM regular. |
| Mitigação | Schemas separados ou flag explícita. |
| Status | Backlog |

### R-021 · Templates WhatsApp desacoplados de eventos

| Risco | Editar template em `b2b_comm_templates` não rastreia qual evento dispara. |
| Mitigação | Vinculação via `crm_event_catalog.whatsapp_template_key`. |
| Status | Fase 4 |

### R-022 · `appt_revert_lead_phase_on_remove` trigger pode disparar inesperadamente

| Risco | Quando último appt some, lead volta para `phase='lead'`. Comportamento documentado mas pode surpreender. |
| Mitigação | Audit explícito em `phase_history` (origin=auto_transition). Confirmar trigger logs. |
| Status | OK por design · monitorar |

### R-023 · ADR-005 exceção patients camelCase

| Risco | 8 colunas em `patients.*` em camelCase (`tenantId`, `totalProcedures`, etc) por herança. Inconsistente com padrão snake_case. |
| Mitigação | Boundary em repository (ADR-008) cobre · não precisa renomear (custo alto, ganho marginal). |
| Status | Aceito |

---

## Matriz de risco consolidada

| ID | Categoria | Severidade | Probabilidade | Impacto | Fase de mitigação |
|---|---|---|---|---|---|
| R-001 | DB · CHECK fantasma | P0 | Alta | Alto | Imediato |
| R-002 | Arquitetural · ADR-001 vs alvo | P0 | Garantida | Alto | Decisão antes da Fase 1 |
| R-003 | Concorrência · legacy escreve | P0 | Média | Alto | Risco aceito · Fase 7 |
| R-004 | Matriz appointment | P1 | Alta | Médio | Fase 2 |
| R-005 | UI · kanban faltante | P1 | Alta | Médio | Fase 5 |
| R-006 | Read model | P1 | Garantida (gap) | Alto | Fase 3 |
| R-007 | Catálogo eventos | P1 | Garantida | Médio | Fase 4 |
| R-008 | localStorage stale | P1 | Alta | Médio | Fase 5-7 |
| R-009 | Mutations status appt | P1 | Média | Médio | Fase 2 |
| R-010 | `compareceu` no fluxo | P1 | Garantida | Médio | Fase 2-3 |
| R-011 | Drag-drop idempotency | P2 | Baixa | Baixo | Backlog |
| R-012 | Copilot orçamento | P2 | Média | Baixo | Backlog |
| R-013 | Tags deprecated | P2 | Garantida | Baixo | Fase 7 |
| R-014 | Bulk RPC ausente | P2 | Garantida | Baixo | Fase 2 |
| R-015 | Mesa operacional | P2 | Garantida | Baixo | Fase 3 |
| R-016 | KPIs stale | P2 | Baixa | Médio | Backlog |
| R-017 | Evo gap monitor | P2 | Incerta | Médio | Investigar |
| R-018 | Schema legacy | P2 | Baixa | Baixo | Camada 12 |
| R-019 | LeadDetailClient | P3 | — | Baixo | Backlog |
| R-020 | Mira cross-app | P3 | Baixa | Baixo | Backlog |
| R-021 | Templates eventos | P3 | — | Baixo | Fase 4 |
| R-022 | Trigger revert | P3 | Baixa | Baixo | Monitorar |
| R-023 | camelCase patients | P3 | — | Nenhum | Aceito |
