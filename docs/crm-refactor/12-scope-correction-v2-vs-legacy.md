# 12 · Scope Correction · v2 vs legacy

> Reclassificação dos achados da auditoria CRM (docs 00-11) após separação rigorosa entre runtime ativo CLINIIC AI v2, código legacy órfão, e clinic-dashboard v1 fora de escopo.
>
> Estado em 2026-05-10 · branch `main` · HEAD `14169cb` · READ-ONLY.

---

## 1 · Resumo

A auditoria anterior tinha **contaminação séria** entre 3 camadas que vivem no mesmo workspace:

1. **CLINIIC AI v2 ativo** (`apps/lara/src/` + `packages/*` + `db/migrations/` + types.ts auto-gerados)
2. **Código compat/legacy presente mas não executado** (`apps/lara/public/legacy/` — 250 arquivos, mas apenas 2 HTMLs servidos e nenhum carrega CRM/SDR JS)
3. **clinic-dashboard v1** (repositório separado, `Documents/clinic-dashboard/`, deploy paralelo em `painel.miriandpaula.com.br`)

**Resultado da correção:** dos 10 riscos originais:
- **3 mantidos como risco real v2** (R-001 reclassificado como RESOLVED, R-006 como RESOLVED, R-002 mantido P0)
- **5 reclassificados** (severidade reduzida ou escopo migrado)
- **2 eram falsos positivos** baseados em legacy órfão

**Achado crítico que revira a auditoria anterior:** `crm_operational_view`, `lifecycle_status`, `lost_from_phase`, `archived_at`, `archived_reason`, `mesa_operacional` **JÁ EXISTEM** no banco v2 (confirmado em `packages/supabase/src/types.ts` auto-gerado · 23 referências à view e 3 hits diretos em `lifecycle_status`). A migration que os criou não está versionada em `db/migrations/` — provavelmente foi aplicada via Studio ou está fora do path varrido. **Investigar fonte da migration** é prioridade.

---

## 2 · O que era falso positivo de legacy

### F-1 · clinic-dashboard JS de CRM (lead-modal.js, sdr.repository.js, appointments.repository.js, leads-table.js, agenda-leads.js, anamnese-core.js, dashboard-birthdays.js)

**Falso positivo no contexto v2.** Esses arquivos vivem em `apps/lara/public/legacy/js/` (250 arquivos · 6.3MB) mas:

- O middleware (`apps/lara/src/middleware.ts:26`) só permite `/legacy/` como rota pública para o sub-app anamnese
- Os 2 HTMLs realmente servidos são `anamnese.html` e `form-render.html`
- `anamnese.html` carrega apenas `supabase-js CDN + js/config/env.js`
- `form-render.html` carrega apenas `js/config/env.js + js/form-render.js`
- **Nenhum dos JS de CRM/SDR/agenda/leads-table é carregado por qualquer rota servida**
- ZERO imports de `apps/lara/src` para `public/legacy/` em produção

**Os 248 JS files são órfãos no disco · sem execução, sem mutações, sem localStorage sendo lido.**

### F-2 · localStorage como fonte operacional (em apps/lara/src)

**Falso positivo.** Re-grep com exclusão de legacy mostra apenas:

| Arquivo | Uso | Operacional? |
|---|---|---|
| `apps/lara/src/hooks/useNotificationSettings.ts` | prefs role-specific de notificação | NÃO (UX prefs) |
| `apps/lara/src/components/NotificationToggle.tsx` | toggla `enabled` | NÃO |
| `apps/lara/src/components/NotificationPermissionBanner.tsx` | flag "user dismissed" | NÃO |
| `apps/lara/src/app/(authed)/configuracoes/NotificationSettingsPanel.tsx` | persiste prefs | NÃO |
| `apps/lara/src/app/(authed)/configuracoes/clinica/types.ts:42` | comentário "espelha o legacy localStorage shape" — apenas referência documental | NÃO |
| `apps/lara/src/app/(authed)/campanhas/nova/BroadcastFormClient.tsx` | auto-save de rascunho com 7d TTL | NÃO |

