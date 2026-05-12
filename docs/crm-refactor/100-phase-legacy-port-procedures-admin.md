# CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN · CRUD admin de procedimentos

> Portabilidade controlada do legacy · gestão canônica de procedimentos.
> **Zero migration** · DB já tinha tabela + RLS policies completas. Trabalho
> concentrado em repository CRUD + actions + UI admin.

---

## 1. Resumo executivo

A clínica usa procedimentos diariamente · wizard de agendamento, orçamentos,
dashboards, Copilot. Antes desta fase, v2 só tinha **read** via `ProcedureRepository`
(que intencionalmente esconde preço para IA). Faltava CRUD admin com
visibilidade total de preço/promo/duração.

Entrega:

- **`ProcedureAdminRepository`** (novo · separado do price-blind) · 6 métodos
  CRUD sobre `public.clinic_procedimentos`
- **3 server actions** com Zod + role gate (owner/admin)
- **UI** `/configuracoes/procedimentos` · table responsiva + dialogs Create/Edit
- **Tab "Procedimentos"** em `/configuracoes` migrada de ComingSoonPanel para
  Link panel apontando para a rota dedicada

**Decisão arquitetural:** ZERO migration. DB já entregava tudo:
- `clinic_procedimentos` table com 18 colunas (incluindo preco/preco_promo/duracao_min)
- RLS habilitada com 4 policies (SELECT/INSERT/UPDATE/DELETE)
- Mutações exigem `app_role() ∈ ('admin','owner')` via policy

Veredito: **`PASS_CRM_LEGACY_PORT_PROCEDURES_ADMIN_READY_LOCAL_COMMIT`**

---

## 2. Estado inicial

- HEAD: `cd92360`
- Branch `main` sincronizado
- `clinic_procedimentos` table com **44 procedimentos** (44 ativos · 0 inativos)
- `procedures` table separada (Prisma · ignorada · provavelmente Mira-related)
- `ProcedureRepository` (read-only price-blind) já existia · não tocado
- `/configuracoes` tab "Procedimentos" era ComingSoonPanel

---

## 3. O que foi portado/recriado do legacy

### Conceitos preservados

| Legacy (`procedimentos.js`) | V2 equivalente |
|---|---|
| Listagem com KPIs | `ProceduresAdminClient` · 5 KPI cards (total/ativos/inativos/preço a definir/com promoção) |
| Filtros (busca + status + categoria) | 3 filtros via searchParams · zero localStorage |
| Form criar/editar | Dialog modal único · `ProcedureFormDialog` (cria OU edita conforme `initial`) |
| Toggle ativo/inativo | Botão Power inline na linha |
| Soft delete | **NÃO implementado** · `ativo=false` cobre soft delete · DELETE destrutivo deferido |
| Categorias dinâmicas | `<datalist>` no form preenchido com categorias existentes da clínica |

### O que foi descartado

| Legacy | Motivo |
|---|---|
| `ProcedimentosCache` (localStorage) | searchParams é fonte da verdade · cache via Next.js revalidation |
| Insumos vinculados | Out of scope · deferido (não há tabela `insumos` integrada) |
| Cache de preço sazonal | Deferido · `partner_pricing_json` já existe no DB para B2B |
| Form com 30+ campos clínicos | UI admin foca em 8 essenciais · campos avançados podem entrar em phase 2 |

---

## 4. Contrato DB (read-only · sem migration)

| Coluna | Tipo | Notes |
|---|---|---|
| `id` | uuid PK | gen_random_uuid() default |
| `clinic_id` | uuid NOT NULL | RLS scopes |
| `nome` | text | required |
| `categoria` | text | nullable |
| `tipo` | text | 'avulso'/'combo'/... default 'avulso' |
| `descricao` | text | nullable |
| `preco` | numeric/double | default 0 · zero = "a definir" |
| `preco_promo` | numeric/double | nullable · ≤ preco enforced via Zod |
| `duracao_min` | integer | nullable |
| `sessoes` | integer | default 1 |
| `ativo` | boolean | default true |
| `observacoes` | text | nullable |
| `partner_pricing_json` | jsonb | B2B · não exposto no admin v2 |
| outros (margem/custo_estimado/combo_*/fases/contraindicacoes/...) | jsonb/numeric | preserved · não exposto no admin form |
| `created_at`, `updated_at` | timestamptz | |

