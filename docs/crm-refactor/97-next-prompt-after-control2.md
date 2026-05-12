# CRM · Next Prompt After CONTROL.2

> CONTROL.2 entregou cleanup cirúrgico: 3 orphan trigger fns DROPPED · 7 broken
> Alexa RPCs DROPPED · 2 live Alexa config RPCs REVOKED (authenticated). Core
> contracts preservados · zero envio · zero data mutation.

---

## Estado consolidado pós-CONTROL.2

- HEAD esperado pós-push: novo commit `chore(crm): clean dormant legacy database objects`
- 6 arquivos novos:
  - Mig 178 (zumbi) `.sql` + `.down.sql`
  - Mig 179 (Alexa) `.sql` + `.down.sql`
  - Doc 96 (cleanup detalhado) + Doc 97 (next)
  - SQL validation + smoke
- Mig 178 + 179 aplicadas via Management API
- Trackers 178/179: 🟡 não registrados (auto-classifier bloqueou helper INSERT)
- Validation final flags todos verdes · `can_continue=true`
- Smoke 13 cenários PASS · zero data mutation

**Resumo numérico:**

| Métrica | Pré-CONTROL.2 | Pós-CONTROL.2 | Δ |
|---|---|---|---|
| Zumbi functions | 18 | 15 | -3 (orphan triggers) |
| Alexa RPCs total | 9 | 2 | -7 (broken) |
| Alexa EXECUTE authenticated | N | 0 | REVOKE 2 sobreviventes |
| Appts sem `professional_id` | 3 | 3 | unchanged (debt) |
| `phase='perdido'` | 0 | 0 | OK |
| `worker_71` | OFF | OFF | preserved |

---

## Regras invioláveis (continuam)

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO chamar provider externo
- NÃO chamar Alexa API
- NÃO criar `wa_outbox` row
- NÃO usar `phase='perdido'`
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2ALEXA.1 · AlertBell polish / chegada UX (RECOMENDADA)

**Por quê:** ganho UX visível imediato · zero migration · zero risco. Polish
do `AlertBell` para destacar `arrival` com cor + tempo decorrido + botão
"Iniciar atendimento" inline + toggle de som local.

**Escopo:**
- `AlertBell.tsx` patches (cor, tempo, botão inline)
- `useAppointmentInternalAlerts.ts` extends (real-time timer)
- Toggle de som local via Web Audio API + localStorage
- Smoke manual UI + validation já existente
- Sem migration · sem provider externo

### Opção B · CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN · CRUD admin procedimentos

**Por quê:** procedimentos só são read no v2. Admin precisa CRUD UI para
cadastrar/editar/desativar. ROI alto para operação diária da clínica.

**Escopo:**
- Rota `/configuracoes/procedimentos`
- CRUD: list + create + edit + soft-delete
- Mig opcional (RPCs · tabela já existe)
- Sem provider externo

### Opção C · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · Builder anamnese

**Por quê:** templates de anamnese fixos no v2 (clinical gate 2I.1 já entrega).
Builder permite customizar templates por procedimento/profissional.

**Escopo:**
- Rota `/configuracoes/anamnese-templates`
- Builder de seções + campos (text, radio, checkbox, scale)
- Preview live
- Sem migration

### Opção D · CRM_PHASE_CONTROL.3 · Residual cleanup (refactor cosmético)

**Por quê:** cleanup adicional:
- Patch dos 15 zumbi remanescentes para remover literais em comments
- Audit residual de `clinic_alexa_config` (rows que sobrevivem)
- Decisão sobre `clinic_rooms.alexa_device_name` column
- Registro de trackers 178/179 (autorização explícita)
- Audit de FK constraints + RLS final

**Status:** baixa prioridade · 15 zumbi remanescentes são FALSAS positivações
(literais em comments de docstrings).

### Opção E · CRM_PHASE_2L.2.1 · Meta template approval mirror (BLOQUEADO)

**Por quê:** depende de unban Meta · fora do controle.

---

## Recomendação

**Opção A** (2ALEXA.1 polish AlertBell) · ganho UX visível em produção rápido.
Sem migration · sem provider · sem risco. Reaproveita `appointment_internal_alerts`
existente (mig 161 · 2G).

Alternativa: **Opção B** (procedures admin CRUD) se ROI operacional é prioridade.

---

## Mega-prompt template (Opção A · 2ALEXA.1)

```
CRM_PHASE_2ALEXA.1 · ALERTBELL POLISH / ARRIVAL UX

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO chamar provider.
NÃO criar wa_outbox.
NÃO chamar Alexa API.

ESCOPO:
1. Patch AlertBell.tsx · destacar arrival com cor (emerald) + ícone diferenciado
2. Mostrar tempo decorrido inline ("3 min atrás") via update interval
3. Botão "Iniciar atendimento" inline no row de arrival
4. Toggle de som local (Web Audio API beep) com localStorage para preferência
5. ARIA live announcement opcional
6. Sem migration · sem RPC nova
7. Smoke manual UI (sem transacional) + valida hook reads
8. Typecheck + commit local

PASS_CRM_PHASE_2ALEXA1_POLISH_READY quando:
- typecheck OK
- nenhuma chamada provider/wa_outbox
- toggle som funciona localStorage
- commit local pronto
```

---

## Ordem de execução sugerida (próximas fases)

| # | Fase | Risco | Pré-req | Status |
|---|---|---|---|---|
| 1 | **2ALEXA.1** (polish AlertBell) | baixo | nenhum | recomendada |
| 2 | **LEGACY.PORT.PROCEDURES_ADMIN** | baixo | nenhum | ROI alto |
| 3 | **LEGACY.PORT.ANAMNESIS_BUILDER** | médio | nenhum | médio prazo |
| 4 | **LEGACY.PORT.PRONTUARIO** | médio | 2AUX.2 ✓ | médio prazo |
| 5 | **CONTROL.3** (residual cleanup) | baixo | CONTROL.2 ✓ | baixa prioridade |

**Bloqueadas até unban Meta:**
- 2ALEXA.3+ · Alexa real preflight/canary
- LEGACY.PORT.BIRTHDAYS · automations envio
- 2L.2.1 · template approval mirror
- 2T · conversas envio outbound real