✅ **Lara v2 NÃO usa localStorage como fonte operacional crítica.** Toda lógica vem de Server Actions + repos (DB). Confirmado.

### F-3 · `attending` / `converted` como phase ilegal

**Falso positivo parcial.** Re-grep mostra `converted` apenas em:
- `apps/lara/src/prompt/mira-b2b-prompt.md` (texto · prompt LLM)
- `packages/supabase/src/types.ts` campos B2B (`converted_at`, `converted_amount_brl`, `vouchers_converted`)
- `packages/repositories/src/b2b-attribution.repository.ts` (B2B funnel metrics)

**Nenhum uso como phase de lead.** `attending` retornou zero hits. ✅ Limpo.

---

## 3 · O que é risco real do v2

### R1-v2 · Mutações diretas em `leads.phase` fora de RPC

**REAL · P1.** `lead.repository.ts:193`:
```ts
await this.supabase.from('leads').update({ phase }).eq('id', leadId)
```

Esse `setPhase()` é chamado por `repos.leads.setPhase(...)` e bypassa `_lead_phase_transition_allowed`. Outras 7 mutations em `lead.repository.ts` (linhas 105, 151, 159, 200, 270, 285, 301) tocam colunas não-críticas (lead_score, tags deprecated, funnel, temperature, lastResponseAt) — aceitáveis, mas o `setPhase` direto é débito real.

**Ação:** trocar `setPhase` por `RPC sdr_change_phase` ou validar matriz inline.

### R2-v2 · Mutações diretas em `appointments.status` fora de matriz

**REAL · P1.** `appointment.repository.ts`:
- `cancel(id, motivo)` → `.update({ status: 'cancelado' })`
- `markNoShow(id, motivo)` → `.update({ status: 'no_show' })`

Não passam por matriz `_appointment_status_transition_allowed` (que ainda não existe). Pode produzir `finalizado → cancelado` se chamado de UI errado.

**Ação:** criar matriz appointment + RPCs `appointment_cancel` / `appointment_no_show`.

### R3-v2 · `compareceu/reagendado/perdido` como phase ativos

**REAL no contrato atual · não é bug.** Estão em uso em:
- `packages/repositories/src/types/enums.ts` (LeadPhase type)
- `packages/repositories/src/helpers/phase-transitions.ts` (matriz)
- `apps/lara/src/app/crm/_schemas/lead.schemas.ts`
- `apps/lara/src/app/(authed)/leads/page.tsx`
- `apps/lara/src/app/(authed)/leads/LeadFiltersPanel.tsx`
- `apps/lara/src/app/(authed)/leads/[id]/LeadTagsPanel.tsx`
- `apps/lara/src/app/(authed)/campanhas/lib/filters.ts`
- `packages/ui/src/components/badge.tsx`

São o **contrato vigente** (7 phases). O alvo enterprise quer eliminar 3 desses, mas migração só na Fase 1 (com backfill).

### R4-v2 · `appointment.status` aceita `pre_consulta` e `em_consulta`

**REAL no contrato atual · não é bug ainda.** Estão no enum DB + `appointment.repository.ts:544/550` (aggregates bucketing). O alvo consolida em `em_atendimento`, mas migração só na Fase 1.

### R5-v2 · clinic-dashboard v1 deployado em paralelo

**REAL · P1.** `apps/lara/src/components/AppHeaderThin.tsx:23` referencia `https://painel.miriandpaula.com.br` (`NEXT_PUBLIC_PAINEL_URL`). Confirma deploy v1 ativo, escrevendo no mesmo banco Supabase.

Repositório `Documents/clinic-dashboard/` tem `Dockerfile` próprio + 660 migrations próprias. Mutations diretas em leads/appointments (vide doc 08) podem violar a matriz canônica.

**Ação:** decisão estratégica (Q10 doc 11): cutover hard, redirect gradual, ou read-only do legado.

