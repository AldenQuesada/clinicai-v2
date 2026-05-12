# CRM · Next Prompt After PROCEDURES_ADMIN

> LEGACY.PORT.PROCEDURES_ADMIN entregou CRUD admin de procedimentos.
> Zero migration · 44 procedimentos ativos prontos para gestão. Tab
> `/configuracoes` integrada via Link panel.

---

## Estado consolidado pós-PROCEDURES_ADMIN

- HEAD esperado pós-push: novo commit `feat(crm): add procedures admin`
- `ProcedureAdminRepository` novo (separado do price-blind `ProcedureRepository`)
- 3 server actions com Zod + role gate (owner/admin)
- UI `/configuracoes/procedimentos` com KPIs + filtros + table + dialog form
- Tab `/configuracoes` "Procedimentos" agora mostra `ProceduresLinkPanel`
- Smoke transacional PASS · Validation flags todos verdes
- Typecheck OK · `can_continue=true`

---

## Regras invioláveis (continuam)

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO chamar provider externo
- NÃO criar `wa_outbox` row
- NÃO usar `phase='perdido'`
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2ALEXA.2 · Painel-TV recepção (RECOMENDADA)

**Por quê:** AlertBell já entrega dashboard pessoal. Painel-TV é modo
kiosk full-screen para recepção · cards grandes "Paciente chegou" com
nome + sala + procedimento + relógio + próximo paciente. Sem provider ·
sem mutação · só read-only.

**Escopo:**
- Rota `/recepcao/painel` · full-screen layout
- Cards grandes · poll 15s ou Supabase Realtime
- Reusa `appointment_internal_alerts` (mig 161)
- Reusa `commercial_recovery_workflow_view` (2RC.1)
- Mostra próximas chegadas + último horário registrado
- Sem provider externo · sem migration nova

### Opção B · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · Builder anamnese

**Por quê:** templates de anamnese ainda fixos. Builder permite
customizar templates por procedimento/profissional.

**Escopo:**
- Rota `/configuracoes/anamnese-templates`
- Builder de seções + campos (text, radio, checkbox, scale)
- Preview live
- Mig nova se tabela `anamnesis_templates` não existir

### Opção C · CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · Wizard usa Select FK

**Por quê:** wizard `/crm/agenda/novo` ainda usa `procedureName` como texto
livre. Com admin CRUD entregue, pode-se converter para Select com lista
de procedimentos ativos da clínica.

**Escopo:**
- `apps/lara/src/app/crm/agenda/novo/_form.tsx` patches:
  - Select de procedimentos ativos
  - Auto-fill duração padrão quando procedure selecionado
  - Auto-fill preço padrão (com promo se disponível)
- Schema Zod aceita `procedureId` UUID opcional
- Sem migration (FK `procedure_id` opcional · deferido)
- Repository `ProcedureRepository.getActiveByClinic()` já existe

### Opção D · CRM_PHASE_LEGACY.PORT.PRONTUARIO · Prontuário detalhado

**Por quê:** v2 tem CRUD básico de pacientes (`/crm/pacientes`) · prontuário
clínico detalhado (histórico, anamneses, documentos) ainda não foi portado.

**Escopo:**
- Rota `/crm/pacientes/[id]/prontuario` (ou tab no detail page)
- Timeline de appointments + anamneses + consents
- Histórico clínico
- Sem migration (tabelas pré-existentes)

### Opção E · CRM_PHASE_CONTROL.3 · Residual cleanup

**Por quê:** débitos remanescentes pós-CONTROL.2:
- 15 zumbi functions com literais em comments (refactor cosmético)
- `clinic_alexa_config` table residual
- 3 appts sem `professional_id`
- Adicionar CHECK constraint `preco_promo <= preco` em `clinic_procedimentos`

**Status:** baixa prioridade · refactor sem ganho operacional imediato.

### Opção F · CRM_PHASE_2L.2.1 · Meta template approval mirror (BLOQUEADO)

**Por quê:** depende de unban Meta · fora do controle.

---

## Recomendação

**Opção A** (2ALEXA.2 painel-TV recepção) · expandir UX visual chegada para
recepção física da clínica. Reusa toda a infra existente (alerts + recovery
+ dashboards). Sem provider · sem migration · ganho UX visível.

Alternativa: **Opção C** (WIZARD_PROCEDURES) se Alden quer fechar o loop
com admin CRUD recém-entregue.

---

## Mega-prompt template (Opção A · 2ALEXA.2)

```
CRM_PHASE_2ALEXA.2 · PAINEL-TV RECEPÇÃO

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO chamar provider.
NÃO criar wa_outbox.
NÃO usar Notification API (sem permission prompt).

ESCOPO:
1. Rota /recepcao/painel · full-screen layout
2. Cards grandes "Paciente chegou":
   - Nome (display_name large)
   - Procedimento + Sala (se disponível)
   - Profissional
   - Tempo decorrido desde chegada (helper compartilhado com AlertBell)
3. Side panel: próximos 5 agendamentos com horário
4. Header: relógio + clinic name + total de chegadas hoje
5. Poll 15s (mais rápido que AlertBell 30s · TV refresh)
6. Modo kiosk-friendly (font sizes grandes · sem scroll horizontal)
7. Sem provider · sem migration
8. Smoke read-only + validation
9. Typecheck + commit local

PASS_CRM_2ALEXA2_PAINEL_TV_READY quando:
- /recepcao/painel renderiza
- 0 wa_outbox mutation
- typecheck OK
```

---

## Ordem de execução sugerida (próximas fases)

| # | Fase | Risco | Pré-req | Status |
|---|---|---|---|---|
| 1 | **2ALEXA.2** (painel-TV) | baixo | nenhum | recomendada |
| 2 | **LEGACY.PORT.WIZARD_PROCEDURES** | baixo | PROCEDURES_ADMIN ✓ | upgrade natural |
| 3 | **LEGACY.PORT.ANAMNESIS_BUILDER** | médio | nenhum | médio prazo |
| 4 | **LEGACY.PORT.PRONTUARIO** | médio | 2AUX.2 ✓ | médio prazo |
| 5 | **CONTROL.3** (residual cleanup) | baixo | CONTROL.2 ✓ | baixa prioridade |

**Bloqueadas até unban Meta:**
- 2ALEXA.3+ · Alexa real preflight/canary
- LEGACY.PORT.BIRTHDAYS · automations envio
- 2L.2.1 · template approval mirror
- 2T · conversas envio outbound real
