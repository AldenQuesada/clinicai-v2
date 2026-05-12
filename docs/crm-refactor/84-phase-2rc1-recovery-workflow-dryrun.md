# CRM_PHASE_2RC.1 · Recovery Workflow Automation (DRY-RUN)

> Round 2RC.1 transforma a recuperação comercial em **workflow operacional
> interno** · estágios, prioridades, próxima ação, responsável, notas
> auditáveis e sugestão de abordagem (dry-run). Zero envio WhatsApp · zero
> automação real · zero `wa_outbox` · canal Meta segue bloqueado.

---

## 1. Resumo executivo

A 2RC entregou a queue unificada de recuperação (view + 3 ações sobre
perdidos). A 2RC.1 sobe a camada de workflow:

- Tabela persistente `commercial_recovery_workflow_items` (1 row por item
  ATIVO · idempotente por `(clinic_id, source_type, source_id)`)
- Tabela `commercial_recovery_events` · audit trail (1 row por evento)
- View `commercial_recovery_workflow_view` · queue_view LEFT JOIN
  workflow_items · overrides quando workflow row existe
- 8 RPCs SECURITY DEFINER · gate role owner/admin/receptionist
- 1 RPC IMMUTABLE pura SQL · gera texto sugerido (dry-run)
- UI `/crm/recuperacao` reescrita: 5 KPIs, 5 filtros, 8+ ações por linha
- Banner permanente: "DRY-RUN · canal Meta em aprovação"
- Smoke transacional · 13 cenários PASS · ROLLBACK · `wa_outbox_delta=0`

---

## 2. Estado inicial pós-2RC

- HEAD: `39c7c38` · origin/main: `39c7c38`
- Mig 172 + 173 aplicadas, trackers OK
- VIEW `commercial_recovery_queue_view` operacional · 8 items reais
- Worker 71 OFF · ban gate 2L intacto · `wa_outbox` queued/pending/unsafe = 0

## 3. Contrato do workflow

### Estágios canônicos (8)

| Estágio | Significado |
|---|---|
| `novo` | item entrou na fila, ninguém triou ainda (default ao criar) |
| `em_analise` | atendente lendo histórico/decidindo abordagem |
| `primeira_tentativa` | primeiro contato (ligação/visita) foi feito |
| `aguardando_resposta` | mensagem/contato enviado · aguarda retorno |
| `retorno_agendado` | paciente marcou retorno · CTA convertido |
| `recuperado` | terminal · paciente reativado/agendou |
| `descartado` | terminal · não-recuperável (faleceu, opt-out etc.) |
| `arquivado` | soft-archive · libera nova abertura via `create_or_get` |

### Prioridades (4)

`urgente > alta > media > baixa`. Default ao criar = `media` (ou origem-derivado).
Critérios sugeridos (futuros · não automáticos nesta fase):

- **alta** · no_show recente, orçamento alto, lead quente perdido, paciente existente
- **media** · cancelamento recente, lead perdido com motivo recuperável
- **baixa** · sem resposta antigo, fora de perfil
- **urgente** · apenas manual

### Próxima ação (7 tipos)

```
ligar
enviar_whatsapp_quando_liberado   ← intenção apenas · NÃO envia
agendar_retorno
revisar_orcamento
marcar_descartado
reativar_lead
observar
```

⚠️ `enviar_whatsapp_quando_liberado` é estritamente **intenção interna**.
A UI mostra warning amarelo quando esta opção é escolhida no dialog.
Nada é gravado em `wa_outbox` · nenhum cron varre essa tabela.

### Sugestão de abordagem (DRY-RUN)

RPC `commercial_recovery_workflow_suggest_message(source_type, display_name, reason)`
é `IMMUTABLE` · pura função SQL · gera texto estático interpolando nome.
Regras por source_type:

- `appointment_no_show` → "Oi, {nome}. Vi que você não conseguiu comparecer..."
- `appointment_cancelled` → "Oi, {nome}. Tudo bem? Posso te ajudar a encontrar outro horário..."
- `orcamento_frio` → "Oi, {nome}. Vi seu orçamento aqui. Posso te mostrar alternativas..."
- `lead_lost` com motivo "preço/valor" → variante por etapas
- `lead_lost` com motivo "sem resposta" → variante retomar conversa
- `lead_lost` default → retomada genérica
- fallback → "Oi, {nome}. Posso retomar nossa conversa?"

UI mostra dialog com texto + botão "Copiar". **Não há botão "Enviar agora"**.

## 4. Banco / migration

