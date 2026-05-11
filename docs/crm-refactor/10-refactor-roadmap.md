# 10 · Refactor Roadmap

> Plano faseado para evoluir CRM v1 (post mig 60-65 · 2026-04-28) para CRM v2 enterprise descrito em `04-target-state-machine.md`.
>
> **Esta fase 0 da auditoria é READ-ONLY.** Nenhuma fase abaixo está aplicada.

---

## Visão geral

| Fase | Nome | DB? | Mig? | Risco | Decisão humana? |
|---|---|---|---|---|---|
| 0 | Auditoria + contrato final | — | — | Baixo | Sim · Q1-Q8 doc 11 |
| 1 | Banco · read models intermediários | ✓ | ✓ | Médio | Sim · ADR-001 |
| 2 | RPCs + matrizes | ✓ | ✓ | Médio | — |
| 3 | `crm_operational_view` | ✓ | ✓ | Baixo | Sim · regular vs materialized |
| 4 | `crm_event_catalog` + alerts | ✓ | ✓ | Baixo | — |
| 5 | Frontend read-only novo | — | — | Baixo | — |
| 6 | Frontend actions via RPC | — | — | Médio | — |
| 7 | Remoção gradual de legado | ✓ | ✓ | Alto | Sim · cutover painel |
| 8 | Validações / smokes | — | — | Baixo | — |
| 9 | Hardening RLS/permissões | ✓ | ✓ | Médio | — |
| 10 | Analytics enterprise | ✓ | ✓ | Baixo | — |
| 11 | Documentação + handoff | — | — | Baixo | — |

---

## Fase 0 · Auditoria + contrato final (ESTA fase)

