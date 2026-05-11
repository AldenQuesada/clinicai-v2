# 06 · Alerts · Notifications · Messages catalog

> Catálogo dos eventos operacionais que podem gerar alerta UI, notificação interna, mensagem WhatsApp, tarefa humana, badge, mudança de mesa ou SLA.
>
> Estado atual + proposta para o catálogo canônico `crm_event_catalog` (alvo).

---

## 1 · Tabelas de eventos / notificações encontradas

| Tabela | Status | Função | Notas |
|---|---|---|---|
| `phase_history` | ✅ existe | Audit de transições de phase | Append-only · usado como timeline |
| `inbox_notification` | ⚠️ referência encontrada (webhook Evolution) | Notificações para inbox | Implementação não confirmada |
| `agenda_alerts_log` | ⚠️ referência legado (clinic-dashboard) | Alertas de agenda | Status incerto |
| `mira_state` | ⚠️ presente | Estado da Mira | Não é alertas mas relacionado |
| `crm_event_catalog` | ❌ NÃO existe | Catálogo de eventos | Construir |
| `crm_events_log` | ❌ NÃO existe | Log de eventos derivados | Construir |

---

## 2 · Fontes de mensagens (canais)

| Canal | Trigger atual | Tabelas |
|---|---|---|
| WhatsApp Cloud (Lara) | Inbound · outbound automation · respostas humanas | `wa_messages`, `wa_outbox` |
| WhatsApp Evolution (Mih) | Inbound secretária · outbound | `wa_messages` (com `transport='evolution'`) |
| WhatsApp Mira-mirian | Outbound B2B (vouchers, etc) | `wa_messages` |
| Push notifications | `useNotificationSettings` (web push) | Cliente only · sem persistência DB |

---

## 3 · Crons que disparam eventos operacionais

| Cron | Frequência | Evento disparado | Mutação |
|---|---|---|---|
| `orcamento-followup` | 1x/dia 13h UTC | `lead.budget_stale_*` (implicit · sem catálogo) | UPDATE orcamentos.last_followup_at + INSERT wa_outbox |
| `lid-pending-monitor` | 1x/dia | LID growing alerts | Read-only |
| `divergence-check` | 1x/dia 06h30 SP | Divergência legacy↔public | JSON report |
| `wa-chat-sync` | ? | Sync inbox buckets | UPDATE wa_conversations |
| `reactivate` | ? | Auto-revive archived→active conv | UPDATE wa_conversations.status |
| `copilot-commercial-smoke` | ? | Health check copilot | Read-only |
| `evolution-gap-monitor` | ? | Mih session gap detection | Read-only (alerta externo) |
| `cross-instance-media-hydrate` | ? | Media hydrate | UPDATE wa_messages.media_url |

✅ Crons não mudam `leads.phase` diretamente · arquitetura limpa.

---

## 4 · Eventos derivados existentes (implícitos · sem catálogo)

Eventos que o sistema HOJE produz mas sem registro central:

### Leads
- Novo lead criado (via webhook)
- Lead recebeu mensagem inbound
- Lead foi atribuído a alguém (`assigned_to` UPDATE)
- Lead mudou phase (registrado em `phase_history`)
- Lead foi marcado perdido (`lost_reason`)

### Appointments
- Appointment criado
- Status mudou (sem audit central · só `phase_history` quando lead.phase deriva)
- Cancelamento marcado
- No-show marcado
- Attend (chegada)
- Finalização

### Orcamentos
- Criado
- Sent
- Viewed (via share_token endpoint)
- Approved / Lost
- Stale (cron pick)
- Payment adicionado

### Conversas
- Conv criada (lead novo)
- Conv reativada (archived→active)
- Owner mudou (operational_owner)
- Tag adicionada / removida
- Smart Reply cached

---

## 5 · Catálogo proposto para `crm_event_catalog`

Tabela alvo (1 row por tipo de evento):

