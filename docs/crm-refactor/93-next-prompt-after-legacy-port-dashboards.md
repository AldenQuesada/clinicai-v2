# CRM · Next Prompt After LEGACY.PORT.DASHBOARDS

> Round LEGACY.PORT.DASHBOARDS entregou primeira portabilidade crítica:
> `/crm/dashboard` SSR com filtros, KPIs, funil canônico, by-professional
> e listas operacionais. Sem migration, sem provider, smoke read-only PASS.

---

## Estado consolidado pós-LEGACY.PORT.DASHBOARDS

- HEAD esperado pós-push: novo commit
  `feat(crm): add readonly funnel dashboards`
- Novo módulo: `/crm/dashboard` (Server Component + 4 client/server children)
- Novo repository: `CrmDashboardRepository` com 4 métodos read-only
- 4 fontes de dados v2 consumidas (appointments, leads, perdidos, orcamentos)
- Nav link adicionado em `crm-nav.tsx`
- Worker 71 OFF · `can_continue=true` · zero `wa_outbox` mutation
- Typecheck OK · 0 zombie status nos dados

**Pré-req cumprido para CONTROL.1:** 2AUX.2 (Professional FK) + 1 port
crítico (este) ambos fechados. CONTROL.1 já pode rodar.

---

## Regras invioláveis (continuam)

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO chamar provider externo
- NÃO criar `wa_outbox` row
- NÃO usar status zumbi
- NÃO usar `phase='perdido'`
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_CONTROL.1 · Auditoria final DB + cleanup controlado (RECOMENDADA)

**Por quê:** pré-requisitos cumpridos (2AUX.2 + 1 port). Agora é o momento de
fechar a base antes de mais ports. CONTROL.1 lida com:

1. **18 funções pg_proc com status zumbi** (`em_consulta`/`pre_consulta`/`compareceu`/`reagendado`)
2. **9 RPCs Alexa dormentes** (`alexa_*` · sem uso no v2)
3. **3 appointments sem `professional_id`** (legacy data · candidato a backfill ou drop)
4. **Audit RLS final** · garantir todas tabelas multi-tenant têm policies
5. **Audit cron** · confirmar que worker 71 segue OFF + jobs ativos são canon
6. **Audit FK orphans** · appointments com lead_id/patient_id apontando para deletados

**Escopo:**
- READ-ONLY audit SQL extenso
- DROP seguro de funções zumbis (com smoke pré-drop · prosrc inspection)
- DROP de Alexa RPCs dormentes (após confirmar zero callers)
- Migration 175 (CONTROL cleanup) com rollback safe
- Docs auditável + matriz "antes/depois"
- Sem mexer em dados de produção (apenas funções/views/schema)

### Opção B · CRM_PHASE_2ALEXA.1 · AlertBell polish

**Por quê:** ganho UX rápido. Polish do `AlertBell` para destacar `arrival`
+ tempo decorrido + botão "Iniciar atendimento" inline + toggle de som.

**Escopo:**
- `AlertBell.tsx` patches
- `useAppointmentInternalAlerts.ts` extends
- Sem migration

### Opção C · CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN · CRUD procedimentos

**Por quê:** procedimentos só são read no v2. Admin precisa CRUD UI.

**Escopo:**
- Rota `/configuracoes/procedimentos`
- CRUD: list + create + edit + soft-delete
- Sem migration (`procedures` table já existe)
- Sem provider externo

### Opção D · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · Builder de anamnese

**Por quê:** templates de anamnese ainda fixos. Builder permite criar
templates customizáveis por procedimento/profissional.

**Escopo:**
- Rota `/configuracoes/anamnese-templates`
- Builder de seções + campos (text, radio, checkbox, scale)
- Preview live
- Sem migration

---

## Recomendação

**Opção A** (CRM_PHASE_CONTROL.1) · ciclo de cleanup antes de mais features.
Pré-req cumprido (2AUX.2 + 1 port). Fechar débitos acumulados (zumbis +
Alexa dormente + 3 appts sem prof) deixa a base limpa para próximas fases
e reduz risco de regressão.

Alternativa: **Opção B** (2ALEXA.1) se quiser ganho UX visível antes do
cleanup.

---

## Mega-prompt template (Opção A)

```
CRM_PHASE_CONTROL.1 · DB SOURCE OF TRUTH + UI CONTROL FINAL AUDIT

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO chamar provider externo.
NÃO criar wa_outbox.
NÃO alterar cron ativo.
NÃO mexer em dados de produção (apenas schema/functions/views).

ESCOPO:
1. Audit DB completo (read-only):
   - 18 funções pg_proc com termos zumbi (em_consulta/pre_consulta/compareceu/reagendado)
   - 9 RPCs Alexa dormentes
   - 3 appointments sem professional_id (decidir: backfill, drop, ou manter)
   - FK orphans (appointments → leads/patients/professionals deletados)
   - RLS coverage (todas tabelas com policies de tenant)
   - Cron audit (worker 71 OFF · demais jobs canon)
2. Migration 175 (CONTROL cleanup) com:
   - DROP IF EXISTS para 18 funções zumbi (zero callers verificado)
   - DROP IF EXISTS para 9 Alexa RPCs dormentes
   - Sem mexer em dados · só schema
3. Smoke transacional + validation extensa
4. Docs matriz "antes/depois"
5. Commit local (push mediante autorização padrão)

PASS_CRM_PHASE_CONTROL1_AUDIT_OK_CLEANUP_APPLIED quando:
- 0 funções zumbi remanescentes
- 0 RPCs Alexa dormentes
- 0 FK orphans
- 0 RLS gaps
- can_continue=true
- typecheck OK
```

---

## Ordem de execução sugerida (próximas 4 fases)

| # | Fase | Risco | Pré-req | Bloqueia? |
|---|---|---|---|---|
| 1 | **CONTROL.1** (audit + cleanup) | médio | 2AUX.2 + 1 port ✓ | rollout pleno |
| 2 | **2ALEXA.1** OU **LEGACY.PORT.PROCEDURES_ADMIN** | baixo | nenhum | — |
| 3 | **LEGACY.PORT.ANAMNESIS_BUILDER** | baixo | nenhum | — |
| 4 | **LEGACY.PORT.PRONTUARIO** | médio | 2AUX.2 | — |

**Bloqueadas até unban Meta:**
- 2ALEXA.3+ (Alexa real)
- LEGACY.PORT.BIRTHDAYS
- 2L.2.1 (template approval mirror)
- 2T (conversas envio outbound real)
