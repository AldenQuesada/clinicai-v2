# CRM · Next Prompt After CONTROL.1

> CONTROL.1 fechou como AUDIT ONLY. DB v2 está saudável (0 inconsistências
> bloqueantes). 18 funções zumbi + 9 Alexa RPCs documentadas como candidatas
> a cleanup surgical em CONTROL.2.

---

## Estado consolidado pós-CONTROL.1

- HEAD esperado pós-push: novo commit `chore(crm): audit and clean final db control`
- 4 arquivos novos: doc 94 + 95 + SQL validation + SQL smoke
- Zero código TS alterado · zero migration aplicada
- `can_continue=true` · worker71_off=true · 0 unsafe outbox
- Débitos catalogados:
  - 14 funções zumbi candidatas a inspect + patch/drop em CONTROL.2
  - 4 funções zumbi MANTER (em cron/trigger/V2 RPC ativos)
  - 9 Alexa RPCs candidatas a REVOKE + DROP gradual
  - 3 appointments sem `professional_id` (debt aceitável)

---

## Regras invioláveis (continuam)

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO chamar provider externo
- NÃO criar `wa_outbox` row
- NÃO usar status zumbi
- NÃO usar `phase='perdido'`
- NÃO `db push`
- NÃO DROP sem smoke per-objeto

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_CONTROL.2 · Cleanup surgical zumbi + Alexa (RECOMENDADA)

**Por quê:** fechar débitos catalogados em CONTROL.1. Surgical com smoke
1-by-1 garante zero regressão.

**Escopo proposto:**
1. Inspect 14 funções zumbi candidatas:
   - Reproduzir `prosrc` snippet
   - Identificar callers (`pg_depend`/grep code)
   - Decidir: PATCH (remover literal zumbi) ou DROP
2. Mig 178 com:
   - DROP IF EXISTS para funções 100% órfãs (sem caller v2 + sem cron + sem trigger)
   - PATCH (CREATE OR REPLACE) para funções vivas com literal backward-compat (remove `'em_consulta'/'pre_consulta'` etc.)
3. Mig 179 com:
   - REVOKE EXECUTE FROM authenticated nas 9 Alexa RPCs
   - DROP IF EXISTS para 7 que apontam para tabelas inexistentes
   - DEFER `get_alexa_config` / `upsert_alexa_config` (têm tabela viva)
4. Smoke transacional 1-by-1 + validation
5. Sem alterar dados · só schema/grants

### Opção B · CRM_PHASE_2ALEXA.1 · AlertBell polish (UX rápido)

**Por quê:** ganho visível imediato. `AlertBell` ganha cor pra `arrival`,
tempo decorrido, botão "Iniciar atendimento" inline, toggle som local.
Sem migration · sem provider.

### Opção C · CRM_PHASE_LEGACY.PORT.PROCEDURES_ADMIN · CRUD procedimentos

**Por quê:** procedimentos só lidos no v2. Admin precisa CRUD UI. ROI
operacional · sem migration nova.

### Opção D · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · Builder anamnese

**Por quê:** templates de anamnese fixos · builder permite customização
por procedimento/profissional.

### Opção E · CRM_PHASE_2L.2.1 · Meta template approval mirror (BLOQUEADO)

**Por quê:** depende de unban Meta. Mirror local de templates aprovados
na Meta · base para Lara dispatch quando canal liberar. **Não escolher
antes de unban confirmed.**

---

## Recomendação

**Opção A** (CONTROL.2) · fechar débitos enquanto contexto é fresco. Cada
função zumbi tem caller específico documentado em CONTROL.1 · próxima
sessão começa com mapa pronto. ROI: codebase 100% limpa antes de mais
ports.

Alternativa: **Opção B** (2ALEXA.1) se Alden prefere ganho UX visível
agora · CONTROL.2 pode rodar depois.

---

## Mega-prompt template (Opção A · CONTROL.2)

```
CRM_PHASE_CONTROL.2 · SURGICAL CLEANUP (zumbi + Alexa)

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO chamar provider externo.
NÃO criar wa_outbox.
NÃO DROP função se houver caller vivo.
NÃO mexer em dados.

ESCOPO:
1. Inspect 14 funções zumbi candidatas (lista no doc 94):
   - prosrc snippet
   - callers via pg_depend + grep code/legacy
   - decisão: PATCH (CREATE OR REPLACE removendo literal) ou DROP IF EXISTS
2. Inspect 9 Alexa RPCs:
   - confirmar zero caller v2 (grep code)
   - REVOKE EXECUTE FROM authenticated em todas
   - DROP IF EXISTS para 7 que apontam para tabelas inexistentes
3. Mig 178 (zumbi cleanup) + 179 (Alexa cleanup)
4. Smoke transacional 1-by-1 + validation antes/depois
5. Docs auditável + matriz antes/depois
6. Sem cron novo, sem provider, sem wa_outbox

PASS_CRM_CONTROL2_CLEANUP_APPLIED quando:
- zumbi_function_count_after_cleanup ≤ 5 (somente as MANTER)
- alexa_rpcs_after_cleanup ≤ 2 (somente as com tabela viva)
- can_continue=true
- worker71_off=true
- wa_outbox_delta=0
```

---

## Ordem de execução sugerida (próximas fases)

| # | Fase | Risco | Pré-req | Status |
|---|---|---|---|---|
| 1 | **CONTROL.2** (cleanup surgical) | médio | CONTROL.1 audit ✓ | recomendada |
| 2 | **2ALEXA.1** (AlertBell polish) | baixo | nenhum | rápida |
| 3 | **LEGACY.PORT.PROCEDURES_ADMIN** | baixo | nenhum | ROI alto |
| 4 | **LEGACY.PORT.ANAMNESIS_BUILDER** | médio | nenhum | menor prioridade |
| 5 | **LEGACY.PORT.PRONTUARIO** | médio | 2AUX.2 ✓ | médio prazo |

**Bloqueadas até unban Meta:**
- 2ALEXA.3+ · Alexa real preflight + canary
- LEGACY.PORT.BIRTHDAYS · automations envio
- 2L.2.1 · template approval mirror
- 2T · conversas envio outbound real
