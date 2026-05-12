# CRM · Next Prompt After 2ALEXA.2.1

> 2ALEXA.2.1 entregou painel-TV consumindo foto consentida do prontuário ·
> hero premium + animação · zero migration. Pipeline fechado entre prontuário
> e painel.

---

## Estado consolidado pós-2ALEXA.2.1

- HEAD esperado pós-push: commit local `feat(crm): show consented patient photos on reception panel`
- Sem mig nova (zero)
- `getReceptionDisplayProfile()` agora é consumido pelo `/recepcao/painel`
- Signed URL TTL 5 min · path bruto nunca sai do server
- 3 animações premium browser-only entregues
- Smoke 13/13 PASS · validation flags green · `can_continue=true`
- Worker 71 OFF · `wa_outbox_delta=0`

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

**Por quê:** PROCEDURES_ADMIN entregou catálogo · WIZARD ainda usa text-free.
Upgrade natural · Select com auto-fill de duração/preço. Reduz inconsistência
em dashboard.

**Escopo:**
- Patch `/crm/agendar` (ou rota canônica do wizard) para usar `<ProcedureSelect>`
  pluggando `ProcedureAdminRepository.list({ active:true })`
- Auto-preencher `duracao_min` e `preco_centavos` no form
- Manter fallback text-free para procedimentos não cadastrados
- Sem migration · sem RPC nova
- Smoke read-only validation

### Opção B · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · Builder de anamnese

**Por quê:** templates de anamnese ainda fixos · builder permite custom.
Demanda admin · pode ser feito sem provider.

### Opção C · CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_DETAIL · Prontuário detalhado

**Por quê:** prontuário base entregue · próximo nível é timeline clínica
+ anamneses + documentos por paciente. Maior escopo.

### Opção D · CRM_PHASE_CONTROL.3 · Residual cleanup

**Por quê:** 15 zumbi functions remanescentes + storage RLS para
`patient-profiles/*` + outros pequenos débitos. Baixa prioridade.

### Opção E · CRM_PHASE_2L.2.1 · Meta template approval mirror

**Por quê:** quando Meta/Facebook estiver pronto · espelha templates aprovados
no admin local. **Bloqueada até unban Meta**.

---

## Recomendação

**Opção A** (`WIZARD_PROCEDURES`) · fecha o loop entre admin de procedimentos
e o fluxo de agendamento:

```
PROCEDURES_ADMIN → ProcedureAdminRepository.list({active:true})
                                                ↓
                                      Wizard Select + auto-fill
                                                ↓
                                      Appointments com FK consistente
```

Sem migration · upgrade natural · ROI imediato (menos erro de digitação no
caixa/financeiro).

---

## Mega-prompt template (Opção A)

```
CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · Select FK de procedimentos no wizard

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO chamar provider.
NÃO criar wa_outbox.
NÃO criar migration · esperado: zero.

ESCOPO:
1. Inserir <ProcedureSelect> no wizard de agendamento (rota canônica)
   - Server fetch via ProcedureAdminRepository.list({active:true})
   - Auto-fill duracao_min + preco_centavos no form
   - Fallback text-free quando "Outro" selecionado
2. Manter compat com appointments existentes (procedure_name string)
3. Smoke read-only validation
4. Typecheck OK · commit local

PASS_CRM_WIZARD_PROCEDURES_SELECT_FK_READY quando:
- Wizard mostra Select com procedimentos ativos
- Auto-fill funciona
- Fallback text-free funciona
- typecheck OK
- 0 wa_outbox mutation
```

---

## Ordem de execução sugerida

| # | Fase | Risco | Pré-req | Status |
|---|---|---|---|---|
| 1 | **LEGACY.PORT.WIZARD_PROCEDURES** | baixo | PROCEDURES_ADMIN ✓ | recomendada |
| 2 | **LEGACY.PORT.ANAMNESIS_BUILDER** | médio | nenhum | médio prazo |
| 3 | **LEGACY.PORT.PACIENTE_PRONTUARIO_DETAIL** | alto | 2AUX.2 ✓ | longo prazo |
| 4 | **CONTROL.3** (residual cleanup) | baixo | CONTROL.2 ✓ | baixa prioridade |

**Bloqueadas até unban Meta:**
- 2ALEXA.3+ · Alexa real preflight/canary
- LEGACY.PORT.BIRTHDAYS · automations envio
- 2L.2.1 · template approval mirror
- 2T · conversas envio outbound real