### R6-v2 · Helper `phase-transitions.ts` espelha matriz DB

**Não é risco · mas vínculo a auditar.** `packages/repositories/src/helpers/phase-transitions.ts` define matriz em TS espelhando a SQL `_lead_phase_transition_allowed`. Se uma divergir, comportamento inconsistente.

**Ação:** garantir que matriz SQL é canônica · TS apenas tipa.

---

## 4 · O que precisa confirmação no banco (NEEDS_DB_CONFIRMATION)

### DBC-1 · Quem criou `crm_operational_view` no v2?

`packages/supabase/src/types.ts` (auto-gerado pelo Supabase CLI a partir do banco real) tem **23 referências** a `crm_operational_view` + colunas:
```
appointment_id, appointment_status, budget_id, budget_status, clinic_id, email,
end_time, has_active_budget, is_no_show, lead_id, lead_phase, lifecycle_status,
lost_from_phase, mesa_operacional, name, patient_id, phone, scheduled_date, start_time
```

Mas grep em `db/migrations/` (clinicai-v2) NÃO encontra `CREATE.*VIEW.*crm_operational_view`. Migration ausente.

**Hipóteses:**
- Migration foi aplicada via Supabase Studio (ad-hoc)
- Migration está em outro repo / outro path
- Foi executada fora do processo versionado

**Probe SQL (READ-ONLY) sugerido:**
```sql
SELECT pg_get_viewdef('public.crm_operational_view'::regclass, true);
SELECT proname FROM pg_proc WHERE proname LIKE 'lead_recovery%' OR proname LIKE 'lead_archive%';
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_name='leads' AND column_name IN ('lifecycle_status','lost_from_phase','archived_at','archived_reason');
```

### DBC-2 · Coluna `lifecycle_status` em `leads` — formato e CHECK

types.ts diz `lifecycle_status: string` (NOT NULL) com default provável `'ativo'`. CHECK constraint?

**Probe:** `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.leads'::regclass`.

### DBC-3 · RPCs `lead_recovery_activate`, `lead_archive`, `lead_unarchive`

Listadas como ausentes na auditoria anterior. Re-confirmar.

**Probe:** `SELECT proname FROM pg_proc WHERE proname IN ('lead_recovery_activate','lead_archive','lead_unarchive','leads_bulk_change_phase','appointment_change_status','appointment_cancel','appointment_no_show','_appointment_status_transition_allowed')`.

### DBC-4 · Mig 103 não está bugada — `lifecycle_status` coluna existe

A "bug fantasma" do audit anterior estava errada. types.ts confirma coluna existe. Mig 103 funciona corretamente em runtime — apenas a fonte da criação está fora do path varrido. **Risco R-001 do doc 09 deve ser REBAIXADO para LOW · não bloqueia Fase 1.**

---

## 5 · O que já está resolvido no v2

Tabela: conceito | existe no v2? | onde | como funciona | falta algo?

