# CRM · Next Prompt After 2RC.1

> Round 2RC.1 entregou o workflow interno de recuperação comercial em
> dry-run (mig 174 · 8 RPCs · workflow_view · UI completa com 8 ações).
> Zero envio WhatsApp · worker 71 segue OFF · canal Meta bloqueado.

---

## Estado consolidado pós-2RC.1

- Mig 174 aplicada · tracker `20260800000174`
- 2 tabelas (`commercial_recovery_workflow_items` + `commercial_recovery_events`)
- 1 view (`commercial_recovery_workflow_view`)
- 8 RPCs SECURITY DEFINER + 1 IMMUTABLE helper de sugestão
- Repository · 10 métodos novos
- Server actions · 8 actions novas
- UI `/crm/recuperacao` totalmente reescrita · 5 KPIs + 5 filtros + 8 dialogs
- Smoke transacional · 13 cenários PASS · `wa_outbox_delta=0`
- Typecheck · `@clinicai/lara` + `@clinicai/repositories` ambos OK
- Worker 71 OFF · ban gate 2L intacto

---

## Regras invioláveis (continuam)

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta
- NÃO processar `wa_outbox`
- NÃO criar automação de envio
- NÃO usar `phase='perdido'`
- NÃO `db push`

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2ALEXA.AUDIT · Alexa/Boas-vindas audit (RECOMENDADA)

**Por quê:** auditar o módulo Alexa (boas-vindas / onboarding lead) é leitura
e mapeamento · zero risco · zero migration. Útil para validar se o fluxo
inicial está canônico antes de pensar em recuperação automatizada.

**Escopo:**
- Mapear handlers de boas-vindas no Lara (`apps/lara/services/prompt/...`)
- Identificar pontos onde Alexa gera resposta inicial
- Documentar contratos · sem patch · sem alteração
- Doc auditável: matriz de cobertura, gaps, prioridade de fix

### Opção B · CRM_PHASE_2AUX.2 · Professional FK + Lead support no wizard

**Por quê:** wizard de agendamento ainda referencia profissional via
nome string em alguns paths. Migrar para FK `professional_id` reforça
integridade + permite filtros de agenda por profissional. Tem que ser
feito antes de qualquer integração de relatórios por especialista.

### Opção C · CRM_PHASE_2RC.2 · Recovery kanban/pipeline polish

**Por quê:** 2RC.1 deixou alguns gaps de UX:

1. Picker de responsável (`assigned_to`) · hoje apenas via RPC manual
2. Drag-and-drop entre stages (kanban visual) · hoje via dropdown
3. Timeline de eventos por item (consume `commercial_recovery_events`)
4. Bulk actions · selecionar múltiplas linhas + alterar stage/priority

**Escopo:**
- Sem migration nova
- Componente kanban `/crm/recuperacao/kanban`
- API `getWorkflowEvents(recoveryId)` no repository
- Picker de usuários dentro da clínica
- Bulk update RPCs (loop server-side)

### Opção D · CRM_PHASE_2L.2.1 · Template approval mirror (DEPENDE Meta unban)

**Por quê:** só ativar quando canal Meta estiver pronto. Cria mirror local
das templates aprovadas na Meta · base para Lara dispatch via Cloud API
(2RC.1 já deixa o slot `enviar_whatsapp_quando_liberado` esperando).

**Escopo:**
- Tabela `wa_cloud_meta_templates` (sync 1x quando Alden liberar)
- Mapeamento `recovery_workflow.suggested_message` → template_id
- Smoke real-send canary (1 número whitelisted apenas)
- Ban gate 2L precisa estar removido

### Opção E · CRM_PHASE_2S · Soft-delete admin canon

**Por quê:** pendente desde 2I.1. Precisa de override auditável para
admin restaurar itens descartados/arquivados. Pode incluir histórico
de quem descartou.

---

## Recomendação

**Opção A** (CRM_PHASE_2ALEXA.AUDIT) · ciclo de auditoria zero-risk
antes da próxima feature pesada. Workflow recovery está estável e
operacional · próxima janela boa pra mapear o módulo Alexa antes de
voltar pra UX polish.

Alternativa próxima: **Opção C** (2RC.2 polish) se Alden quiser
operacionalizar a recuperação imediatamente com kanban visual.

---

## Mega-prompt template (Opção A)

```
CRM_PHASE_2ALEXA.AUDIT · ALEXA/WELCOME FLOW AUDIT (READ-ONLY)

REGRA ABSOLUTA:
NÃO alterar código.
NÃO ativar job 71.
NÃO enviar WhatsApp.
NÃO modificar templates ou prompts.
NÃO criar migration.

ESCOPO:
1. Mapear todos arquivos do módulo Alexa/boas-vindas:
   apps/lara/src/services/prompt/**
   apps/lara/src/app/api/webhook/whatsapp*/
2. Identificar onde Alexa decide responder, qual prompt, qual handler
3. Listar gates atuais (canary, ban, real-send-block)
4. Documentar: matriz de cobertura · gaps · risco · prioridade
5. Doc final: docs/audits/2ALEXA-AUDIT-<DATA>.md
6. Commit local apenas · NÃO push sem autorização

PASS_CRM_PHASE_2ALEXA_AUDIT_OK quando:
- todos handlers mapeados
- nenhuma alteração de código/dados
- doc commitado local
```
