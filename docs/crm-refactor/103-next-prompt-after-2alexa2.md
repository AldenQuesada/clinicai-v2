# CRM · Next Prompt After 2ALEXA.2

> 2ALEXA.2 entregou painel-TV recepção em `/recepcao/painel`. Modo kiosk
> read-only · 4 blocos (chegaram/em atendimento/atrasados/próximos) · zero
> migration · zero provider · zero dado clínico sensível.

---

## Estado consolidado pós-2ALEXA.2

- HEAD esperado pós-push: novo commit `feat(crm): add reception status panel`
- Rota `/recepcao/painel` operacional (modo kiosk)
- Server Component com `revalidate=15` + ticker client-side 30s
- Reusa `AppointmentRepository.listByDate` (zero novo backend)
- Privacidade: telefone mascarado · sem joins clínicos
- Smoke + validation read-only PASS
- Worker 71 OFF · `can_continue=true`

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

### Opção A · CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · Select FK no wizard (RECOMENDADA)

**Por quê:** com PROCEDURES_ADMIN entregue, wizard `/crm/agenda/novo` pode
ser upgrade. Hoje aceita `procedureName` texto livre · ideal: Select com
lista de procedimentos ativos + auto-fill duração/preço.

**Escopo:**
- `apps/lara/src/app/crm/agenda/novo/_form.tsx` patches:
  - Select de procedimentos (read via `ProcedureRepository.getActiveByClinic`)
  - Auto-fill `endTime` baseado em `duracao_min` quando procedure selecionado
  - Auto-fill `value` quando procedure selecionado (preço se > 0)
- Manter fallback "Outro · digitar nome" para flexibilidade
- Sem FK em `appointments.procedure_id` (deferir · só armazena `procedure_name`)
- Schema Zod aceita `procedureId` opcional + `procedureName` mantido
- Sem migration · sem provider externo

### Opção B · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · Builder anamnese

**Por quê:** templates de anamnese ainda fixos no v2. Builder permite
customizar templates por procedimento/profissional.

**Escopo:**
- Rota `/configuracoes/anamnese-templates`
- Builder de seções + campos (text, radio, checkbox, scale)
- Preview live
- Mig nova se tabela `anamnesis_templates` não existir

### Opção C · CRM_PHASE_LEGACY.PORT.PRONTUARIO · Prontuário detalhado

**Por quê:** v2 tem CRUD básico de pacientes · prontuário clínico
detalhado (timeline + anamneses + documentos) não foi portado.

**Escopo:**
- Rota `/crm/pacientes/[id]/prontuario` (ou tab no detail page)
- Timeline de appointments + anamneses + consents
- Histórico clínico
- Sem migration (tabelas pré-existentes)

### Opção D · CRM_PHASE_CONTROL.3 · Residual cleanup

**Por quê:** débitos remanescentes:
- 15 zumbi functions com literais em comments
- `clinic_alexa_config` rows residuais
- 3 appts sem `professional_id`
- CHECK constraint `preco_promo <= preco`

**Status:** baixa prioridade · refactor cosmético.

### Opção E · CRM_PHASE_2L.2.1 · Meta template approval mirror (BLOQUEADO)

**Por quê:** depende de unban Meta.

---

## Recomendação

**Opção A** (WIZARD_PROCEDURES) · fecha o loop entre PROCEDURES_ADMIN
recém-entregue e o wizard de agendamento. UX immediate · admin cadastra
procedimento → wizard sugere ao agendar. Sem provider · sem migration.

Alternativa: **Opção C** (PRONTUARIO) para fechar visão clínica do paciente
após procedimentos catalogados.

---

## Mega-prompt template (Opção A)

```
CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · Select FK no wizard

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO chamar provider.
NÃO criar wa_outbox.

ESCOPO:
1. Patch /crm/agenda/novo/_form.tsx:
   - Adicionar Select de procedimentos (read via repository)
   - Auto-fill endTime quando procedure tem duracao_min
   - Auto-fill value quando procedure tem preco > 0
   - Mostrar "preco promocional" se disponível
2. Schema Zod aceita procedureId opcional + procedureName fallback
3. /crm/agenda/[id]/editar patches semelhantes
4. Smoke transacional opcional + validation
5. Typecheck + commit local

PASS_CRM_LEGACY_PORT_WIZARD_PROCEDURES_READY quando:
- Wizard com Select renderiza
- Auto-fill duração e preço funcionam
- typecheck OK
```

---

## Ordem de execução sugerida (próximas fases)

| # | Fase | Risco | Pré-req | Status |
|---|---|---|---|---|
| 1 | **LEGACY.PORT.WIZARD_PROCEDURES** | baixo | PROCEDURES_ADMIN ✓ | recomendada |
| 2 | **LEGACY.PORT.PRONTUARIO** | médio | 2AUX.2 ✓ | médio prazo |
| 3 | **LEGACY.PORT.ANAMNESIS_BUILDER** | médio | nenhum | médio prazo |
| 4 | **CONTROL.3** (residual cleanup) | baixo | CONTROL.2 ✓ | baixa prioridade |

**Bloqueadas até unban Meta:**
- 2ALEXA.3+ · Alexa real
- LEGACY.PORT.BIRTHDAYS · automations envio
- 2L.2.1 · template approval mirror
- 2T · conversas envio outbound real
