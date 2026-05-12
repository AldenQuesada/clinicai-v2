# CRM · Next Prompt After 2AUX.2

> Round 2AUX.2 entregou profissional como FK first-class + suporte a lead
> direto no wizard. Zero migration. Zero envio. Smoke 10/10 PASS.
> Validation flags todos verdes. `can_continue=true`.

---

## Estado consolidado pós-2AUX.2

- HEAD esperado pós-push: novo commit
  `fix(crm): strengthen appointment professional and lead support`
- Wizard usa `professional_id` (FK) + toggle Paciente/Lead
- Repository tem `listActiveForAgenda(clinicId)` + `getById(id)`
- `makeRepos` wira `professionalProfiles`
- Smoke transacional 10/10 PASS · ROLLBACK forçado
- 3 appointments pré-existentes sem `professional_id` (débito legado · não-bloqueante)
- Worker 71 OFF · zero `wa_outbox` mutation
- Typecheck `@clinicai/lara` + `@clinicai/repositories` ambos OK

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

### Opção A · CRM_PHASE_LEGACY.PORT.DASHBOARDS · SDR/funil por profissional (RECOMENDADA)

**Por quê:** com FK profissional first-class consolidado, dashboards SDR/funil
agora podem segmentar por profissional. Legacy `sdr.js` + `financeiro-reports.js`
têm funil de conversão, source comparison e no-show por motivo. SQL canônico
existe (`crm_operational_view` + indexes). Falta a UI React/Suspense.

**Escopo:**
- Rota `/dashboard` evoluída com filtro de profissional
- Cards de funil: leads → agendados → comparecidos → finalizados
- No-show por motivo (mig já capturou `motivo_no_show`)
- Cancelamento por motivo (`motivo_cancelamento`)
- Source comparison (`origem`)
- Sem provider externo · sem migration nova
- Recriar do zero (não portar `sdr.js` literal · usar views v2)

### Opção B · CRM_PHASE_2ALEXA.1 · Internal welcome panel polish

**Por quê:** ganho UX imediato visível. `AlertBell` já entrega o nível
dashboard, falta polish:
- Destacar `arrival` com cor (verde escuro?)
- Tempo desde chegada inline (`5 min atrás`)
- Botão rápido "Iniciar atendimento" inline
- Toggle de som local Web Audio API (localStorage)
- ARIA live announcements

**Escopo:**
- `AlertBell.tsx` patches
- `useAppointmentInternalAlerts.ts` extends
- Sem migration · sem RPC nova

### Opção C · CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN · CRUD procedimentos

**Por quê:** procedimentos só são read no v2 hoje. Admin precisa CRUD UI
pra cadastrar/editar/desativar. ROI alto pra operação diária da clínica.

**Escopo:**
- Rota `/configuracoes/procedimentos`
- CRUD: list + create + edit + soft-delete
- Sem migration (tabela `procedures` já existe)
- Sem provider externo

### Opção D · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · Builder de anamnese

**Por quê:** anamnese clínica já entrega gate de finalização (2I.1), mas
templates de anamnese ainda são fixos. Builder permite criar templates
customizáveis por procedimento/profissional.

**Escopo:**
- Rota `/configuracoes/anamnese-templates`
- Builder de seções + campos (text, radio, checkbox, scale)
- Preview live
- Sem migration (legacy `anamnese-builder.js` aponta padrões)

### Opção E · CRM_PHASE_CONTROL.1 · Auditoria final DB

**Por quê:** drop seguro de débitos acumulados:
- 18 funções pg_proc com status zumbi (`em_consulta`/`pre_consulta`/`compareceu`/`reagendado`)
- 9 RPCs Alexa dormentes
- 3 appointments sem `professional_id`
- Audit RLS final
- Audit cron jobs final

**Pré-req cumprido:** 2AUX.2 + foundation core completa.
**Pré-req opcional:** 1 port crítico (A, C ou D) antes para validar padrão de port.

---

## Recomendação

**Opção A** (LEGACY.PORT.DASHBOARDS) · agora viável com FK profissional. ROI
operacional alto (clínica enxerga funil de conversão). Sem provider externo.
Sem migration. Valida padrão de port antes de CONTROL.1.

Alternativa: **Opção B** (2ALEXA.1) se Alden quer ganho UX visível em produção
mais rápido.

---

## Mega-prompt template (Opção A)

```
CRM_PHASE_LEGACY.PORT.DASHBOARDS · SDR FUNIL + FINANCEIRO REPORTS

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO chamar provider externo.
NÃO criar wa_outbox.
NÃO usar status zumbi.

ESCOPO:
1. Evoluir /dashboard com filtro de profissional (FK · 2AUX.2)
2. Cards de funil de conversão (leads → agendado → compareceu → finalizado)
3. No-show por motivo + Cancelamento por motivo
4. Source comparison (origem)
5. Sem migration (views v2 já cobrem)
6. Server Component + Suspense pra queries intensivas
7. Smoke manual (sem migration) + validation SQL
8. Docs + commit local (push mediante autorização padrão)

PASS_CRM_PHASE_LEGACY_PORT_DASHBOARDS quando:
- /dashboard mostra funil por profissional
- typecheck OK
- zero wa_outbox mutation
- commit local pronto
```

---

## Ordem de execução sugerida (próximas 3 fases)

| # | Fase | Risco | Pré-req | Bloqueia? |
|---|---|---|---|---|
| 1 | **LEGACY.PORT.DASHBOARDS** | baixo | 2AUX.2 ✓ | — |
| 2 | **2ALEXA.1** OU **LEGACY.PORT.PROCEDURES_ADMIN** | baixo | nenhum | — |
| 3 | **CONTROL.1** (audit final + cleanup) | médio | 2AUX.2 + 1 port | rollout pleno |

**Bloqueadas até unban Meta:**
- CRM_PHASE_2ALEXA.3+ (Alexa real)
- CRM_PHASE_LEGACY.PORT.BIRTHDAYS
- CRM_PHASE_2L.2.1 (template approval mirror)
- CRM_PHASE_2T (conversas envio outbound real)
