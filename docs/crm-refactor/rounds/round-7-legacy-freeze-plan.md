# Round 7 · Legacy Freeze Plan · Operating Rules

**Status:** FREEZE_PLAN_RATIFIED ✅
**Data:** 2026-05-18
**Branch:** `crm/parity-r7-legacy-freeze-final-audit`
**Baseado em:** [round-7-final-1x1-audit.md](./round-7-final-1x1-audit.md) · zero P0 · zero P1
**Aplicação:** após merge do PR R7 (Prompt 3 closeout) · não automático

Este documento formaliza o plano operacional de freeze do legacy
clinic-dashboard após a auditoria 1×1 R7 concluir com **0 P0 · 0 P1 ·
2 P2 · 3 DEFERRED · 18 MATCH**.

## Princípio orientador

> v2 (clinicai-v2) é o produto canônico para CRM new feature
> development. Legacy clinic-dashboard fica congelado para core CRM
> e ativo apenas para módulos DEFERRED por decisão R6.

## Classificação por módulo

### FREEZE_NOW (18 módulos)

Core CRM end-to-end · paridade funcional 1×1 confirmada · zero novo
desenvolvimento em legacy a partir desta data:

| # | Módulo | v2 surface | Legacy surface (a congelar) |
|---|---|---|---|
| 1 | Agenda (week/day/month) | `/crm/agenda` | week-calendar.js · day-view · month-view |
| 2 | Novo appointment | `/crm/agenda/novo` | appointment-form.html |
| 3 | Appointment detail | `/crm/agenda/[id]` | appointment-detail.html |
| 4 | FinalizeWizard | `_actions-bar.tsx` FinalizeWizard | finalize modal legacy |
| 5 | Procedimentos (admin) | `/configuracoes/procedimentos` | procedimentos.html |
| 6 | Pagamentos (multi-method) | `appointment_payments` (v2 multi) | `_apptPagamentos[]` legacy single |
| 7 | Resumo financeiro | view 195 + Money helper | financial-summary card legacy |
| 8 | Pós-ações (5 action types) | `/crm/post-acoes` | post-actions.html legacy |
| 9 | Mesa operacional | `/crm/mesa-operacional` | mesa-operacional.html |
| 10 | Patient profile (prontuário) | `/crm/pacientes/[id]` | paciente.html |
| 11 | Kanban / Leads | `/crm/kanban` + 7-days + leads | kanban.html |
| 12 | Recuperação | `/crm/recuperacao` | recuperacao.html |
| 13 | Orçamentos | `/crm/orcamentos` | orcamentos.html |
| 14 | Profissionais / Salas / Férias | `/configuracoes/*` | configuracoes admin legacy |
| 15 | Retoques (manual reminder) | `action_type='retouch_reminder'` | retoque-campaigns.js |
| 16 | Queixas (logging manual) | `action_type='complaint_logged'` | patient-complaints.js |
| 17 | Anamnesis (clinical) | `_clinical-panel` embed | anamnesis.html |
| 18 | TCLE (consent) | `_clinical-panel` embed + hard gate mig 167 | tcle.html |

**Regra de operação:**
- Staff opera v2 para esses módulos
- Bugs em legacy para esses módulos → **NÃO corrigir em legacy** → migrar caso de uso para v2
- Roadmap, features novas, refactors → **sempre v2**

### FREEZE_AFTER_PHASE_2E (2 módulos)

Paridade parcial · workaround operacional · awaits Phase 2E para freeze
total:

| # | Módulo | v2 Status atual | Workaround temporário | Trigger para freeze |
|---|---|---|---|---|
| 19 | Dashboard KPI | `/crm/dashboard` placeholder | Staff consulta legacy dashboard para métricas até implementação KPI v2 | Phase 2E entrega KPI v2 |
| 20 | Notifications dispatch | `CrmTopbar` AlertBell wire placeholder + day-alerts-strip | Visibility via post-actions count badge + patient profile post-actions tab | Phase 2E entrega trigger automatic |

**Regra de operação:**
- Staff acessa legacy SOMENTE para esses 2 módulos até Phase 2E
- v2 já tem o wire pronto · awaits trigger lógico/dispatch automatico
- Nenhum novo desenvolvimento em legacy KPI/notifications (apenas leitura)

