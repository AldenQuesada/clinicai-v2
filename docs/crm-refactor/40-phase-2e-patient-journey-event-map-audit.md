# CRM_PHASE_2E · Patient Journey Event Map Audit

> **Date:** 2026-05-12
> **Mode:** READ-ONLY audit · zero mutação · zero deploy · zero envio WhatsApp
> **Repo HEAD:** `7d6c33a877346b7edaf1165f08accb6f592dc2d4` · `origin/main`
> **Companion SQL:** [phase-2e-patient-journey-audit.sql](sql/phase-2e-patient-journey-audit.sql)
> **Next-rotation prompt:** [41-phase-2e-next-operator-prompt.md](41-phase-2e-next-operator-prompt.md)

---

## 1 · Executive summary

A camada **banco está saudável e bem governada**. Schemas, enums, RPCs e triggers do CRM (mig 65, 72, 150, 151) e da agenda (mig 153-158) cobrem o que foi prometido:

- 14/14 RPCs CRM presentes · `SECURITY DEFINER` · grants em `authenticated`+`service_role`.
- Zero status legado em `appointments` · zero `perdido` como `leads.phase` · zero `phase` inválida · zero `lifecycle_status` inválido.
- `crm_operational_view` existe com 19 colunas (mig 150) incluindo `mesa_operacional` que projeta `paciente_orcamento`, `perdido`, `arquivado`.
- `appointment_attend` corrigido · NÃO escreve mais `leads.phase='compareceu'` (auditoria de def confirma).
- `wa_outbox` saudável · `0 empty_content / 0 empty_phone / 0 missing_lead_id / 0 pending old` após mig 156+158.

A camada **frontend e o ecossistema de automation triggers** têm gaps mensuráveis:

- **8 dos 14 `trigger_type` em `wa_agenda_automations` estão configurados mas órfãos** — não existe tick fn que os processe. Inclui `d_before`, `d_zero`, `d_after`, `on_finalize`, `on_inbound_match`, `on_recurrence_created`. **Resultado: Confirmação D-1, "Chegou o Dia", Pós D+1/D+2/D+3, NPS D+7, NÃO ESTÃO RODANDO** mesmo com regras ativas no banco.
- **Frontend infere status manualmente** (`canAttend`, `canFinalize` hardcoded em strings) em `apps/lara/src/app/crm/agenda/[id]/page.tsx:90-93`. Anti-pattern arquitetural.
- **`em_consulta` e `em_atendimento` são stubs**: enum existe, calendar pinta cor, mas nenhum RPC transiciona pra eles.
- **`crm_operational_view` NÃO é consumida pelo frontend** (zero grep hit em apps/lara/src/).
- **Anamnese: tabelas zumbis sem UI/FK/gate.** Nenhuma persistência funcional.
- **Consentimento informado: campo `consentimento_img` existe mas sem upload/canvas/assinatura/storage/gate.**
- **Alexa: zombie table `clinic_alexa_log` · zero wiring.**
- **Sem alerta de "paciente não confirmou" pra secretaria.**
- **Sem recuperação comercial automática pós-no_show/cancelamento.**
- **`lead_recovery_activate` existe mas sem trigger/cron que o invoque.**

**Veredito:** `PASS_CRM_PHASE_2E_PATIENT_JOURNEY_AUDIT_READY` — auditoria completa, banco em estado seguro, gaps documentados com prioridade, próximas fases ranqueadas.

---

## 2 · Estado inicial confirmado

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `7d6c33a877346b7edaf1165f08accb6f592dc2d4` |
| HEAD == origin/main | ✅ |
| Working tree (antes desta auditoria) | apenas `docs/incidents/` untracked do incident anterior |
| Cron job 12 (`daily-agenda-summary`) | ✅ active=true |
| Cron job 71 (`wa_outbox_worker_tick`) | ✅ active=false |
| Cron job 72 (`agenda_alert_min_before_tick`) | ✅ active=true (dry-mode) |
| Últimos runs job 72 | 5/5 succeeded · "1 row" (fire count integer · sem appt elegível) |
| Inserts wa_outbox últ 5min | 0 |
| Inserts agenda_alerts_log últ 5min | 0 |
| `wa_outbox` totais | 123 (66 sent · 49 cancelled · 8 failed · 0 pending) |
| `appointments` total | 5 (3 not-deleted · 100% `finalizado`) |
| `leads` total | 122 ativos (120 lead · 1 paciente · 1 orcamento · 0 perdido-as-phase) |
| `patients` total | 2 |
| `orcamentos` total | 3 |
| `phase_history` total | 10 (origins: rpc / lifecycle / auto_transition / manual_override) |

---

## 3 · Guardrails respeitados