- **Objetivo:** mapear estado atual, identificar gaps, propor contrato alvo, listar decisões humanas pendentes.
- **Arquivos prováveis:** docs/crm-refactor/* (12 docs).
- **DB:** não.
- **Migrations:** nenhuma.
- **Riscos:** baixo (somente leitura).
- **Smoke tests:** —
- **Critério de aceite:** Alden lê 12 docs e responde 8 perguntas (vide doc 11).
- **Decisão humana necessária:** sim · todas as 8 perguntas.

---

## Fase 1 · Banco · read models intermediários

- **Objetivo:** preparar schema para v2 sem quebrar v1. Adicionar `lifecycle_status`, `archived_at`, `archive_reason`, `from_lifecycle/to_lifecycle` em `phase_history`. Backfill.
- **Arquivos prováveis:**
  - `clinic-dashboard/supabase/migrations/<num>_crm_v2_lifecycle_columns.sql`
  - `<num>_crm_v2_lifecycle_backfill.sql`
  - `<num>_crm_v2_appointment_status_consolidation.sql` (drop `pre_consulta`/`em_consulta` enum values · backfill para `em_atendimento`)
- **DB:** sim.
- **Migrations:** ~3 novas.
- **Riscos:** médio · backfill afeta dados vivos.
- **Rollback:** `.down.sql` reverte ALTER COLUMN; backfill é forward-only · snapshot point-in-time pré-aplicação.
- **Smoke tests:**
  - SELECT counts antes/depois (paridade)
  - Probe SQL: `SELECT phase, lifecycle_status, count(*) FROM leads GROUP BY 1,2`
  - Verificar 0 violations de CHECK consistency
- **Critério de aceite:**
  - Coluna `lifecycle_status text` existe em `leads` com CHECK válido
  - Todo lead com `phase='perdido'` tem `lifecycle_status='perdido'` + `lost_*` preenchidos
  - Todo lead com phase em {`reagendado`, `compareceu`} migrou para phase canônico (`agendado` ou `paciente`/`orcamento`)
  - Mig 103 bug corrigido
- **Decisão humana necessária:** sim · Q1 (modelo excludente), Q2 (`reagendado`/`compareceu` backfill heurística).

---

## Fase 2 · RPCs + matrizes

- **Objetivo:** criar/atualizar RPCs alinhadas com novo contrato.
- **Arquivos:**
  - `<num>_crm_v2_lifecycle_rpcs.sql` (`lead_recovery_activate`, `lead_archive`, `lead_unarchive`)
  - `<num>_crm_v2_appointment_matrix.sql` (`_appointment_status_transition_allowed` + `appointment_change_status` + `appointment_cancel` + `appointment_no_show`)
  - `<num>_crm_v2_lead_lost_refactor.sql` (não muda phase · só lifecycle)
  - `<num>_crm_v2_leads_bulk_change_phase.sql` (re-aplicar com nova matriz)
  - `<num>_crm_v2_appointment_finalize_v2.sql` (drop outcome=`perdido`)
- **DB:** sim.
- **Migrations:** ~5 novas.
- **Riscos:** médio · qualquer caller existente que dependa de behavior antigo quebra.
- **Rollback:** `.down.sql` recria RPC v1.
- **Smoke tests:**
  - Probe matriz: rodar transições legítimas + ilegais · assertar resultado esperado
  - Probe `appointment_finalize(outcome='perdido')` deve falhar
  - Probe `lead_lost` não muda phase
- **Critério de aceite:**
  - Matriz appointment retorna boolean correto pra 13 × 13 combinações
  - `lead_lost` apenas seta `lifecycle_status='perdido'` + audit
  - 8+ RPCs novas/atualizadas testadas via probe SQL

---

## Fase 3 · `crm_operational_view` (definitiva)

- **Objetivo:** criar view canônica que projeta cada lead com mesa derivada, agregados de agenda, orçamento, conversação, responsável, SLA.
- **Arquivos:**
  - `<num>_crm_operational_view.sql` (VIEW ou MATERIALIZED VIEW)
  - `<num>_crm_operational_view_refresh_strategy.sql` (se materialized: cron + trigger de invalidação)
- **DB:** sim.
- **Migrations:** 1-2 novas.
- **Riscos:** baixo · view não muda dados.
- **Rollback:** DROP VIEW.
- **Smoke tests:** comparar contadores da view vs contadores antigos (paridade).
- **Critério de aceite:**
  - SELECT da view retorna esperado para todas as 8 mesas operacionais
  - Performance: SELECT em <500ms para até 50k leads
- **Decisão humana necessária:** Q6 (regular vs materialized).

---

## Fase 4 · `crm_event_catalog` + alerts/notifications

- **Objetivo:** catálogo central de eventos operacionais + log + UI mínima de controle.
- **Arquivos:**
  - `<num>_crm_event_catalog.sql` (CREATE TABLE + seed 34 eventos)
  - `<num>_crm_events_log.sql` (CREATE TABLE)
  - `<num>_crm_event_handlers_inline.sql` (RPCs disparam INSERTs em events_log)
  - `apps/lara/src/app/(authed)/controle/eventos/page.tsx` (UI painel mínima)
- **DB:** sim.
- **Migrations:** ~3.
- **Riscos:** baixo (tabelas novas).
- **Smoke tests:** Forçar evento via SQL · UI lista.
- **Critério de aceite:**
  - 34 eventos seedados em `crm_event_catalog`
  - 5 RPCs principais (`lead_create`, `appointment_finalize`, `lead_lost`, `lead_archive`, `lead_recovery_activate`) escrevem em `crm_events_log`

---

## Fase 5 · Frontend read-only novo

- **Objetivo:** construir telas Next.js para todas as mesas e relatórios consumindo `crm_operational_view`.
- **Arquivos:**
  - `apps/lara/src/app/(authed)/crm/leads/kanban/page.tsx` (kanban com colunas por phase)
  - `apps/lara/src/app/(authed)/crm/mesas/[mesa]/page.tsx` (mesa dinâmica · lead/agendado/paciente/orcamento/paciente_orcamento/perdido/recuperacao/arquivado)
  - `apps/lara/src/app/(authed)/crm/orcamentos/parados/page.tsx`
  - `apps/lara/src/app/(authed)/crm/recuperacao/page.tsx`
  - `apps/lara/src/app/(authed)/crm/arquivados/page.tsx`
  - `apps/lara/src/app/(authed)/crm/agenda/aguardando/page.tsx` (filtros por status)
  - `apps/lara/src/app/(authed)/crm/agenda/em_atendimento/page.tsx`
  - `apps/lara/src/app/(authed)/crm/agenda/finalizados/page.tsx`
- **DB:** —
- **Migrations:** —
- **Riscos:** baixo · só leitura.
- **Smoke tests:** Cada tela renderiza com dados reais; contadores batem com view.
- **Critério de aceite:** 8 mesas operacionais + 4 filtros de agenda renderizando.

---

## Fase 6 · Frontend actions via RPC

- **Objetivo:** adicionar mutações nas telas novas usando RPCs canônicas + drag-drop kanban leads.
- **Arquivos:**
  - `apps/lara/src/app/(authed)/crm/leads/kanban/actions.ts` (`moveKanbanCardAction` → RPC `sdr_change_phase`)
  - Drag-drop leads via @dnd-kit
  - Botões: arquivar, recuperar, marcar perdido
- **DB:** —
- **Migrations:** —
- **Riscos:** médio · ações afetam DB.
- **Smoke tests:** E2E (Playwright opcional): drag card phase A → phase B; assert RPC chamada + audit em phase_history.
- **Critério de aceite:**
  - Kanban leads funcional com drag-drop e validação de matriz
  - Todas as ações de lifecycle (arquivar/recuperar/perder) funcionais

---

## Fase 7 · Remoção gradual de legado

- **Objetivo:** cutover do clinic-dashboard para Lara v2. Decommission tabela `perdidos`. Drop coluna `leads.tags`. Drop enum values `compareceu`, `reagendado` (após backfill da Fase 1).
- **Arquivos:**
  - `<num>_crm_v2_drop_compareceu_reagendado_phase.sql`
  - `<num>_crm_v2_drop_pre_consulta_em_consulta_status.sql`
  - `<num>_crm_v2_drop_leads_tags.sql`
  - `<num>_crm_v2_perdidos_freeze_or_drop.sql`
  - `<num>_crm_v2_remove_legacy_rpcs.sql` (drop `perdido_to_lead` se substituído)
  - `clinic-dashboard/` README com aviso "DEPRECATED · use clinicai-v2"
  - Remover `apps/lara/public/legacy/js/services/*` (16 arquivos)
- **DB:** sim.
- **Migrations:** ~5.
- **Riscos:** alto · DROPs irreversíveis. Exige cutover validado.
- **Rollback:** point-in-time recovery do Supabase.
- **Smoke tests:** Lara v2 cobre 100% dos fluxos. Painel legacy responde "MOVED PERMANENTLY" para nova URL.
- **Critério de aceite:**
  - 0 referências a `compareceu`/`reagendado` como phase em produção
  - `painel.miriandpaula.com.br` redireciona para Lara v2
  - `leads.tags`, `perdidos` table dropados
- **Decisão humana necessária:** Q4 (perdidos: drop ou freeze?).

---

## Fase 8 · Validações / smokes

- **Objetivo:** garantir integridade pós-refactor.
- **Arquivos:**
  - `clinic-dashboard/scripts/probes/crm_v2_integrity.cjs` (varredura SQL · 30+ probes)
  - `apps/lara/__tests__/e2e/crm-flows.spec.ts` (Playwright · opcional)
- **DB:** read-only.
- **Migrations:** —
- **Riscos:** baixo.
- **Critério de aceite:** probes 100% verde. Documento de smoke arquivado em `audits/`.

---

## Fase 9 · Hardening RLS/permissões

- **Objetivo:** garantir RLS estrito · audit imutável honrado · permissões granulares (RBAC).
- **Arquivos:**
  - `<num>_crm_v2_rls_audit_strict.sql`
  - `<num>_crm_v2_phase_history_lock_writes.sql` (revoke UPDATE/DELETE para `authenticated`)
- **DB:** sim.
- **Migrations:** ~2.
- **Riscos:** médio · pode quebrar caller que assumia liberdade.
- **Smoke tests:** Probe RLS: usuário de outra clínica não vê dados.
- **Critério de aceite:** Audit limpo · todos os caminhos requerem JWT válido.

---

## Fase 10 · Analytics enterprise

- **Objetivo:** consumir `crm_events_log` para dashboards de funil, conversão, perda, recuperação.
- **Arquivos:**
  - `apps/lara/src/app/(authed)/analytics/funnel/page.tsx`
  - `apps/lara/src/app/(authed)/analytics/perda/page.tsx`
  - `apps/lara/src/app/(authed)/analytics/recuperacao/page.tsx`
  - `apps/lara/src/app/(authed)/analytics/sla/page.tsx`
- **Migrations:** opcionais (views agregadas para performance).
- **Riscos:** baixo.
- **Critério de aceite:** 4 dashboards operacionais.

---

## Fase 11 · Documentação + handoff

- **Objetivo:** atualizar ADRs, README, doc canônico.
- **Arquivos:**
  - `docs/crm/CRM_CORE_FLOW.md` v2 (substitui v1)
  - `docs/REFACTOR_LEAD_MODEL.md` v2 (substitui)
  - `docs/adr/ADR-029-lifecycle-status.md`
  - `docs/adr/ADR-030-crm_operational_view.md`
  - `docs/adr/ADR-031-crm_event_catalog.md`
  - `docs/adr/ADR-032-no-deleted-at-funil-movement.md`
- **Riscos:** baixo.

---

## Cronograma sugerido (best-effort · sujeito a decisões humanas)

| Semana | Fases |
|---|---|
| 1 | Fase 0 + decisões humanas |
| 2-3 | Fase 1 + Fase 2 (banco preparado · matrizes prontas) |
| 4 | Fase 3 (view canônica) + Fase 4 (catálogo eventos) |
| 5-6 | Fase 5 (telas read-only novas) |
| 7 | Fase 6 (drag-drop + actions) |
| 8 | Fase 7 (decomission legado · CUIDADO) |
| 9 | Fase 8 (validações) + Fase 9 (hardening) |
| 10 | Fase 10 (analytics) + Fase 11 (docs) |

**Total estimado: 10 semanas em ritmo "passo a passo".**

---

## Critérios de "ok pra ir pra próxima fase"

1. Migration aplicada em ambiente shadow (Supabase branch) + probe 100% verde.
2. Smoke test E2E (manual ou Playwright) cobrindo golden path da fase.
3. Documentação ADR-style escrita.
4. Push para master + deploy automático sem erro.
5. Sentry sem novos errors após 24h.

---

## Princípios de execução (não-negociáveis)

1. **Cada fase é commit-completa.** Push após cada migration · não acumular débito de deploy.
2. **`.down.sql` obrigatório** (ADR-018) para qualquer DDL nova.
3. **Audit em `phase_history` + `crm_events_log` em toda mutation crítica.**
4. **Probe SQL antes de aplicar em prod** (especialmente Fase 1, 2, 7).
5. **Backfill é forward-only** · snapshot Supabase salva.
6. **Cutover do legacy é o último passo** · sem ele, refactor continua coexistindo.
