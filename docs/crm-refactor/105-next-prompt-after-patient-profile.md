# CRM · Next Prompt After PATIENT_PRONTUARIO_BASE

> PATIENT_PRONTUARIO_BASE entregou foto + consent + welcome no prontuário
> do paciente. Mig 180 aplicada · UI integrada em `/crm/pacientes/[id]`.
> Painel-TV (commit `d3db2ee`) NÃO foi alterado.

---

## Estado consolidado pós-PATIENT_PRONTUARIO_BASE

- HEAD esperado pós-push: novo commit
  `feat(crm): add patient reception photo consent profile`
- Mig 180 aplicada · tracker pendente (auto-classifier bloqueou helper)
- Tabela `patient_profiles_extended` com 4 CHECK constraints + 3 RLS policies
- Storage `media` reusado com prefixo `patient-profiles/`
- `PatientProfileRepository` + 6 server actions + UI card integrada
- Smoke 10/10 PASS · validation flags green · typecheck OK
- Worker 71 OFF · `can_continue=true`

---

## Regras invioláveis (continuam)

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO chamar provider externo
- NÃO criar `wa_outbox` row
- NÃO usar `phase='perdido'`
- NÃO `db push`
- NÃO buscar foto externa

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2ALEXA.2.1 · Painel-TV consome foto consentida (RECOMENDADA)

**Por quê:** fecha o loop entre prontuário e painel. Atualiza
`/recepcao/painel` para chamar `getReceptionDisplayProfile()` por paciente
em `arrived` e mostrar foto + nome preferido + animação **apenas quando
consentido**. Fallback continua avatar com iniciais.

**Escopo:**
- Patches em `/recepcao/painel/page.tsx`:
  - Para cada `arrived` row com `patientId`, chama `getReceptionDisplayProfile()`
  - Para profiles ready, gera signed URL server-side (5 min TTL)
  - Passa `photoSignedUrl` + `animationStyle` + `preferredName` no PanelRow
- Patches em `_client.tsx`:
  - `ArrivalRow` renderiza imagem se `photoSignedUrl` existe
  - Animation style aplica CSS variant (subtle CSS transitions)
- Sem migration · sem nova RPC
- Smoke read-only validation
- Typecheck OK

### Opção B · CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · Select FK no wizard

**Por quê:** PROCEDURES_ADMIN entregou admin · wizard ainda usa text-free.
Upgrade natural para Select com auto-fill duração/preço.

### Opção C · CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER · Builder anamnese

**Por quê:** templates de anamnese ainda fixos · builder permite custom.

### Opção D · CRM_PHASE_LEGACY.PORT.PRONTUARIO_CLINICAL · Prontuário clínico detalhado

**Por quê:** prontuário base entregue · próximo nível é timeline clínica
+ anamneses + documentos por paciente.

### Opção E · CRM_PHASE_CONTROL.3 · Residual cleanup

**Por quê:** 15 zumbi functions remanescentes + storage RLS para
`patient-profiles/*` + tracker mig 180/178/179.

---

## Recomendação

**Opção A** (2ALEXA.2.1 · painel-TV consome foto) · fecha o pipeline:

```
Prontuário admin → patient_profiles_extended → getReceptionDisplayProfile
                                                       ↓
                                            Painel-TV mostra foto
```

Sem migration · sem provider · UX immediate visível. ROI maior porque
investiu-se na infra de foto/consent · agora aparece em ação.

---

## Mega-prompt template (Opção A)

```
CRM_PHASE_2ALEXA.2.1 · PAINEL-TV CONSOME FOTO CONSENTIDA

REGRA ABSOLUTA:
NÃO ativar job 71.
NÃO enviar WhatsApp/Evolution/Meta.
NÃO chamar provider.
NÃO criar wa_outbox.
NÃO criar migration.
NÃO expor path direto · sempre signed URL com TTL.

ESCOPO:
1. Patch /recepcao/painel/page.tsx:
   - Para cada arrived com patientId, chama
     repos.patientProfile.getReceptionDisplayProfile(patientId)
   - Para profiles ready, createSignedUrl com TTL 5 min via service_role
   - Adiciona ao PanelRow: photoSignedUrl, animationStyle, preferredName
2. Patch _client.tsx ArrivalRow:
   - Se photoSignedUrl existe, renderiza imagem 88x88 circular
   - Senão, fallback avatar com iniciais (atual)
   - Animation style aplica CSS subtle
3. Privacidade preservada:
   - Sem joins clínicos (manter)
   - Telefone continua mascarado
   - Signed URL 5 min · não persiste no client
4. Smoke read-only + validation
5. Typecheck OK · commit local

PASS_CRM_2ALEXA21_PANEL_CONSUMES_PHOTO_READY quando:
- Painel mostra foto se consent ativo
- Fallback iniciais funcionando
- typecheck OK
- 0 wa_outbox mutation
```

---

## Ordem de execução sugerida

| # | Fase | Risco | Pré-req | Status |
|---|---|---|---|---|
| 1 | **2ALEXA.2.1** (painel consome foto) | baixo | mig 180 ✓ | recomendada |
| 2 | **LEGACY.PORT.WIZARD_PROCEDURES** | baixo | PROCEDURES_ADMIN ✓ | upgrade natural |
| 3 | **LEGACY.PORT.ANAMNESIS_BUILDER** | médio | nenhum | médio prazo |
| 4 | **LEGACY.PORT.PRONTUARIO_CLINICAL** | alto | 2AUX.2 ✓ | longo prazo |
| 5 | **CONTROL.3** (residual cleanup) | baixo | CONTROL.2 ✓ | baixa prioridade |

**Bloqueadas até unban Meta:**
- 2ALEXA.3+ · Alexa real preflight/canary
- LEGACY.PORT.BIRTHDAYS · automations envio
- 2L.2.1 · template approval mirror
- 2T · conversas envio outbound real