### Mig 174 (aplicada · tracker `20260800000174`)

`db/migrations/20260800000174_clinicai_v2_commercial_recovery_workflow_dryrun.sql`

#### Tabelas (2)

**`public.commercial_recovery_workflow_items`** · estado persistente
- 18 colunas (incluindo `suggested_message`, `assigned_to`, `next_action_*`, `last_note`)
- 4 CHECK constraints (source_type, stage, priority, status, next_action_type)
- 1 UNIQUE index parcial: `(clinic_id, source_type, source_id) WHERE archived_at IS NULL`
- 4 indexes auxiliares (clinic, assigned, next_action, stage)
- RLS · SELECT por clinic_id JWT + service_role ALL

**`public.commercial_recovery_events`** · audit trail
- FK CASCADE para workflow_items
- CHECK constraint em `event_type` (11 valores válidos)
- RLS · mesmo padrão

#### View

**`public.commercial_recovery_workflow_view`** · LEFT JOIN entre `queue_view`
e `workflow_items` ATIVO. Quando workflow row existe, seus valores
sobrescrevem os defaults computados da queue. Inclui flag derivada
`next_action_overdue` (`next_action_at < now()`).

#### RPCs (8)

| RPC | Propósito | Idempotente? |
|---|---|---|
| `commercial_recovery_workflow_create_or_get` | cria item OU retorna existente | ✅ sim |
| `commercial_recovery_workflow_update_stage` | muda stage + grava evento | ✅ no-op se igual |
| `commercial_recovery_workflow_update_priority` | muda priority | ✅ no-op se igual |
| `commercial_recovery_workflow_set_next_action` | seta type+at+assigned_to | ❌ sobrescreve |
| `commercial_recovery_workflow_add_note` | append `last_note` + evento | ❌ |
| `commercial_recovery_workflow_mark_recovered` | terminal → status=recuperado | ✅ |
| `commercial_recovery_workflow_discard` | terminal → status=descartado | ✅ |
| `commercial_recovery_workflow_suggest_message` | gera texto · IMMUTABLE · zero side-effect | n/a |

Todas mutations: gate role via helper `_recovery_workflow_role_ok()` ·
fixed `search_path` · grant `EXECUTE` para `authenticated`.

## 5. Repository · `CommercialRecoveryRepository`

Métodos novos (acima dos 4 da 2RC):

```ts
listWorkflowQueue(filter): { items: RecoveryWorkflowItemDTO[] }
getWorkflowCounts(currentUserId?): RecoveryWorkflowCounts
createOrGetWorkflow(input): RecoveryWorkflowActionResult
updateWorkflowStage(id, stage, note?)
updateWorkflowPriority(id, priority)
setWorkflowNextAction({ id, actionType, at, assignedTo? })
addWorkflowNote(id, note)
markWorkflowRecovered(id, note?)
discardWorkflow(id, reason)
suggestWorkflowMessage(sourceType, displayName, reason?)
```

Tipos exportados: `RecoveryStage`, `RecoveryPriority` (agora 4),
`RecoveryStatus` (agora 4 com `arquivado`), `RecoveryNextActionType`,
`RecoveryWorkflowItemDTO`, `RecoveryWorkflowCounts`, `ListRecoveryWorkflowFilter`,
`RecoveryWorkflowActionResult`.

## 6. Server Actions

`apps/lara/src/app/crm/recuperacao/_actions.ts` · 8 actions novas:

- `createOrGetRecoveryWorkflowAction`
- `updateRecoveryStageAction`
- `updateRecoveryPriorityAction`
- `setRecoveryNextActionAction`
- `addRecoveryWorkflowNoteAction`
- `markRecoveryRecoveredAction`
- `discardRecoveryWorkflowAction`
- `suggestRecoveryMessageAction` (dry-run · Zod garante input)

Todas: Zod validation + `requireRole(owner/admin/receptionist)` + log
estruturado + `updateTag(CRM_TAGS.leads)` pós-mutation. A action de
sugestão NÃO chama `updateTag` (read-only · sem efeito persistente).

## 7. UI

`apps/lara/src/app/crm/recuperacao/page.tsx` · 5 KPIs:
- Total · Urgente+Alta · Atrasados · Recuperados · Atribuídos a mim

`_recovery-list.tsx` · 5 filtros (origem, estágio, prioridade, status, toggle "atrasados"),
banner permanente dry-run, e por linha:

- Pills: source, stage, priority, status
- Badge "⏰ ATRASADO" quando `next_action_overdue=true`
- Links navegação: Reagendar (appt), Abrir orçamento, Ver lead
- Botões:
  - "Iniciar" (cria workflow_item se `workflowId=null`)
  - "Estágio", "Prio.", "Próx. ação" → abre dialog dedicado
  - "Anotar", "Sugerir" → dialogs
  - "Reativar" (apenas `lead_lost` · usa `lead_recover` da 2RC)
  - "✓ Recuperado", "Descartar" → dialogs com motivo obrigatório

Dialog Sugestão de abordagem inclui warning amarelo:
> ⚠️ DRY-RUN · não enviaremos WhatsApp enquanto o canal Meta não estiver aprovado.
> Use para falar pessoalmente ou copiar para outro canal manualmente.

Botão "Copiar texto" usa `navigator.clipboard.writeText`. **Não há botão "Enviar agora"**.

## 8. Smoke transacional (13 cenários PASS · ROLLBACK)

`docs/crm-refactor/sql/phase-2rc1-recovery-workflow-dryrun-smoke.sql`

| Test | Cobertura | Resultado |
|---|---|---|
| A | `create_or_get` cria | ✅ `existed=false`, defaults corretos |
| B | `create_or_get` idempotente | ✅ `existed=true`, mesmo `id` |
| C | `update_stage` muda + audit | ✅ `stage=primeira_tentativa` |
| D | `update_priority` | ✅ `priority=urgente` |
| E | `set_next_action` (ligar +2 dias) | ✅ |
| F | `add_note` happy path | ✅ |
| G | `add_note` rejeita curta (<3 chars) | ✅ `error=note_too_short` |
| H | `suggest_message` × 4 source_types | ✅ todos interpolam nome |
| I | `mark_recovered` | ✅ `status=recuperado` |
| J | `mark_recovered` idempotente | ✅ `idempotent_skip=true` |
| K | `discard` outro item | ✅ `status=descartado` |
| L | Role gate · `professional` bloqueado | ✅ `error=forbidden_role` |
| M | Events audit trail ≥ 5 | ✅ count=6 |
| safety | `wa_outbox_delta=0` | ✅ baseline=123 |
| safety | `worker71_off_still=true` | ✅ |

## 9. Validation SQL

`docs/crm-refactor/sql/phase-2rc1-recovery-workflow-dryrun-validation.sql`

Final flags pós-aplicação:

```json
{
  "can_continue": true,
  "worker71_off": true,
  "tracker_mig_174": "20260800000174",
  "workflow_table_ready": true,
  "events_table_ready": true,
  "workflow_view_ready": true,
  "workflow_rpcs_count": 8,
  "duplicate_active_count": 0,
  "orphan_count": 0,
  "invalid_stage_count": 0,
  "invalid_priority_count": 0,
  "unsafe_outbox_count": 0,
  "cron_recovery_jobs": 0
}
```

## 10. O que NÃO faz (regras invioláveis honradas)

- ❌ Não envia WhatsApp · não chama Evolution/Meta/Cloud
- ❌ Não cria linha em `wa_outbox`
- ❌ Não ativa job 71 · não cria cron job novo
- ❌ Não usa `phase='perdido'` (canon: `phase` ∈ {lead, agendado, paciente, orcamento})
- ❌ Não chama provider externo
- ❌ Não usa status zumbi
- ❌ `enviar_whatsapp_quando_liberado` é apenas intenção textual · zero dispatch

## 11. Riscos identificados

- **Tracker mig 174 manual**: Management API não popula tracker · INSERT manual
  autorizado pelo MEGA PROMPT 2RC.1. Padrão repete-se para próximas migs.
- **`assigned_to` sem UI de seleção**: ainda não há picker de usuário ·
  campo persistido via RPC, mas UI atual permite apenas inferir do JWT do caller.
  Pendente em 2RC.2.
- **`suggest_message` simplificado**: regra estática SQL · não há
  personalização por procedimento/histórico. Versão futura com IA externa
  precisaria de feature flag + gate de custo.
- **Sem cron de varredura de overdues**: items com `next_action_overdue=true`
  aparecem no banner, mas não há notificação proativa · próxima fase pode
  adicionar webhook ou worker dedicado quando WhatsApp liberar.

## 12. Próxima fase

Ver `docs/crm-refactor/85-next-prompt-after-2rc1.md`.

Recomendado: **CRM_PHASE_2RC.2 · Recovery kanban/pipeline polish** ·
adicionar seletor de responsável, drag-and-drop entre stages, ou
**CRM_PHASE_2L.2.1 · Template approval mirror** quando Meta estiver pronto.