RLS policies (já existem · não alteradas):

```
SELECT: authenticated · clinic_id = app_clinic_id()
INSERT: authenticated · clinic_id = app_clinic_id() AND app_role() IN ('admin','owner')
UPDATE: authenticated · mesmo gate
DELETE: authenticated · mesmo gate
```

---

## 5. Contrato de preço

| Caso | Display | Validation |
|---|---|---|
| `preco > 0` | `R$ X,XX` formatado pt-BR | aceito |
| `preco = 0` ou `NULL` | "a definir" (italic muted) | aceito (Zod nullable) |
| `preco_promo > preco` | bloqueado | Zod `refine` rejeita com erro `promo_maior_que_preco` |
| `preco_promo = NULL` | "—" | OK |
| `preco_promo > 0 AND preco <= 0` | bloqueado | Zod exige preco > 0 para validar promo |

DB **NÃO tem CHECK constraint** para promo > preco · Zod no app layer é o gate.
Documentado como decisão · adicionar CHECK pode ser CONTROL.3.

---

## 6. Repository / Actions

### `ProcedureAdminRepository`

| Método | Propósito |
|---|---|
| `list(filter)` | Paginated · filtro por search/status/categoria |
| `getById(id)` | Detalhe |
| `listCategorias()` | Distinct categorias (alimenta datalist) |
| `getCounts()` | KPI dashboard (total/active/inactive/priceUndefined/withPromo) |
| `create(clinicId, input)` | INSERT · clinic_id explícito (defense-in-depth) |
| `update(id, input)` | UPDATE parcial · auto-set `updated_at` |
| `setActive(id, active)` | Wrapper sobre `update` |

DTO: `AdminProcedureDTO` (camelCase) · contrato camel-snake mapping no `mapRow()`.

### Server actions (Zod + role gate)

| Action | Schema | Effect |
|---|---|---|
| `createProcedureAction` | `ProcedureCreateSchema` | INSERT + `updateTag(appointments)` |
| `updateProcedureAction` | `ProcedureUpdateSchema` (com id) | UPDATE + `updateTag(appointments)` |
| `setProcedureActiveAction` | `ProcedureSetActiveSchema` | toggle ativo |

Todas: `requireRole(ctx.role, ['owner','admin'])` em camada TS + RLS no DB.

---

## 7. UI entregue

### `/configuracoes/procedimentos`

- **PageHeader** + breadcrumb
- Banner amarelo "modo leitura" se role não é admin/owner
- **5 KPI cards** (Total / Ativos / Inativos / Preço a definir / Com promoção)
- **3 filtros** (Busca · Status · Categoria) via searchParams
- Botão "Novo procedimento" (admin only)
- **Tabela responsiva** (overflow-x · min-w-760px):
  Nome (com descrição truncada) · Categoria · Duração · Preço · Promo · Status · Ações
- Status badge: Ativo (emerald) / Inativo (muted)
- Ações inline: Editar (Pencil) · Toggle ativo (Power)
- **Dialog modal** Create/Edit:
  - Form 2 colunas: Nome (required) · Categoria (autocomplete via datalist)
  - 4 colunas: Duração · Sessões · Preço · Promo
  - Descrição (textarea 3 rows)
  - Observações internas (textarea 2 rows)
  - Checkbox "Ativo (aparece no wizard)"
  - Error display tradução PT-BR

### `/configuracoes` (tab integration)

- Tab "Procedimentos" agora abre `ProceduresLinkPanel`
- CTA "Abrir gestão de procedimentos →" link para `/configuracoes/procedimentos`
- Tab continua visível para todos roles · RLS bloqueia mutações para non-admin

---

## 8. Wizard integration

**Não alterado nesta fase.** Wizard `/crm/agenda/novo` continua aceitando
`procedureName` como texto livre (input). O usuário pode digitar qualquer
nome. Para port futuro:

- Substituir text input por Select com lista de procedimentos ativos
- FK `appointments.procedure_id` (não existe ainda) ou manter texto

