# CRM_PARITY_PATCH_F · Smoke Checklist + E2E Evidence

**Branch:** `crm/parity-patch-agenda-finalization` @ `3e7ca3e`
**Data:** 2026-05-17
**Patches acumulados:** A+B (45d06ba) → 0C (de8712e) → C (8ea3378) → D (3e7ca3e)

## ✅ Evidência Playwright público (PASS · contra prod URL)

Rodado nesta sessão sem necessidade de start local · `LARA_E2E_URL=https://lara.miriandpaula.com.br`.

**11/11 specs PASS** em 21s · zero side-effect:

| Spec | Tests | Resultado |
|---|---|---|
| `e2e/auth-gate.spec.ts` | 7 | ✅ middleware redirect /crm/* → /login + preserva querystring + /login + /orcamento/<token> público |
| `e2e/public-login.spec.ts` | 2 | ✅ /login renderiza form + sem erros JS |
| `e2e/public-orcamento.spec.ts` | 2 | ✅ /orcamento/<token-inválido> → 404 + path vazio → 404 |
| `e2e/public-orcamento-token.spec.ts` | 4 | ✅ UUID inexistente + malformado + path /orcamento/ + sem auth gate |

**Comando reproducível:**
```bash
cd apps/lara
LARA_E2E_URL=https://lara.miriandpaula.com.br pnpm exec playwright test \
  e2e/public-orcamento-token.spec.ts \
  e2e/public-orcamento.spec.ts \
  e2e/public-login.spec.ts \
  e2e/auth-gate.spec.ts --reporter=line
```

## ⏸️ Playwright autenticado · BLOCKED

**Razão:** falta `TEST_USER_*` em `.env.local` + `TEST_*` secrets em GitHub Actions.

`test.skip(!HAS_TEST_ENVS, ...)` está ativo nos 4 specs autenticados:
- `e2e/authed/lead-create.spec.ts`
- `e2e/authed/agenda-block-time.spec.ts`
- `e2e/authed/mesa-archive.spec.ts`
- `e2e/authed/orcamento-bulk-export.spec.ts`

**Setup one-time (Alden · ~2min):**
```bash
SUPABASE_ACCESS_TOKEN=sbp_... pnpm --filter lara e2e:setup
```

Output gera 4 envs pra colar em GitHub Settings → Secrets → Actions:
- `TEST_SUPABASE_URL` (= `https://oqboitkpcvuaudouwvkl.supabase.co`)
- `TEST_SUPABASE_ANON_KEY`
- `TEST_USER_EMAIL_OWNER` (= `e2e-test@miriandpaula.com.br`)
- `TEST_USER_PASSWORD`

Bonus: `SUPABASE_ACCESS_TOKEN` (mesmo sbp_) habilita cleanup automático no CI.

**Após setup**, CI `lara-e2e.yml` (workflow_dispatch) roda happy path em PRs.

## ⏸️ Visual regression baseline · BLOCKED

**Razão:** `pnpm start` background-bind foi denied pelo auto-mode na sessão anterior (Patch 3 audit). Specs públicos rodaram contra **prod URL** (read-only · não muta) mas screenshots locais exigem server local up.

**Alden roda manualmente quando quiser baseline:**
```bash
pnpm --filter lara build
pnpm --filter lara start &  # ou em outro terminal
# Após "ready on localhost:3005":
LARA_E2E_URL=http://localhost:3005 pnpm --filter lara exec playwright test \
  --update-snapshots e2e/visual-login.spec.ts
```

## 📋 Checklist smoke manual · 7 rotas CRM

**Pré-req:** login em `https://lara.miriandpaula.com.br/login` com conta operacional.

### /crm (Home)
- [ ] Página carrega sem erro 5xx
- [ ] Topbar aparece (breadcrumb + search + actions + avatar)
- [ ] **AlertBell renderiza** (sininho real · sem badge "24" fake)
- [ ] Badge AlertBell mostra `0` ou número real de `appointment_internal_alerts` não-lidos
- [ ] Tasks button (CheckSquare) **sem badge "24" fake** · só ícone + title "em validação"
- [ ] Sidebar com 10 items navegáveis · nenhum 404
- [ ] Logout via avatar dropdown funcional

### /crm/leads
- [ ] Lista carrega com filtros funcionais
- [ ] Botão "Novo Lead" abre wizard 3-step (Identificação → Origem → Operação)
- [ ] **Telefone duplicado** mostra banner inline antes do submit · botão "Abrir lead atual"
- [ ] Email duplicado idem (no Step 1 onBlur)
- [ ] **Tags quebradas NÃO aparecem** em bulk actions (UI removida)
- [ ] Marcar perdido (lifecycle) funcional · NÃO via finalize de consulta
- [ ] Bulk phase/lost/export CSV operacionais

### /crm/agenda
- [ ] Calendário week/day/month renderiza
- [ ] KPIs Agendados / Sem Confirm / No-show / Prev|Fat com números reais
- [ ] Filtros (status/profissional/tipo/financeiro/origem/avaliação) · disabled com title quando vazio
- [ ] Botão "Finalizar Dia" abre modal com summary + openItems (read-only)
- [ ] Botão "Bloquear horário" abre modal · status=bloqueado vai pro calendário
- [ ] **Wizard "Novo agendamento":**
  - [ ] Campo `paymentMethod` (select) presente
  - [ ] Campo `paymentStatus` (enum) presente
  - [ ] `cortesia`/`isento` exigem motivo (≥3 chars · placeholder "Ex: primeira consulta, parceria...")
  - [ ] Validação de período (manhã/tarde/almoço) bloqueia slot fora · feedback claro
  - [ ] Validação antecedência mínima
  - [ ] Conflito de horário mostra mensagem específica ("Prof X já tem consulta às HH:MM com Y" / "Paciente já tem agenda" / "Sala ocupada")
- [ ] Detalhe consulta (`/crm/agenda/[id]`):
  - [ ] Cancelar modal exige motivo (≥3 chars)
  - [ ] No-show modal exige motivo
  - [ ] **Banner amarelo "Pagamento pendente"** se status IN (pendente,parcial) · gate FE com override (checkbox "confirmo cobrança separada")
  - [ ] FinalizeWizard só oferece 3 outcomes (paciente/orcamento/paciente_orcamento) · **'perdido' NÃO aparece**
  - [ ] LeadLostModal separado · botão "Marcar como perdido" disparou `lead_lost` RPC dedicado
- [ ] Drag&drop com cursor grab/grabbing + title "arraste para reagendar"
- [ ] Drag em appointment status terminal · title explica "não pode ser reagendado por arrastar"
- [ ] **Nenhuma mensagem WhatsApp disparada** durante smoke

### /crm/mesa-operacional
- [ ] 7 buckets carregam (lead/agendado/paciente/orcamento/paciente_orcamento/perdido/arquivado)
- [ ] KPI row totais
- [ ] Cards com botões Chegou/Cancelar/Perder/Arquivar conforme bucket
- [ ] **Arquivar modal:** título "Arquivar registro? · <nome>" + descrição "O registro sairá da operação diária, mas o histórico será preservado..."
- [ ] **Reativar modal:** título "Reativar registro arquivado? · <nome>" + descrição "volta para operação como ativo, preservando fase original"
- [ ] Botão confirm: "Reativar" (não "Desarquivar")
- [ ] Bucket arquivado tem Reativar como ÚNICA ação
- [ ] AlertBell topbar mostra arrivals reais
- [ ] **lifecycle arquivado/ativo preserva phase** (lead vai pra bucket original ao reativar)

### /crm/pacientes/[id] (qualquer paciente)
- [ ] 10 abas: Visão geral / Dados / Agenda / Procedimentos / Anamnese / **Consentimento** / Orçamentos / Timeline / Documentos / Notas
- [ ] **Tab Consentimento (NOVA):**
  - [ ] 4 KPI cards: Consultas / Assinado / Pendente / Recusado
  - [ ] Tabela por appointment: data + procedimento + badge `consentimento_img` + status anamnese + completedAt + link "Abrir"
  - [ ] Empty state real se paciente sem consultas
  - [ ] Nota inline sobre `legal_doc_requests` (não integrado ainda)
- [ ] **Tab Agenda:** link "Abrir" em cada row leva pra `/crm/agenda/[id]` · cursor pointer
- [ ] **Tab Orçamentos:** botão "+ Novo orçamento" no header
  - [ ] Se paciente tem leadId (via fallback `orcamentos[0].leadId` OU `appointments[].leadId`) → link `/crm/orcamentos/novo?leadId=<id>`
  - [ ] Se null → botão disabled com title "Sem lead de origem · crie a partir de /crm/leads"

### /crm/orcamentos
- [ ] Lista carrega com 6 KPIs + filtros
- [ ] **Checkbox seleção** em cada row
- [ ] **Toolbar bulk aparece** com ≥1 selecionado
- [ ] Bulk actions: marcar enviado / aprovado / perdido (motivo)
- [ ] Botão "Exportar CSV" presente
- [ ] Empty state real se zero orçamentos
- [ ] Detalhe orçamento (`/crm/orcamentos/[id]`) preservado

### /crm/recuperacao
- [ ] 3 buckets renderizam (Vencidos vermelho · Hoje amber · Próximos 7 dias primary)
- [ ] **Empty states refinados:**
  - [ ] Vencidos vazio: "Nenhum follow-up vencido · operação sem atrasos"
  - [ ] Hoje vazio: "Nenhum follow-up agendado para hoje"
  - [ ] Próximos vazio: "Nenhum follow-up nos próximos 7 dias"
- [ ] **Dry-run notice** banner amber: "Painel interno · modo seguro (dry-run) · Mensagens automáticas podem estar em modo seguro/dry-run conforme configuração do worker..."
- [ ] Modal "Definir próxima ação" funcional
- [ ] **Nenhum WhatsApp/provider chamado**

## ✅ Guardrails arquiteturais

| Item | Como validar | Resultado esperado |
|---|---|---|
| `perdido` NÃO em finalize | grep `outcome.*'perdido'` em `_actions/appointment.actions.ts` | só TYPE retorno + guard defensivo |
| FinalizeWizard só 3 outcomes | inspecionar select em `/crm/agenda/[id]` modal finalizar | 3 options (paciente/orcamento/paciente_orcamento) |
| LeadLostModal separado | botão "Marcar como perdido" dispara `markLeadLostAction` → `lead_lost` RPC | confirmar no Network tab |
| `appointment_finalize` backend ainda aceita perdido | documentado em `BACKEND_SQL_GUARD_PENDING.md` | mig SQL pendente · runtime app bloqueia |
| Worker 71 OFF | sem envio WhatsApp em qualquer fluxo | confirmar via SQL se possível |

## 📌 Pendências antes de release (Prompt 4 GO)

1. **SQL guard `appointment_finalize`** · aplicar mig nova bloqueando `'perdido'` no backend (BACKEND_SQL_GUARD_PENDING.md)
2. **Migrations 875/876** (clinic-dashboard) · aplicar via Management API
3. **Setup E2E auth** · `pnpm e2e:setup` one-time (gera 4 secrets)
4. **Browser smoke manual** · checklist acima
5. **PRs:**
   - `https://github.com/AldenQuesada/clinicai-v2/pull/new/crm/parity-patch-agenda-finalization`
   - `https://github.com/AldenQuesada/clinic-dashboard/pull/new/crm/rpcs-archive-finalize-day`
6. **Worker 71 / jobs 89/90/92** · auditar SQL prod real antes de qualquer ativação (Patch E)

## Próximo passo recomendado

- **Patch F passou local** → preparar PR consolidado da branch
- **Patch E (Automações)** SÓ DEPOIS de Patch F · GO separado por job · cada cron requer aprovação individual
