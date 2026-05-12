# CRM · Next Prompt After 2ALEXA.AUDIT

> Round 2ALEXA.AUDIT mapeou: V2 já entregou o nível dashboard de "paciente
> chegou" via `appointment_internal_alerts` + `AlertBell` (mig 161 · 2G).
> Alexa real é zumbi no DB (9 RPCs · 4 tabelas) e legacy-only no front.
> Recomenda começar com painel-TV antes de tocar em provider externo.

---

## Estado consolidado pós-2ALEXA.AUDIT

- HEAD esperado: novo commit local + push de `docs(crm): audit alexa welcome flow`
- 3 arquivos novos (apenas docs/SQL read-only):
  - `docs/crm-refactor/86-phase-2alexa-audit-welcome-flow.md`
  - `docs/crm-refactor/87-next-prompt-after-2alexa-audit.md`
  - `docs/crm-refactor/sql/phase-2alexa-audit-welcome-flow.sql`
- Audit SQL passou · `can_open_alexa_implementation_plan=true`
- Worker 71 OFF · zero envio · zero migration
- Zero código funcional alterado

---

## Regras invioláveis (continuam)

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO chamar Alexa API ou alexa-bridge externo
- NÃO criar automação real
- NÃO criar `wa_outbox` row
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_LEGACY.UI.AUDIT · Legacy UI Inventory & Port Plan (RECOMENDADA)

**Por quê:** o audit 2ALEXA revelou pelo menos 4 módulos do legacy que ainda
existem em produção e podem ter funcionalidade não-portada (agenda-automations,
funnel-automations, alexa-settings, rooms). Mapear o que existe legacy ×
v2 antes de continuar implementando fases verticais reduz risco de
divergência.

**Escopo:**
- Mapear `apps/lara/public/legacy/js/**` → módulos + rotas legacy ainda servidas
- Comparar com `apps/lara/src/app/**` · gaps de cobertura
- Doc de prioridade de port com riscos
- Sem alteração de código

### Opção B · CRM_PHASE_2ALEXA.1 · Internal welcome panel polish

**Por quê:** ganho rápido de UX · zero risco · zero infra externa. Polir
o `AlertBell` para destacar `arrival` com cor + tempo decorrido + botão
"Iniciar atendimento" inline.

**Escopo:**
- Sem migration · sem RPC nova
- `AlertBell.tsx` + `useAppointmentInternalAlerts.ts` patches
- Toggle de som local Web Audio API (localStorage)
- Smoke manual (sem migration nova)
- Commit local + push

### Opção C · CRM_PHASE_2ALEXA.2 · Reception dashboard (TV/painel)

**Por quê:** clínica precisa de painel visível na recepção sem cada
pessoa abrir o `AlertBell` no PC dela. Painel full-screen modo kiosk
mostra "Paciente chegou" com nome + sala + procedimento.

**Escopo:**
- Rota nova `/recepcao/painel` · RSC + Suspense
- Cards grandes · polling 15s ou Supabase Realtime
- Layout otimizado pra TV (vertical/horizontal)
- Sem provider externo · sem migration

### Opção D · CRM_PHASE_2ALEXA.3 · Alexa real preflight (DEFERIDO)

**Por quê:** só vale rodar quando bridge alexa-bridge + cookie+device
inventory estiverem checados. Requer autorização explícita + canary plan.
Recomendamos esperar 2ALEXA.1 e .2 estarem live antes.

**Escopo (preflight only · sem envio):**
- Auditar alexa-bridge status (acessível? cookie válido?)
- Mapear devices reais conectados (rede da clínica)
- Documentar pipeline canary
- ENV/secrets manager design
- Kill switch design
- **NÃO** chamar bridge real nesta fase preflight

### Opção E · CRM_PHASE_2S · Soft-delete admin canon (pendente desde 2I.1)

**Por quê:** débito técnico documentado · ainda sem implementação.
Override auditável para admin restaurar items descartados.

---

## Recomendação

**Opção A** (LEGACY.UI.AUDIT) · ciclo continuado de auditoria zero-risk.
O audit 2ALEXA mostrou que múltiplos módulos legacy ainda têm
funcionalidade não-portada · vale mapear tudo antes de continuar
verticalizando fases. Após Legacy UI Audit, fazer 2ALEXA.1 (polish do
AlertBell) é o melhor delivery de UX imediato.

---

## Mega-prompt template (Opção A)

```
CRM_PHASE_LEGACY.UI.AUDIT · LEGACY UI INVENTORY & PORT PLAN (READ-ONLY)

REGRA ABSOLUTA:
NÃO alterar código.
NÃO criar migration.
NÃO ativar job 71.
NÃO enviar WhatsApp.
NÃO chamar provider.

ESCOPO:
1. Inventário de apps/lara/public/legacy/js/** · listar módulos + rotas
2. Cross-reference com apps/lara/src/app/** · gaps de cobertura
3. Classificar cada módulo: PORTADO | ZUMBI | LEGACY-ONLY | DESCARTAR
4. Estimar effort + risco de port para cada módulo legacy
5. Doc final: docs/audits/legacy-ui-inventory-<DATA>.md
6. Commit + push de docs apenas

PASS_CRM_PHASE_LEGACY_UI_AUDIT_OK quando:
- inventário completo
- gaps documentados com risco/priority
- zero alteração de código
- commit + push docs only
```