Decisão: **out of scope** desta fase · admin CRUD é pré-requisito · wizard
polish virá em phase futura (2AUX.3 ou LEGACY.PORT.WIZARD_PROCEDURES).

Dashboards/orçamentos continuam funcionando · não dependem de FK.

---

## 9. Migration

**ZERO migration aplicada.** DB pré-existente entrega:
- `clinic_procedimentos` table completa
- 4 RLS policies (SELECT/INSERT/UPDATE/DELETE)
- 44 procedimentos ativos com data real
- Multi-tenant via `clinic_id` JWT + `app_role()` gate

Não há `appointments_pkey` para procedures (only id) · sem índices adicionais
necessários para a UI atual.

---

## 10. Smoke (transacional · ROLLBACK)

`docs/crm-refactor/sql/phase-legacy-port-procedures-admin-smoke.sql`

| Test | Cobertura | Resultado |
|---|---|---|
| A | INSERT fixture (clinic_id explícito) | ✅ count incrementou |
| B | UPDATE nome + preço | ✅ persistiu |
| C | Toggle `ativo=false` | ✅ persistiu |
| D | Re-toggle `ativo=true` | ✅ persistiu |
| E | Promo violation baseline | 0 (production clean) |
| safety | `wa_outbox_delta` | 0 |
| safety | `worker71_off_still` | true |

ROLLBACK forçado · `RAISE EXCEPTION P0001` · HTTP 400 esperado · zero efeito persistente.

---

## 11. Validation

```json
{
  "worker71_off": true,
  "procedures_contract_ready": true,
  "procedures_admin_ready": true,
  "promo_constraint_ok": true,
  "wizard_source_ready": true,
  "unsafe_outbox_count": 0,
  "phase_perdido_count": 0,
  "cron_with_provider_call": 0,
  "active_procedures_count": 44,
  "can_continue": true
}
```

---

## 12. Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| DB sem CHECK promo ≤ preco | 🟡 médio | Zod no app layer · documentado · CHECK pode entrar em CONTROL.3 |
| Wizard ainda usa texto livre | 🟡 médio | Admin CRUD é pré-req · port wizard em phase dedicada |
| DELETE destrutivo não implementado | 🟢 baixo | Toggle ativo cobre soft delete · prevents data loss |
| 44 procedimentos com `preco=0` | 🟢 baixo | "a definir" UX deliberado · clínica pode editar agora |
| Permission gate UI vs RLS DB | 🟢 baixo | Defense-in-depth · UI bloqueia botão · DB bloqueia mutação |
| `partner_pricing_json` não exposto | 🟢 baixo | B2B-specific · pode entrar em LEGACY.PORT.B2B_PARTNER_PRICING |

---

## 13. O que NÃO foi feito

- ❌ Migration nova
- ❌ Wizard `Select` de procedures (continua text-free)
- ❌ `FK appointments.procedure_id`
- ❌ Insumos vinculados ao procedimento
- ❌ Multi-procedimento por appointment (1 procedure_name por appt atual)
- ❌ Validation server-side de promo ≤ preco em CHECK constraint
- ❌ Audit log dedicado (logs estruturados via `createLogger` cobrem)
- ❌ Bulk import CSV
- ❌ B2B partner pricing UI
- ❌ Soft-delete com tabela `deleted_at` (não existe na tabela)

---

## 14. Próxima fase

Ver [`101-next-prompt-after-procedures-admin.md`](101-next-prompt-after-procedures-admin.md).

Recomendado:
- **2ALEXA.2** (painel-TV recepção · expandir UX visual)
- **LEGACY.PORT.ANAMNESIS_BUILDER** (templates customizáveis)
- **LEGACY.PORT.WIZARD_PROCEDURES** (wizard usar Select FK · upgrade do 2AUX.2)

---

## 15. Veredito

**`PASS_CRM_LEGACY_PORT_PROCEDURES_ADMIN_READY_LOCAL_COMMIT`**

CRUD admin de procedimentos entregue · zero migration · zero provider ·
zero wa_outbox · RLS dupla-camada (TS + DB). Tab `/configuracoes` integrada
via Link panel. Smoke transacional 4 cenários PASS. Validation all green.
44 procedimentos ativos prontos para gestão admin.