Todos os guardrails listados no prompt foram cumpridos:

- ❌ Zero `supabase db push` · zero `migration repair` · zero apply
- ❌ Zero deploy · zero git push · zero alteração de secrets/env
- ❌ Zero alteração em cron · job 71 segue OFF · job 72 segue ON dry-mode
- ❌ Zero `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`DROP`/`CREATE`/`TRUNCATE` em produção
- ❌ Zero chamada a Meta/Evolution provider
- ❌ Zero envio WhatsApp real
- ❌ Zero ativação manual de tick fn / worker

Tudo que foi feito: leituras read-only via Management API SQL endpoint + grep/leitura de código + criação local de docs e SQL read-only.

---

## 4 · Arquitetura oficial CRM/Agenda/Lifecycle (reconfirmada)

### Phases canônicas (`leads.phase`)
`lead | agendado | paciente | orcamento`

### Lifecycle (`leads.lifecycle_status`)
`ativo | perdido | recuperacao | arquivado`

### Appointment statuses (`appointments.status`)
`agendado | aguardando_confirmacao | confirmado | aguardando | na_clinica | em_atendimento | finalizado | remarcado | cancelado | no_show | bloqueado`

### Regras chave
- `perdido` é **lifecycle_status**, nunca `phase`. `lost_from_phase` preserva phase original.
- Leads não são soft-deleted operacionalmente (audit: 2 rows com `deleted_at`, dentro do tolerável).
- `appointment_finalize` aceita outcomes `paciente | orcamento | paciente_orcamento | perdido`. Quando outcome=`perdido`, delega pra `lead_lost(reason)` antes de update (mig 151:244-257). **Não cria phase=perdido.** ✅
- Caminho oficial de perda: `lead_lost(reason)` (não via `_sdr_record_phase_change`, não via trigger).
- `appointment_attend` escreve `appointments.status='na_clinica'` + `chegada_em=now()` · NÃO escreve mais `leads.phase` legado ('compareceu' eliminado). Auditoria de def confirma.

### Fluxos oficiais
1. Lead → Agendado → Paciente
2. Lead → Agendado → Orcamento
3. Paciente → cria orçamento adicional → `mesa_operacional='paciente_orcamento'` na view
4. Ativo → Perdido → Recuperacao → Ativo (atualmente o caminho de retorno está só em RPC `lead_recovery_activate`, sem trigger automático)

---

## 5 · Mapa da jornada completa do paciente

```mermaid
flowchart TD
  A[Captação · Lead criado] --> B[Lead conversa no WhatsApp]
  B --> C[Agendamento · lead_to_appointment]
  C --> D{D-1 confirmação<br/>regra ATIVA<br/>tick ❌ FALTA}
  D --> E{D-zero chegou o dia<br/>regra ATIVA<br/>tick ❌ FALTA}
  E --> F[min_before 10min<br/>job 72 ✅ ON dry]
  F --> G[Paciente chega · appointment_attend]
  G --> H{Modal "paciente na clínica"<br/>UI ❌ FALTA}
  H --> I[Anamnese<br/>tabelas zombi ❌ sem UI/FK/gate]
  I --> J[Consentimento informado<br/>campo existe ❌ sem upload/sign]
  J --> K[Em atendimento<br/>status STUB · nunca escrito]
  K --> L[Finalização · appointment_finalize]
  L --> M{outcome}
  M -->|paciente| N[lead_to_paciente]
  M -->|orcamento| O[lead_to_orcamento]
  M -->|paciente_orcamento| P[both]
  M -->|perdido| Q[lead_lost reason]
  N --> R[Pós-consulta]
  O --> R
  P --> R
  R --> S{D+1 / D+2 / D+3<br/>regras ATIVAS<br/>tick ❌ FALTA}
  S --> T{NPS D+7<br/>regra ATIVA<br/>tick ❌ FALTA}
  T --> U[Recuperação comercial<br/>RPC existe ❌ sem trigger]
  Q --> U

  classDef gap fill:#ffcdd2,stroke:#c62828
  classDef ok fill:#c8e6c9,stroke:#2e7d32
  classDef partial fill:#fff9c4,stroke:#f9a825
  class D,E,H,I,J,K,S,T,U gap
  class A,B,C,F,G,L,M,N,O,P,Q ok
  class R partial