| Conceito | Existe? | Onde | Como funciona | Falta? |
|---|---|---|---|---|
| `lifecycle_status` enum coluna | ✅ SIM (banco) | `public.leads.lifecycle_status string` | NOT NULL · default provável `'ativo'` · types.ts confirma | Confirmar CHECK + valores; documentar migration; talvez retro-popular migration .sql para versionamento |
| `lost_from_phase` | ✅ SIM | `public.leads.lost_from_phase string\|null` | Coluna existe · audit de phase no momento da perda | Confirmar CHECK |
| `archived_at` / `archived_reason` | ✅ SIM | `public.leads` | Cols presentes em types.ts (Insert/Update aceitam) | Confirmar quando foi adicionado |
| `crm_operational_view` | ✅ SIM | View no Postgres | 19 colunas projetadas · `mesa_operacional` derivado · agregados de agenda + budget | Confirmar definition · indexar se for VIEW regular vs MATERIALIZED |
| `mesa_operacional` | ✅ SIM | coluna da view | Derivado server-side | Confirmar regras de derivação |
| `has_active_budget` | ✅ SIM | coluna da view | Boolean derivado para `paciente_orcamento` | OK |
| `is_no_show` | ✅ SIM | coluna da view | Boolean derivado para alertas | OK |
| Recuperação (`is_in_recovery`) | ⚠️ Parcial | `leads.is_in_recovery boolean` | Boolean ativo · ALVO usa `lifecycle_status='recuperacao'` em vez | Consolidar (Fase 1) |
| `perdido` fora de phase | ⚠️ Parcial | `lifecycle_status='perdido'` + `phase='perdido'` (ambos co-existem) | Dualidade · pode causar inconsistência | Migrar `phase='perdido'` para preservar phase + setar lifecycle |
| `arquivado` lifecycle | ✅ SIM (cols existem) | `archived_at`/`archived_reason` em leads | Falta verificar se `lifecycle_status` aceita `'arquivado'` | Confirmar enum aceita |
| `paciente_orcamento` derived | ✅ SIM (`has_active_budget` na view) | View column | Derivado · não tag | OK |
| `appointments.status` separado de `leads.phase` | ✅ SIM | Tabela própria · CHECK 13 valores · matriz lead_to_appointment + appointment_attend + appointment_finalize | Pattern funcionando | Falta matriz `_appointment_status_transition_allowed` |
| RPCs oficiais para transições | ✅ 9 RPCs core (mig 65) | `_lead_phase_transition_allowed`, `lead_create`, `lead_to_appointment`, `appointment_attend`, `appointment_finalize`, `lead_to_paciente`, `lead_to_orcamento`, `lead_lost`, `sdr_change_phase` | Matriz blindada server-side | Faltam `lead_recovery_activate`, `lead_archive`, `lead_unarchive`, `appointment_change_status` (genérica), `appointment_cancel`, `appointment_no_show`, `leads_bulk_change_phase` (v2), `_appointment_status_transition_allowed` |
| Actions usando apenas RPC/repositories | ✅ Sim (apps/lara) | Server Actions em `crm/_actions/` + `(authed)/leads/actions.ts` | Pattern Repository → Server Action → UI · ZERO mutations fora de repos | OK |
| UI consumindo fonte canônica | ⚠️ Parcial | Hoje usa `repos.leads.list()` etc · não consome `crm_operational_view` ainda | Cada tela faz seu fetch | Migrar fontes para a view (Fase 5) |
| Dashboard/KPIs server-side | ✅ Secretaria (mig 147) | `wa_conversations_operational_view` + `/api/secretaria/kpis` | Refetch 30s + manual | Replicar pattern para CRM |
| Ausência de localStorage operacional | ✅ Confirmado | apps/lara não usa para CRM | Apenas prefs UI | OK |
| Catálogo de eventos (`crm_event_catalog`) | ❌ NÃO existe | — | Gap real | Construir Fase 4 |
| Leads kanban portado | ❌ NÃO existe em v2 | — | Gap real | Construir Fase 5 |

---

## 6 · Riscos reclassificados