```sql
CREATE TABLE crm_event_catalog (
  key text PRIMARY KEY,                    -- "lead.created", "appointment.no_show", etc
  label text NOT NULL,
  category text NOT NULL,                  -- "lead" | "appointment" | "orcamento" | "patient" | "message" | "copilot"
  trigger_desc text,                       -- condição de nascimento
  expires_when text,                       -- quando o evento "morre"
  dismissible_roles text[],                -- quais roles podem dispensar
  -- canais
  ui_alert boolean DEFAULT false,
  inbox_notification boolean DEFAULT false,
  whatsapp_template_key text,              -- FK opcional para template WhatsApp
  badge_target text,                       -- "lead" | "agenda" | "secretaria" | "dra"
  -- comportamento operacional
  changes_mesa boolean DEFAULT false,
  sla_state text,                          -- "warning" | "overdue"
  audit_required boolean DEFAULT true,
  is_critical boolean DEFAULT false,
  is_automatic boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
```

E tabela complementar `crm_events_log`:

```sql
CREATE TABLE crm_events_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  event_key text NOT NULL REFERENCES crm_event_catalog(key),
  lead_id uuid REFERENCES leads(id),
  appointment_id uuid REFERENCES appointments(id),
  orcamento_id uuid REFERENCES orcamentos(id),
  payload jsonb,
  fired_at timestamptz DEFAULT now(),
  dismissed_at timestamptz,
  dismissed_by uuid
);
```

---

## 6 · Catálogo inicial proposto (35 eventos)

### Categoria `lead`

| key | label | trigger | dies | dispenser | canais |
|---|---|---|---|---|---|
| `lead.created` | Novo lead | INSERT em leads | nunca (audit) | — | inbox_notification + ui_alert |
| `lead.first_contact` | Primeiro contato | Inbound msg em conv nova | atendido | secretaria,sdr | ui_alert |
| `lead.no_response_24h` | Sem resposta 24h | Lead sem msg outbound em 24h | resposta enviada | sdr | ui_alert + sla_state=warning |
| `lead.no_response_72h` | Sem resposta 72h | Lead sem msg outbound em 72h | resposta enviada | sdr | ui_alert + sla_state=overdue |
| `lead.lost` | Lead perdido | RPC `lead_lost` chamada | recovery | sdr | audit |
| `lead.recovery_started` | Recuperação iniciada | RPC `lead_recovery_activate` | back to ativo | sdr | audit |
| `lead.recovery_recovered` | Recuperado | lifecycle=`recuperacao→ativo` | nunca | sdr | audit |
| `lead.archived` | Arquivado | RPC `lead_archive` | unarchive | owner,admin | audit |
| `lead.unarchived` | Desarquivado | RPC `lead_unarchive` | — | owner,admin | audit |

### Categoria `appointment`

| key | label | trigger | dies | canais |
|---|---|---|---|---|
| `appointment.scheduled` | Agendamento criado | `lead_to_appointment` | dia da consulta | confirmation_pending |
| `appointment.confirmation_pending` | Aguardando confirmação | 1d antes (cron) | confirmado/cancelado | whatsapp_template + ui_alert |
| `appointment.confirmed` | Consulta confirmada | status=confirmado | dia da consulta | audit |
| `appointment.day_of` | Consulta hoje | cron 00h SP | atendimento finalizado | ui_alert + badge |
| `appointment.checked_in` | Paciente chegou | `appointment_attend` | em_atendimento | ui_alert |
| `appointment.in_progress` | Em atendimento | status=em_atendimento | finalizado | badge |
| `appointment.finalized` | Atendimento finalizado | `appointment_finalize` | nunca | audit + badge |
| `appointment.no_show` | No-show | status=no_show | humano decide perda | ui_alert + sla_state=overdue |
| `appointment.cancelled` | Cancelado | status=cancelado | humano decide perda | audit |
| `appointment.rescheduled` | Remarcado | status=remarcado | new appt confirmed | audit |

### Categoria `orcamento`

| key | label | trigger | canais |
|---|---|---|---|
| `lead.budget_open` | Orçamento criado | INSERT orcamentos | audit |
| `lead.budget_stale_7d` | Orçamento parado 7d | cron pick | whatsapp_template followup |
| `lead.budget_stale_15d` | Orçamento parado 15d | cron pick | ui_alert + sla_state=warning |
| `lead.budget_expired` | Orçamento vencido | `valid_until < now()` | ui_alert + sla_state=overdue |
| `lead.budget_accepted` | Orçamento aprovado | `markOrcamentoApprovedAction` | audit + badge |
| `lead.budget_rejected` | Orçamento recusado | `markOrcamentoLostAction` | audit |

