# CRM · Next Prompt After 2ALEXA.1

> 2ALEXA.1 entregou polish visual do AlertBell (emerald arrival highlight,
> tempo decorrido inline, link rápido, toggle de som local opcional). Zero
> migration · zero provider · zero `wa_outbox`.

---

## Estado consolidado pós-2ALEXA.1

- HEAD esperado pós-push: novo commit `style(crm): polish arrival alert bell`
- AlertBell.tsx reescrito com:
  - Destaque emerald para `arrival` (cor + bg + título bold)
  - `elapsedLabel()` helper PT-BR + `useTicker` 30s
  - Link `/crm/agenda/[id]` para todos alertas
  - Toggle "Som local" via Web Audio API + localStorage UI preference
  - Agrupamento "Chegadas agora" / "Outros alertas"
- Backend: zero alteração (reaproveitado hook + RPCs 2G existentes)
- Validation + smoke read-only PASS
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

### Opção A · CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN · CRUD procedimentos (RECOMENDADA)

**Por quê:** procedimentos só são read no v2. Admin precisa CRUD UI para
cadastrar/editar/desativar. ROI operacional alto · clínica usa dia-a-dia
para popular wizard de agendamento.

**Escopo:**
- Rota `/configuracoes/procedimentos`
- CRUD: list + create + edit + soft-delete
- Repository `ProcedureRepository` já existe (read) · adicionar mutations
- Mig opcional (RPCs · tabela `procedures` já existe)
- Sem provider externo · sem WhatsApp · sem cron

### Opção B · CRM_PHASE_2ALEXA.2 · Painel-TV recepção

**Por quê:** AlertBell já entrega dashboard pessoal. Painel-TV é modo
kiosk full-screen para recepção · cards grandes "Paciente chegou" com
nome + sala + procedimento + relógio + próximo paciente.

**Escopo:**
- Rota `/recepcao/painel` · full-screen layout
- Cards grandes · poll 15s ou Supabase Realtime
- Sem mutação · só read-only
- Sem provider externo

### Opção C · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · Builder anamnese

**Por quê:** templates de anamnese ainda fixos no v2. Builder permite
customizar templates por procedimento/profissional.

**Escopo:**
- Rota `/configuracoes/anamnese-templates`
- Builder de seções + campos (text, radio, checkbox, scale)
- Preview live
- Mig nova (tabela `anamnesis_templates` se não existe)

### Opção D · CRM_PHASE_CONTROL.3 · Residual cleanup

**Por quê:** débitos remanescentes pós-CONTROL.2:
- 15 zumbi functions com literais em comments (refactor cosmético)
- `clinic_alexa_config` tabela com rows residuais (audit + decisão)
- `clinic_rooms.alexa_device_name` coluna (DROP COLUMN se null em prod)
- 3 appointments sem `professional_id` (admin backfill manual)

**Status:** baixa prioridade · refactor sem ganho operacional imediato.

### Opção E · CRM_PHASE_2L.2.1 · Meta template approval mirror (BLOQUEADO)

**Por quê:** depende de unban Meta · fora do controle.

---

## Recomendação

**Opção A** (LEGACY.PORT.PROCEDURES_ADMIN) · ROI operacional alto. Clínica
cadastra procedimentos diariamente · UI v2 atual só lê · admin precisa
criar/editar. Sem provider externo · sem migration custosa · ganho operacional
imediato.

Alternativa: **Opção B** (2ALEXA.2 painel-TV) se quiser expandir a UX visual
de chegada antes de admin tooling.

---

## Mega-prompt template (Opção A)

```
CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN · CRUD admin de procedimentos

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO chamar provider.
NÃO criar wa_outbox.
NÃO usar status zumbi.

ESCOPO:
1. Rota /configuracoes/procedimentos (lista + create + edit + soft-delete)
2. ProcedureRepository extends · adicionar mutations (create/update/softDelete)
3. Server actions com Zod + role gate admin
4. UI: tabela responsiva + dialogs · sem provider
5. Mig opcional (RPCs apenas · tabela procedures já existe)
6. Smoke transacional + validation
7. Typecheck OK
8. Commit local · push mediante autorização padrão

PASS_CRM_LEGACY_PORT_PROCEDURES_ADMIN_READY quando:
- CRUD funcional
- typecheck OK
- zero wa_outbox mutation
- zero provider
```

---

## Ordem de execução sugerida (próximas fases)

| # | Fase | Risco | Pré-req | Status |
|---|---|---|---|---|
| 1 | **LEGACY.PORT.PROCEDURES_ADMIN** | baixo | nenhum | recomendada |
| 2 | **2ALEXA.2** (painel-TV) | baixo | nenhum | UX visual |
| 3 | **LEGACY.PORT.ANAMNESIS_BUILDER** | médio | nenhum | médio prazo |
| 4 | **LEGACY.PORT.PRONTUARIO** | médio | 2AUX.2 ✓ | médio prazo |
| 5 | **CONTROL.3** (residual cleanup) | baixo | CONTROL.2 ✓ | baixa prioridade |

**Bloqueadas até unban Meta:**
- 2ALEXA.3+ · Alexa real preflight/canary
- LEGACY.PORT.BIRTHDAYS · automations envio
- 2L.2.1 · template approval mirror
- 2T · conversas envio outbound real