### KEEP_ACTIVE_LEGACY (3 módulos)

DEFERRED explicit por decisão Round 6 · v2 fixture/signature ready ·
real dispatch awaits Phase 2F/2E:

| # | Módulo | v2 Status atual | Legacy continua ativo para | Trigger para freeze |
|---|---|---|---|---|
| 21 | WhatsApp real dispatch | `wa_outbox` schema ready · worker 71 OFF · zero provider | Dispatch real Mih/Cloud Meta via legacy worker | Phase 2F · provider integration v2 |
| 22 | VPI autoEnroll real | RPC signature ready · mig 700 fixture · worker awaits | Real autoEnroll via legacy fluxo | Phase 2F · worker v2 |
| 23 | Cashflow ledger wire | read-only view ready · drill-down UI awaits | Cashflow drill-down UI em legacy | Phase 2E · UI v2 |

**Regra de operação:**
- Staff opera esses 3 módulos via legacy
- WhatsApp real: **worker 71 permanece OFF** · wa_outbox unchanged
- VPI autoEnroll: **mig 700 fixture only** · real RPC via legacy
- Cashflow: read-only view v2 consultável · write em legacy
- Trigger para freeze: implementação Phase 2E (cashflow) / Phase 2F (WhatsApp + VPI)

### KEEP_READ_ONLY_REFERENCE (rules)

Legacy clinic-dashboard permanece **read-only consultable** mesmo
para módulos FREEZE_NOW, durante período de transição (estimado 30 dias):

- Staff pode CONSULTAR legacy para verificar dados históricos
- Staff NÃO PODE criar/editar appointments/leads/pacientes em legacy
- Staff NÃO PODE finalizar appointments em legacy
- 76 appointments legacy pre-R5 ficam read-only (NO_BACKFILL_SAFE_INFERENCE preserved)

## What the team can stop using in legacy now

A partir da data de merge do PR R7 (Prompt 3):

- ✋ Criar appointments em legacy (use `/crm/agenda/novo`)
- ✋ Finalizar appointments em legacy (use FinalizeWizard v2)
- ✋ Editar leads/pacientes em legacy (use `/crm/leads`, `/crm/pacientes/[id]`)
- ✋ Operar Kanban/Mesa operacional em legacy
- ✋ Gerenciar orçamentos em legacy
- ✋ Operar pós-ações em legacy (use `/crm/post-acoes`)
- ✋ Editar procedimentos admin em legacy
- ✋ Editar profissionais/salas em legacy

## What must remain active temporarily

A partir da data de merge do PR R7 até Phase 2E/2F:

- ✅ Worker 71 (WhatsApp dispatch) **OFF em v2** · ativo apenas em legacy se a clínica precisa enviar real
  - **Atualmente OFF em ambos** · zero impact se Phase 2F atrasar
- ✅ Cashflow drill-down em legacy (até Phase 2E entrega UI v2)
- ✅ VPI autoEnroll fluxo em legacy (até Phase 2F entrega worker v2)
- ✅ Dashboard KPI legacy (até Phase 2E entrega KPI v2)
- ✅ Topbar alerts em legacy (até Phase 2E entrega trigger automatic)

## What must NOT be operated in v2 yet

A partir da data de merge do PR R7:

- ⛔ NÃO ativar worker 71 (`active=false` preservado)
- ⛔ NÃO disparar provider Evolution/Meta direto via v2 (zero código provider em v2 CRM track)
- ⛔ NÃO criar cron novo para dispatch automático
- ⛔ NÃO executar Level C canary real assisted sem GO explícito separado
- ⛔ NÃO mexer em `appointment_finalize` RPC contract
- ⛔ NÃO mexer em hard gate mig 167
- ⛔ NÃO mexer em `appointment_attend` / `lead_to_paciente` / `lead_to_orcamento`
- ⛔ NÃO executar backfill automático em appointments legacy (NO_BACKFILL_SAFE_INFERENCE R5 preserved)

## Rollback / Reference policy

Caso bug crítico apareça em v2 para um módulo FREEZE_NOW após merge:

1. **NÃO reverter freeze** · NÃO mover staff de volta para legacy
2. Abrir hotfix branch a partir do main · fix em v2
3. Aplicar hotfix · validar smoke
4. Atualizar este freeze plan se severidade muda classificação
5. Legacy permanece consultável (read-only) durante hotfix · NÃO operacional

Para módulos KEEP_ACTIVE_LEGACY:
- Bugs em legacy WhatsApp/VPI/Cashflow → corrigir em legacy temporariamente
- Trigger para migração definitiva = Phase 2E/2F entregar v2 real

## Owner / Action table

| Módulo | Status | Owner próxima ação | Próxima ação |
|---|---|---|---|
| Agenda + Novo + Detail + FinalizeWizard | FREEZE_NOW | Equipe v2 | Operar via v2 · bugs → hotfix v2 |
| Pagamentos + Resumo financeiro | FREEZE_NOW | Equipe v2 | Operar via v2 · bugs → hotfix v2 |
| Pós-ações + Retoques + Queixas | FREEZE_NOW | Equipe v2 | Operar via v2 · dispatch manual |
| Mesa operacional + Kanban + Recuperação + Leads | FREEZE_NOW | Equipe v2 | Operar via v2 |
| Patient profile + Anamnesis + TCLE | FREEZE_NOW | Equipe v2 | Operar via v2 |
| Orçamentos | FREEZE_NOW | Equipe v2 | Operar via v2 |
| Procedimentos + Profissionais/Salas | FREEZE_NOW | Equipe v2 | Operar via v2 admin |
| Dashboard KPI | FREEZE_AFTER_PHASE_2E | Phase 2E roadmap | Implementar KPI cards v2 |
| Notifications dispatch | FREEZE_AFTER_PHASE_2E | Phase 2E roadmap | Implementar trigger automatic |
| WhatsApp real | KEEP_ACTIVE_LEGACY | Phase 2F roadmap | Worker v2 + provider integration |
| VPI autoEnroll | KEEP_ACTIVE_LEGACY | Phase 2F roadmap | Worker v2 + real RPC |
| Cashflow ledger | KEEP_ACTIVE_LEGACY | Phase 2E roadmap | Drill-down UI v2 |

## Final Operating Rules

1. **v2 é canônico** para 18 módulos FREEZE_NOW. New feature → v2.
2. **Bug em legacy FREEZE_NOW módulo** → migrar caso para v2 · NÃO corrigir legacy.
3. **Bug em v2 FREEZE_NOW módulo** → hotfix v2 · legacy NÃO reativado.
4. **76 appts legacy pre-R5** ficam read-only · staff usa FinalizeWizard para appts novos.
5. **Worker 71 permanece OFF** até Phase 2F · zero side effect externo · zero WhatsApp real.
6. **mig 167 hard gate preservado** · zero alteração.
7. **`appointment_finalize` / `appointment_attend` / `lead_to_paciente` / `lead_to_orcamento`** intocados.
8. **Canon Phase 1C preservado** · invalid_phases=0 · zero violation.
9. **Anon grants ZERO em R2/R3/view 195** · canon completo (mig 198 hardening).
10. **Backfill manual case-by-case** apenas via Supabase Studio (admin) · zero automático.

## Trigger para revisar este plan

- Quando Phase 2E entrega KPI + Notifications v2 → reclassificar #19 e #20 para FREEZE_NOW
- Quando Phase 2F entrega WhatsApp dispatch v2 → reclassificar #21 para FREEZE_NOW + ativar worker v2
- Quando Phase 2F entrega VPI autoEnroll real → reclassificar #22 para FREEZE_NOW
- Quando Phase 2E entrega Cashflow drill-down v2 → reclassificar #23 para FREEZE_NOW
- Após todos reclassificados → freeze total legacy clinic-dashboard CRM

## Próximo passo

Após merge do PR R7 (Prompt 3 closeout), comunicar este plano para
equipe operacional via:

1. Doc compartilhado interno (mirror deste arquivo)
2. Treinamento staff (5 min) · onde fazer o que
3. Marcação visual em legacy (banner "CONGELADO · usar v2 para X")
4. Monitoramento 30 dias: tickets de bug em módulos FREEZE_NOW

Não automatizar redirect/302 de legacy → v2 ainda · awaits Phase 2E
completar Dashboard KPI + Notifications para zero gap visual.