### Categoria `patient`

| key | label | trigger | canais |
|---|---|---|---|
| `patient.followup_due` | Retorno previsto | última consulta + X meses | ui_alert |
| `patient.budget_added` | Paciente ganhou orçamento adicional | INSERT orcamento com patient_id | audit + mesa muda para paciente_orcamento |
| `patient.no_return_180d` | Sem retorno 180d | cron | sla_state=warning |

### Categoria `message`

| key | label | trigger | canais |
|---|---|---|---|
| `message.inbound_unread` | Inbound não lida | INSERT wa_messages com from='lead' | ui_alert + badge inbox |
| `message.assigned` | Conv atribuída | `operational_owner` set | audit |
| `message.unassigned` | Conv sem responsável | `operational_owner=NULL` | sla_state=warning |
| `message.outbound_failed` | Outbound falhou | `wa_outbox.status='failed'` | ui_alert |

### Categoria `copilot`

| key | label | trigger | canais |
|---|---|---|---|
| `copilot.recommended_action` | Copilot recomendou ação | IA flag em conversa | ui_alert |
| `copilot.smart_reply_available` | Sugestão disponível | cache atualizado | ui_alert (sutil) |

---

## 7 · Templates WhatsApp existentes vs eventos

Templates encontrados (legado · clinic-dashboard `b2b_comm_templates`, `lara_templates`, etc):

| Template | Evento esperado | Existe? |
|---|---|---|
| Confirmação 1d antes | `appointment.confirmation_pending` | ✅ Mira |
| Lembrete 30min antes | `appointment.day_of` | ✅ Mira |
| Pós-consulta thank you | `appointment.finalized` | ⚠️ parcial |
| Orçamento followup recent | `lead.budget_stale_7d` | ✅ cron `orcamento-followup` |
| Orçamento followup expiring | `lead.budget_stale_15d` | ✅ cron |
| Paciente retorno | `patient.followup_due` | ⚠️ existe em automations Mira |
| Lead no response 72h | `lead.no_response_72h` | ❌ não confirmada |

---

## 8 · Gap análise · alertas

| Categoria | Eventos existentes (implícitos) | Eventos catalogados | Gap |
|---|---|---|---|
| Lead | 5 | 0 | 9 propostos |
| Appointment | 7 | 0 | 10 propostos |
| Orcamento | 4 | 0 | 6 propostos |
| Patient | 1 | 0 | 3 propostos |
| Message | 3 | 0 | 4 propostos |
| Copilot | 1 | 0 | 2 propostos |

**Total: 21 eventos hoje sem catálogo, 34 alvo.**

---

## 9 · Recomendações

1. **Construir `crm_event_catalog` na Fase 4** do refactor. Backfill seed com 34 eventos.
2. **Construir `crm_events_log` simultaneamente.** Cada RPC + cron + webhook escreve nele.
3. **Endpoint `/api/crm/events`** para alimentar painel de controle (Controle/Configurações).
4. **UI Painel de Configurações** para enable/disable/edit canais por evento.
5. **`whatsapp_template_key`** vincula evento a template existente · permite editar mensagem sem refactor de código.
6. **Migração incremental:** começar pelos 5 eventos mais críticos (`lead.created`, `appointment.no_show`, `lead.budget_stale_7d`, `lead.lost`, `message.inbound_unread`). Os outros entram conforme demanda.

---

## 10 · Achados críticos

1. 🟡 **Sem catálogo central de eventos.** Lógica espalhada em crons, webhooks, repos. Mudar comportamento exige tocar código.
2. 🟡 **Templates desacoplados de eventos.** Edição de template em `b2b_comm_templates` não tem rastro de qual evento dispara.
3. 🟡 **`agenda_alerts_log` órfão.** Não claro se ainda recebe writes.
4. 🟢 **`phase_history` é o melhor exemplo.** Pode servir de modelo para `crm_events_log`.
5. 🔴 **Sem SLA explícito.** `sla_state` precisa ser definido por evento (cores no card, prioridades de fila).