| ID | Risco original | Escopo original | Escopo corrigido | Evidência | Severidade corrigida | Próxima ação |
|---|---|---|---|---|---|---|
| **R-001** | `lifecycle_status` fantasma em mig 103 | P0 (UPDATE quebra runtime) | **RESOLVED_IN_V2** | Coluna existe no banco (types.ts confirma) · mig 103 funciona | **REMOVED** | Apenas: rastrear migration que criou a coluna (DBC-1, DBC-2) e versionar |
| **R-002** | ADR-001 vs contrato alvo (deleted_at em transição) | P0 (decisão arquitetural) | **ACTIVE_V2_RUNTIME** | `lead_to_paciente`/`lead_to_orcamento` ainda usam soft-delete + INSERT (mig 65 vive) | **P0 mantido** | Q1 doc 11 segue · decisão humana |
| **R-003** | clinic-dashboard escreve no mesmo DB | P0 (corrupção potencial) | **V1_OUT_OF_SCOPE + LEGACY_MONITOR** | Repo separado · deploy `painel.miriandpaula.com.br` confirmado (AppHeaderThin.tsx:23) | **P1 reclassificado** | Cutover ou read-only · Fase 7 (não bloqueia Fase 1) |
| **R-004** | Matriz `_appointment_status_transition_allowed` ausente | P1 | **ACTIVE_V2_DB_CONTRACT** | Confirmado: matriz não existe · `appointment.repository.cancel/markNoShow` UPDATE direto | **P1 mantido** | Fase 2 · criar matriz + RPCs |
| **R-005** | Leads kanban não portado | P1 | **ACTIVE_V2_UI** | Confirmado: `/crm/leads/kanban` não existe em apps/lara/src/app/crm/ | **P1 mantido** | Fase 5 · construir UI |
| **R-006** | `crm_operational_view` ausente | P1 (KPIs fragmentados) | **RESOLVED_IN_V2** | View JÁ EXISTE com 19 colunas + `mesa_operacional` derived (types.ts confirma 23 refs) | **REMOVED** | Apenas confirmar `pg_get_viewdef` + considerar materialized se latência subir |
| **R-007** | `crm_event_catalog` ausente | P1 | **ACTIVE_V2_DB_CONTRACT** | Confirmado: tabela não existe · 35 eventos sem governança | **P1 mantido** | Fase 4 · construir catálogo |
| **R-008** | localStorage stale em clinic-dashboard | P1 | **V1_OUT_OF_SCOPE + LEGACY_MONITOR** | Lara v2 NÃO usa localStorage operacional · todos os hits são em clinic-dashboard repo separado | **P2 reclassificado** | Não afeta Lara v2 · resolve com Fase 7 (cutover) |
| **R-009** | Mutations diretas em `appointment.status` | P1 | **ACTIVE_V2_RUNTIME** | Confirmado: `cancel()` e `markNoShow()` em `appointment.repository.ts:256/276` | **P1 mantido** | Fase 2 (após criar matriz) |
| **R-010** | `compareceu` no fluxo de finalização | P1 | **ACTIVE_V2_RUNTIME** | Confirmado: pattern attend → compareceu → finalize ainda em uso · 7 phases no enum | **P1 mantido** | Fase 1-2 · decisão Q2 + Q10 |

### Riscos adicionais descobertos na correção (não estavam no doc 09)

| ID | Risco | Severidade | Próxima ação |
|---|---|---|---|
| **R-024** | `setPhase()` em `lead.repository.ts:193` faz `.update({phase})` direto · bypassa matriz | P1 (não estava no doc 09 explicitamente) | Refactor para chamar `sdr_change_phase` RPC ou inline matrix |
| **R-025** | Migration ausente para `crm_operational_view`, `lifecycle_status`, `archived_at` no path versionado | P2 | Investigar (DBC-1) · retroaplicar migration versionada para reproducibilidade |
| **R-026** | TS helper `phase-transitions.ts` é cópia da matriz SQL · risco de drift | P2 | Garantir SQL canônico · TS apenas tipa enum |

---

## 7 · Próxima fase recomendada (corrigida)

A auditoria anterior recomendava:
1. ❌ ~Probe da mig 103 lifecycle_status~ — **DESCARTADO** (coluna existe · não há bug)
2. ❌ ~Construir `crm_operational_view`~ — **DESCARTADO** (já existe)
3. ❌ ~Resolver clinic-dashboard como P0~ — **REBAIXADO** (cutover na Fase 7)

A **próxima fase real** é:

### Fase 0.5 · Investigação curta (1-2h)

**Probe SQL READ-ONLY** para auditar o que existe no banco vs o que está versionado:

```sql
-- 1. View canônica · ver se está bem definida
SELECT pg_get_viewdef('public.crm_operational_view'::regclass, true);

-- 2. Constraints atuais em leads (após mig 103)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid='public.leads'::regclass
ORDER BY conname;

-- 3. Colunas + defaults + nullability em leads
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='leads'
ORDER BY ordinal_position;

-- 4. RPCs CRM existentes
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public'
  AND (proname ILIKE '%lead%' OR proname ILIKE '%appointment%' OR proname ILIKE '%orcamento%' OR proname ILIKE '%sdr_%')
ORDER BY proname;

-- 5. Definition da view + indexes
SELECT relname, relkind FROM pg_class
WHERE relnamespace=(SELECT oid FROM pg_namespace WHERE nspname='public')
  AND relname='crm_operational_view';
```

Esses 5 probes desbloqueiam decisões Q1, Q7, Q8 e revelam migrations ausentes do path versionado.

### Fase 0.6 · Decisões humanas (Q1-Q10 do doc 11)

Permanecem · mas Q11 (probe mig 103) é **DESCARTADA** (foi falso alarme).

### Fase 1 · Banco (revisada)

Já que `lifecycle_status` + `crm_operational_view` existem, Fase 1 fica **menor**:

- ❌ ~Adicionar lifecycle_status~ (existe)
- ❌ ~Criar crm_operational_view~ (existe)
- ✅ Verificar `lifecycle_status` aceita `'arquivado'` no CHECK · ajustar se não
- ✅ Backfill leads em `phase` ∈ {`reagendado`, `compareceu`, `perdido`} para o contrato 4-phase
- ✅ Decidir + executar Q1 (modelo excludente vs single-table)
- ✅ Drop `pre_consulta`/`em_consulta` do enum appointment.status (consolidar em `em_atendimento`)
- ✅ Retroaplicar migration versionada para `crm_operational_view` e `lifecycle_status` (rastreabilidade)

### Fase 2 · RPCs (revisada)

- ✅ Criar `_appointment_status_transition_allowed` + RPCs `appointment_change_status` / `appointment_cancel` / `appointment_no_show`
- ✅ Criar `lead_recovery_activate`, `lead_archive`, `lead_unarchive`
- ✅ Refactor `lead_lost` (não muda phase · só lifecycle)
- ✅ `appointment_finalize_v2` (drop outcome `perdido`)
- ✅ `setPhase()` em `lead.repository.ts:193` passa a usar `sdr_change_phase` RPC (R-024)
- ✅ Re-aplicar `leads_bulk_change_phase` (v2)

### Demais fases (3-11)

Permanecem como no doc 10, exceto:
- **Fase 3** simplifica para "ajustar view existente se necessário" (não construir do zero)
- **Fase 4** segue como estava (catálogo de eventos não existe)
- **Fase 5** acelera (parte da infra do read model já existe · só construir mesas + kanban)

---

## 8 · git status final

```
?? docs/crm-refactor/
```

Branch: `main` · HEAD: `14169cb feat(mira): implicit voucher intent for partner messages`

Apenas a pasta `docs/crm-refactor/` (12 docs) é untracked. Nenhuma alteração de código/migration/banco.

---

## 9 · Conclusão da correção

A auditoria anterior estava **majoritariamente correta**, mas com 2 erros materiais:

1. **R-001 (mig 103 bug fantasma)** — não havia bug. A coluna `lifecycle_status` existia no banco; eu não consegui encontrar a migration porque ela está fora de `db/migrations/`. Acreditei na ausência sem confirmar no DB. **Lição:** confirmar contra `types.ts` (auto-gerado) ou probe SQL antes de afirmar "não existe".
2. **R-006 (crm_operational_view ausente)** — mesma falha. A view existe. types.ts tem 23 referências.

Outros 8 riscos estavam essencialmente corretos · 2 foram reclassificados em severidade (R-003 e R-008 são realmente clinic-dashboard, fora do escopo crítico v2).

**Net:**
- Refactor é **menor** do que o doc 10 indicava
- Fases 1, 2, 3 ficam mais leves (DB já tem boa parte)
- Decisão Q1 (modelo excludente) **continua sendo a peça central** do refactor
- Cutover do clinic-dashboard pode ser planejado com calma · não é P0 imediato