```

---

## 6 · Matriz dos 9 trilhos paralelos

| Trilho | Estado | Onde | Observação |
|---|---|---|---|
| 1. Appointment lifecycle | ✅ Funcional | mig 62/65/72/151 + repos | State machine completo, terminal states, RPC enforcement |
| 2. CRM lifecycle | ✅ Funcional | mig 65/150 + RPCs 14/14 | phases + lifecycle ortogonais; phase_history rastreado |
| 3. WhatsApp paciente (outbound automation) | 🟡 Parcial | wa_agenda_automations + 2 tick fn | min_before + daily_summary OK · d_before/d_zero/d_after **órfãos** |
| 4. Alertas Secretaria | 🟡 Parcial | trg_wa_auto_confirm + agenda alerts | Auto-confirm via inbound · sem "não confirmou" alert |
| 5. Alertas Mirian/profissional | 🟡 Parcial | `Alerta 10 Min` + Resumo Diário | Funcional pra min_before · sem "paciente chegou" alert |
| 6. Alexa / ambiente físico | ❌ Stub | clinic_alexa_log zombie | Coluna `alexa_target`/`alexa_message` nas rules · zero wiring |
| 7. Documentos clínicos (anamnese + consent) | 🟠 Stub-DB | tabelas existem, UI 0% | Sem FK appointment, sem signature, sem gate finalize |
| 8. Financeiro/comercial (orcamento) | ✅ Funcional | orcamentos + orcamento_followup_pick | Follow-up D+1 wired |
| 9. Pós-consulta/follow-up | 🟠 Configurado-órfão | 5 regras d_after ativas | Configuração existe · zero tick fn que dispare |

---

## 7 · Por etapa da jornada

### 7.1 · Captação / Lead

- **Deveria existir:** captura de lead via webhook, formulário, importação, manual.
- **Banco:** `leads` tabela canônica (mig 62, refactor) · `phase='lead'`, `lifecycle_status='ativo'` default.
- **Código:** `LeadRepository.createViaRpc()` (packages/repositories/src/lead.repository.ts:561) chama RPC `lead_create` (mig 65:95-205).
- **Estado:** ✅ funcional · 120 leads ativos · zero phase inválida.
- **Riscos:** nenhum identificado.
- **Próximo patch:** N/A.

### 7.2 · Agendamento

- **Deveria existir:** modal de novo agendamento criando appointment + transicionando lead → `agendado`.
- **Banco:** RPC `lead_to_appointment` (mig 65:214-320) · cria appointment + atualiza `leads.phase='agendado'` + insere `phase_history`.
- **Código:** `LeadRepository.toAppointment()` (lead.repository.ts:583) · UI em `apps/lara/src/app/crm/agenda/novo/_form.tsx`.
- **Estado:** ✅ funcional.
- **Riscos:** UI pode chamar INSERT direto em algumas rotas (Agent C indicou path direto vs RPC).
- **Próximo patch:** auditar paths de criação na UI · garantir 100% via RPC.

### 7.3 · Confirmação (D-1, D-zero)

- **Deveria existir:** mensagem automática 24h antes ("Confirma sua consulta?") e no dia ("Te esperamos hoje às 14h").
- **Banco:** regras `Confirmacao D-1` e `Chegou o Dia` ativas em `wa_agenda_automations` (`trigger_type='d_before'` e `d_zero`).
- **Código:** **NENHUM tick fn processa d_before nem d_zero.** Auditoria via `pg_proc` confirma ausência.
- **Estado:** 🔴 **CRÍTICO** · Configuração existe mas **nada dispara**.
- **Riscos:** clínica acredita que confirmação automática roda · não roda. Operacionalmente: pacientes esquecem · no_shows aumentam.
- **Próximo patch:** **P0** · criar `_agenda_alert_d_before_tick()` e `_agenda_alert_d_zero_tick()` (ou um `_agenda_alert_day_tick()` único) · cron correspondente.

### 7.4 · Pré-consulta / Tarefa Secretaria

- **Deveria existir:** tarefa pra secretária confirmar presença (telefonema/WhatsApp manual).
- **Banco:** regra `Tarefa Confirmar Presenca` ativa (`trigger_type='d_before'`, channel='task').
- **Estado:** 🔴 órfã (mesmo gap do 7.3).
- **Próximo patch:** **P0** · mesmo tick fn de 7.3 deve emitir tarefa pra channel=`task`.

### 7.5 · Alertas Secretaria

- **Deveria existir:** alerta quando paciente não confirma · alerta de chegada · alerta de paciente atrasado.
- **Banco:** parcial · `trg_wa_auto_confirm` em `wa_messages` (auto-confirma appointment via inbound matchando palavras-chave).
- **Estado:** 🟡 parcial · auto-confirm OK · alertas operacionais ausentes.
- **Próximo patch:** **P1** · criar regras `not_confirmed_alert` (d_minus minutos antes sem reply) · `arrived_alert` (chegada_em set).

### 7.6 · Alertas Mirian/profissional

- **Deveria existir:** "próximo paciente em 10min" · "paciente chegou" · "paciente esperando há X min".
- **Banco:** ✅ `Alerta 10 Min` (`min_before`) funcional · ✅ `Resumo Diario` (`daily_summary`) funcional.
- **Faltam:** alerta `na_clinica` no momento da chegada · alerta `tempo de espera>X`.
- **Estado:** 🟡 parcial.
- **Próximo patch:** **P1** · trigger row-level em `appointments` quando `chegada_em` é setado.

### 7.7 · Chegada / Paciente na clínica

- **Deveria existir:** botão "paciente chegou" no card de agenda · setar `chegada_em` + `status='na_clinica'`.
- **Banco:** RPC `appointment_attend(uuid, timestamptz)` (mig 65:328-422) ✅ funcional · não escreve mais `leads.phase` legado.
- **Código:** `apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx:127` ✅ wired.
- **Estado:** ✅ funcional.
- **Riscos:** modal de "paciente na clínica" não existe como UI rica · só o botão direto.
- **Próximo patch:** **P2** · construir modal completo (registra hora real de chegada, observação, alerta Mirian, etc).

### 7.8 · Em atendimento

- **Deveria existir:** status `em_atendimento` setado quando Mirian começa a atender · sair pra `finalizado`.
- **Banco:** enum existe (mig 62:131) · **NENHUMA RPC seta `em_atendimento` ou `em_consulta`**.
- **Código:** `apps/lara/src/app/crm/agenda/_components/month-view.tsx:44-46` mostra cor `'confirmado'` para `em_consulta`/`em_atendimento` · stub visual.
- **Estado:** 🟠 stub · enum legacy never written.
- **Próximo patch:** **P2** · decidir: usar ou remover. Se usar, criar RPC `appointment_start_session()` e UI.

### 7.9 · Anamnese

- **Deveria existir:** formulário clínico vinculado a appointment, versionado, requerido antes de finalize.
- **Banco:** `anamnesis_requests` + `anamnesis_responses` tabelas existem (mig 66) · **FK para `patients` apenas · sem FK para `appointment`** · sem versioning.
- **Código:** **ZERO UI**.
- **Estado:** 🟠 stub-DB.
- **Próximo patch:** **P2/P3** · fase dedicada (CRM_PHASE_2I).

### 7.10 · Consentimento informado

- **Deveria existir:** assinatura + storage + gate em finalize.
- **Banco:** campo `appointments.consentimento_img text DEFAULT 'pendente'` (mig 62:98) · tabela `wa_consent` (mig 66) sem versioning · `legal_doc_signatures` zombie.
- **Código:** **ZERO upload/canvas/sign UI**.
- **Estado:** 🟠 stub-DB.
- **Próximo patch:** **P2/P3** · fase dedicada (CRM_PHASE_2I).

### 7.11 · Finalização

- **Deveria existir:** modal com outcome (paciente/orcamento/paciente_orcamento/perdido) + payload.
- **Banco:** RPC `appointment_finalize` (mig 151) ✅ aceita 4 outcomes · delega corretamente.
- **Código:** `FinalizeWizard` em `apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx:234` ✅ wired.
- **Estado:** ✅ funcional.
- **Riscos:** sem gate `consentimento_assinado=true` antes de finalize. Sem gate `anamnese_completa=true`.
- **Próximo patch:** **P2** · gates condicionais quando módulos 7.9 e 7.10 entrarem.

### 7.12 · No-show / Cancelamento / Remarcação

- **Deveria existir:** modais com motivo · RPC dedicada.
- **Banco:** RPC `appointment_change_status` (mig 72) ✅ · setas `no_show_em` / `cancelado_em` / `motivo_*`.
- **Código:** `NoShowModal`, `CancelModal`, `RescheduleModal` wired em actions-bar.
- **Estado:** ✅ funcional.
- **Próximo patch:** N/A.

### 7.13 · Recuperação comercial

- **Deveria existir:** trigger automático após no_show/cancelado/orcamento expirado.
- **Banco:** RPC `lead_recovery_activate` existe (mig 65) · seta `is_in_recovery=true` · **SEM trigger automático**.
- **Estado:** 🟠 RPC existe, automation ausente.
- **Próximo patch:** **P1** · cron diário + regra em `wa_agenda_automations` (`trigger_type='on_status'`?) que ativa recuperação.

### 7.14 · Pós-consulta

- **Deveria existir:** mensagem "obrigado pela consulta" + D+1 cuidados + D+3 retorno + D+7 NPS.
- **Banco:** regras `Apos Consulta D+1`, `Pos-procedimento D+2`, `Pos-procedimento D+3`, `NPS D+7`, `Pedir Avaliacao` (algumas inactive) em `wa_agenda_automations` (`trigger_type='d_after'`).
- **Código:** **NENHUM tick fn processa d_after.** **5 regras ativas, 0 disparadas.**
- **Estado:** 🔴 **CRÍTICO** · valor de pós-consulta inteiro perdido.
- **Próximo patch:** **P0** · criar `_agenda_alert_d_after_tick()` · cron diário 10h BRT.

### 7.15 · Follow-up B2B / vouchers (paralelo)

- **Estado:** ✅ funcional (cron jobs 26-33 ativos · RPCs dedicadas).
- **Não afeta jornada do paciente direto** mas usa mesma infra `wa_outbox`.

### 7.16 · Alexa / ambiente físico

- **Banco:** `clinic_alexa_log` zombie (mig 99) · campos `alexa_target` / `alexa_message` em `wa_agenda_automations`.
- **Estado:** ❌ zero wiring.
- **Próximo patch:** P3 (futuro).

---

## 8 · Tabela de gaps por prioridade

| ID | Prioridade | Gap | Impacto | Fase sugerida |
|---|---|---|---|---|
| G1 | **P0** | Tick fn para `trigger_type='d_before'` ausente | Confirmação D-1 não roda mesmo com regra ativa | 2F |
| G2 | **P0** | Tick fn para `trigger_type='d_zero'` ausente | "Chegou o dia" não roda | 2F |
| G3 | **P0** | Tick fn para `trigger_type='d_after'` ausente | Pós-consulta D+1/D+2/D+3 + NPS D+7 não rodam | 2K |
| G4 | **P0** | Tick fn para `trigger_type='on_finalize'` ausente | 1 regra ativa não dispara | 2J |
| G5 | **P1** | Frontend infere status (`canAttend`, `canFinalize` hardcoded) | Mudança backend pode quebrar UI silenciosamente | 2H |
| G6 | **P1** | Sem alerta de "paciente não confirmou" | Secretária descobre tarde | 2G |
| G7 | **P1** | Sem alerta "paciente chegou" pra Mirian/profissional | Mirian não sabe quando ir | 2G |
| G8 | **P1** | Recuperação comercial sem trigger | Leads perdidos não são reativados | 2K |
| G9 | **P1** | `crm_operational_view` não consumida pelo frontend | Estado oficial vs UI divergem | 2H |
| G10 | **P2** | Modal "paciente na clínica" rico ausente | UX limitada | 2H |
| G11 | **P2** | `em_atendimento`/`em_consulta` stubs sem RPC | Ciclo incompleto | 2H |
| G12 | **P2** | Anamnese sem UI/FK/gate | Documentação clínica falha | 2I |
| G13 | **P2** | Consentimento sem assinatura/storage/gate | Risco LGPD/operacional | 2I |
| G14 | **P3** | Alexa integration zero wiring | Futuro | 2P |
| G15 | **P3** | `on_inbound_match` / `on_recurrence_created` órfãs | Configuração nunca disparada | 2K |

---

## 9 · Tabela de legados encontrados

| Termo | Local | Risco | Recomendação | Migrável agora? |
|---|---|---|---|---|
| `'pre_consulta'` | `apps/lara/src/app/crm/agenda/_components/_drag-utils.ts:29` | Baixo · usado em DRAGGABLE_STATUSES set · enum válido | Manter (status válido em mig 62) | N/A |
| `'em_consulta'` | enum schema + cor `month-view.tsx:44-46` | Médio · status existe mas nenhum RPC seta · stub | Decidir: ativar (criar RPC) ou remover | Sim · sem dado dependente |
| `'em_atendimento'` | enum schema + cor `month-view.tsx:44-46` | Médio · idem | Decidir: ativar ou remover | Sim · sem dado dependente |
| `'compareceu'` | `_lead_phase_transition_allowed` (mig 65:50-76) ainda lista como possível transição | Baixo · matrix legado · não usado por nenhum RPC ativo | Auditar matrix · remover transições obsoletas em mig futura | Não · requer mig revisora |
| `'reagendado'` (como phase) | mesma matrix | Mesmo | Idem | Idem |
| `clinic_alexa_log` | tabela zombie mig 99 | Baixo · vazia | Manter como reserva ou drop em mig dedicada | Drop possível |
| `b2b_consent_log` / `lp_consents` | tabelas existentes mas não-CRM | Baixo · escopo diferente | Manter · não confundir com consentimento clínico | N/A |
| `legal_doc_signatures` | tabela existente sem uso clínico | Baixo · escopo legal docs | Manter · não confundir | N/A |

---

## 10 · Tabela de automações WhatsApp (14 regras em `wa_agenda_automations`)

| Regra | trigger_type | Ativa | Canal | Recipient | Tick fn existe? | Pode criar outbox? | Riscos |
|---|---|---|---|---|---|---|---|
| Apos Consulta D+1 | `d_after` | ✅ | whatsapp | patient | ❌ | ⚠️ órfã | Não dispara |
| Pos-procedimento D+1 | `d_after` | ❌ | whatsapp | patient | ❌ | – | – |
| Pos-procedimento D+2 | `d_after` | ✅ | whatsapp | patient | ❌ | ⚠️ órfã | Não dispara |
| Pos-procedimento D+3 | `d_after` | ✅ | whatsapp | patient | ❌ | ⚠️ órfã | Não dispara |
| Tarefa Acompanhamento Pos | `d_after` | ✅ | task | professional | ❌ | n/a (task) | Não cria tarefa |
| Pedir Avaliacao | `d_after` | ❌ | whatsapp | patient | ❌ | – | – |
| NPS D+7 | `d_after` | ✅ | whatsapp | patient | ❌ | ⚠️ órfã | Não dispara |
| Tarefa Confirmar Presenca | `d_before` | ✅ | task | professional | ❌ | n/a (task) | Não cria tarefa |
| Confirmacao D-1 | `d_before` | ✅ | whatsapp | patient | ❌ | ⚠️ órfã | Não dispara |
| Chegou o Dia | `d_zero` | ✅ | whatsapp | patient | ❌ | ⚠️ órfã | Não dispara |
| Resumo Diario | `daily_summary` | ✅ | whatsapp | professional | ✅ `wa_daily_summary` (job 12) | Sim · seguro pós mig 155/158 | Pode pular silently se lead null |
| Alerta 10 Min | `min_before` | ✅ | alert | professional | ✅ `_agenda_alert_min_before_tick` (job 72) | Sim · seguro pós mig 156/158 | Worker 71 OFF, fila acumula sem envio |
| VPI Fotona trocada | `on_demand` | ✅ | whatsapp | patient | n/a (manual) | Manual via API | N/A |
| VPI Convite Parceiro | `on_demand` | (truncado audit) | whatsapp | patient | n/a | Manual | N/A |

**Resumo:** 8 regras ativas estão **configuradas mas órfãs**. O sistema acredita estar entregando confirmação + pós-consulta · não está.

---

## 11 · Tabela de modais/UI (apps/lara)

| Modal | Arquivo:linha | Grava via RPC? | Frontend infere? | Gap |
|---|---|---|---|---|
| Novo agendamento | `crm/agenda/novo/_form.tsx` | ⚠️ Misto (RPC OU INSERT direto) | Não | Auditar paths sem RPC |
| Marcar chegada | `crm/agenda/[id]/_actions-bar.tsx:127` | ✅ `appointment_attend` | Não | – |
| Cancelar | `_actions-bar.tsx:204` (CancelModal) | ✅ `appointment_change_status` | Não | – |
| Não compareceu | `_actions-bar.tsx:219` (NoShowModal) | ✅ `appointment_change_status` | Não | – |
| Finalizar consulta | `_actions-bar.tsx:234` (FinalizeWizard) | ✅ `appointment_finalize` | Não | Sem gate anamnese/consent |
| Status dropdown | `_actions-bar.tsx:148` | ✅ `appointment_change_status` | Não | – |
| Soft-delete appt | `_actions-bar.tsx:245` | ❌ Raw UPDATE | n/a | Refatorar pra RPC |
| Page header agenda | `crm/agenda/[id]/page.tsx:90-101` | n/a | 🔴 `canAttend`/`canFinalize` hardcoded | RPC deveria retornar `allowedActions` |
| Calendar month-view | `agenda/_components/month-view.tsx:44-46` | n/a | 🟠 Color mapping stub | Cosmético, não bloqueia |
| **Modal "paciente na clínica" rico** | **N/A** | – | – | **❌ Não existe** |
| **UI Anamnese** | **N/A** | – | – | **❌ Não existe** |
| **UI Consentimento assinatura** | **N/A** | – | – | **❌ Não existe** |
| Lead lost modal | wired via outcome `perdido` em FinalizeWizard | ✅ `lead_lost` | Não | – |
| Bulk phase change | – | – | – | ❌ Não existe (RPC sim) |

---

## 12 · Tabela de RPCs/actions (14/14 presentes)

| RPC | Migration | Sec | Grava phase | Grava lifecycle | Grava appt.status | phase_history? | Risco |
|---|---|---|---|---|---|---|---|
| `lead_create` | mig 65:95 | DEFINER | ✅ → 'lead' | – | – | ✅ | – |
| `lead_to_appointment` | mig 65:214 | DEFINER | ✅ → 'agendado' | – | ✅ insert appt | ✅ | – |
| `appointment_attend` | mig 65:328 (atual) | DEFINER | ❌ (legado removido) | – | ✅ → 'na_clinica' + chegada_em | n/a | – |
| `appointment_change_status` | mig 72 | DEFINER | – | – | ✅ várias | n/a | – |
| `appointment_finalize` | mig 65/151 | DEFINER | via sub-RPC | via sub-RPC | ✅ → 'finalizado' | via sub-RPC | – |
| `lead_to_paciente` | mig 65:588 | DEFINER | ✅ → 'paciente' | – | – | ✅ | Pré-condição `phase='compareceu'` ainda? Auditar |
| `lead_to_orcamento` | mig 65:727 | DEFINER | ✅ → 'orcamento' | – | – | ✅ | Idem |
| `lead_lost` | mig 65:828 | DEFINER | ❌ | ✅ → 'perdido' | – | ✅ | Reason obrigatório · OK |
| `perdido_to_lead` | mig 65+ | DEFINER | ✅ volta ao prev | ✅ → 'ativo' | – | ✅ | Auditar uso |
| `lead_recovery_activate` | mig 65+ | DEFINER | – | ✅ → 'recuperacao' | – | – | Sem trigger automático |
| `sdr_change_phase` | mig 65:912 | DEFINER | ✅ delegado | – | – | ✅ | Manual override |
| `leads_bulk_change_phase` | mig 65+ | DEFINER | ✅ em batch | – | – | ✅ | Sem UI |
| `_sdr_record_phase_change` | mig 65+ | DEFINER (helper) | n/a | – | – | ✅ insert direto | – |
| `_appointment_status_transition_allowed` | mig 72 | INVOKER (utility) | – | – | – | – | – |
| `_lead_phase_transition_allowed` | mig 65 | INVOKER (utility) | – | – | – | – | Matrix lista 'compareceu'/'reagendado' como phase legado · auditar |

**14/14 RPCs presentes** · todas SECURITY DEFINER (exceto utilities) · grants OK.

---

## 13 · Bugs identificados (formato spec)

### BUG_2E_001

- **Título:** 8 trigger_types em `wa_agenda_automations` estão configurados mas órfãos (sem tick fn).
- **Severidade:** P0
- **Evidência:** Audit SQL bucket `trigger_types_active` mostra `d_before=2`, `d_zero=1`, `d_after=5`, `on_finalize=1`, `on_inbound_match=2`, `on_recurrence_created=1` ativos. `pg_proc` search por `%d_before%tick%` / `%d_after%tick%` / `%pos_consulta%tick%` retorna ZERO matches.
- **Arquivo/linha:** N/A (ausência de função)
- **Risco:** Confirmação D-1, "Chegou o dia", Pós D+1/D+2/D+3, NPS D+7 NÃO disparam mesmo com regras ativas. Clínica acredita que entrega esses fluxos.
- **Correção recomendada:** Implementar tick fns dedicadas em fases 2F (d_before/d_zero) e 2K (d_after) · cron diário 09h BRT.
- **Precisa migration?** Sim
- **Precisa deploy?** Não (só DB)
- **Pode afetar envio WhatsApp?** Sim quando worker 71 for ligado · ainda em mode seguro hoje
- **Pode afetar dados de produção?** Não (read-only) na fase de implementação
- **Próxima fase sugerida:** CRM_PHASE_2F

### BUG_2E_002

- **Título:** Frontend infere `canAttend`/`canFinalize` por string match hardcoded.
- **Severidade:** P1
- **Evidência:** `apps/lara/src/app/crm/agenda/[id]/page.tsx:90-101` hardcoda `['na_clinica','em_consulta','em_atendimento','finalizado']`.
- **Risco:** Backend evolui o state machine · UI não percebe · ações ficam visíveis/invisíveis erradamente.
- **Correção recomendada:** Backend (RPC ou view) retorna `allowedActions` derivadas de `_appointment_status_transition_allowed`. Frontend só renderiza.
- **Precisa migration?** Não (view nova opcional)
- **Precisa deploy?** Sim (UI mudança)
- **Pode afetar envio WhatsApp?** Não
- **Pode afetar dados produção?** Não
- **Próxima fase sugerida:** CRM_PHASE_2H

### BUG_2E_003

- **Título:** `crm_operational_view` não é consumida pelo frontend.
- **Severidade:** P1
- **Evidência:** Agent C: zero grep hit por `crm_operational_view` em `apps/lara/src/`.
- **Risco:** Frontend monta estado próprio · view canônica fica sem consumer · divergências futuras.
- **Correção recomendada:** Criar endpoint API + repo TS que consume a view · página de gestão CRM ler dela.
- **Próxima fase sugerida:** CRM_PHASE_2H

### BUG_2E_004

- **Título:** `lead_recovery_activate` existe mas sem trigger/cron.
- **Severidade:** P1
- **Evidência:** RPC presente · ZERO chamada automática (não está no cron, não está em trigger).
- **Risco:** Leads perdidos / no-show / orcamentos expirados nunca entram em recuperação automática.
- **Correção recomendada:** Cron diário ou trigger em `appointments.status='no_show'`/`cancelado` que ativa recuperação.
- **Próxima fase sugerida:** CRM_PHASE_2K

### BUG_2E_005

- **Título:** Anamnese tem tabelas mas sem FK appointment + sem UI + sem gate.
- **Severidade:** P2
- **Evidência:** `anamnesis_requests` FK apenas para `patients`, mig 66:27-31. UI = zero arquivos.
- **Risco:** Anamnese reportada como existente · não é coletada.
- **Correção recomendada:** Migration adiciona FK opcional `appointment_id` · UI tab no patient sheet · gate finalize.
- **Próxima fase sugerida:** CRM_PHASE_2I

### BUG_2E_006

- **Título:** Consentimento informado sem signature/storage/gate.
- **Severidade:** P2
- **Evidência:** `appointments.consentimento_img` = enum 4 estados · sem upload UI · sem bucket Storage · sem gate em finalize.
- **Risco:** LGPD/compliance · juridico.
- **Próxima fase sugerida:** CRM_PHASE_2I

### BUG_2E_007

- **Título:** Modal raw soft-delete em appointment bypassa RPC.
- **Severidade:** P2
- **Evidência:** `apps/lara/src/app/crm/agenda/[id]/_actions-bar.tsx:245` faz UPDATE direto em `deleted_at`.
- **Risco:** Sem audit trail · phase_history não registra · governance frágil.
- **Correção recomendada:** RPC `appointment_soft_delete(p_id, p_reason)`.
- **Próxima fase sugerida:** CRM_PHASE_2J

---

## 14 · Veredito final

**`CRM_PHASE_2E_AUDIT_COMPLETE`** com flag **`PARTIAL_GAPS_DOCUMENTED`**

- Camada banco: ✅ saudável e robusta. Schemas + RPCs + triggers cobrem o canônico.
- Camada automation: 🔴 8/13 trigger_types ativos sem tick fn. Confirmação, dia-da-consulta e pós-consulta não estão entregando.
- Camada UI: 🟡 paths principais wired via RPC · alguns hardcoded e stubs.
- Camada clínica (anamnese/consent): 🟠 tabelas stub · zero UI.
- Camada Alexa: ❌ dev-stub apenas.
- Camada recuperação comercial: 🟠 RPC pronta · sem automation.

**Veredito final por critério solicitado:** `PASS_CRM_PHASE_2E_PATIENT_JOURNEY_AUDIT_READY`

---

## 15 · Próximas fases recomendadas

| Fase | Título | Foco | Bloquear envio real? |
|---|---|---|---|
| **2F** | Appointment confirmation contracts | Tick fns `d_before` + `d_zero` | Não · job 71 OFF segue |
| **2G** | Secretaria/Mirian internal alerts | "Não confirmou" + "Paciente chegou" | Não |
| **2H** | Arrival / check-in + paciente na clínica | Modal rico + `em_atendimento` RPC + view consumer | Não |
| **2I** | Anamnese + consentimento informed map | UI + FK + gates + storage | Não |
| **2J** | Finalização enterprise | RPC `appointment_soft_delete` + gates | Não |
| **2K** | Pós-consulta / follow-up | Tick `d_after` + NPS + recuperação | Não |
| **2L** | WhatsApp real preflight | Auditoria template Meta + lara_v2 + Mih ban resolution | Sim (deps) |
| **2M** | Worker 71 controlled activation plan | Smoke + canary + observabilidade | **SIM** · só após 2F+2K |
| **2P** | Alexa wiring | Long term | Não |

**Sequência sugerida:** 2F → 2G → 2H → 2K → 2J → 2I → 2L → 2M.

Comece pela 2F porque tem **mais valor operacional imediato** (confirmação D-1 e dia-da-consulta) e é o **menor patch** (uma tick fn + 1 cron).

---

## 16 · Confirmações negativas finais

- ❌ Zero `supabase db push`
- ❌ Zero `migration repair`
- ❌ Zero deploy
- ❌ Zero alteração de cron
- ❌ Zero ativação job 71
- ❌ Zero envio WhatsApp
- ❌ Zero alteração de secrets/env
- ❌ Zero write em produção
- ❌ Zero alteração TS/app code funcional
- ❌ Zero migration aplicada
