# CRM_PHASE_2ALEXA.AUDIT · Alexa / Welcome Flow Audit

> Auditoria zero-risk do fluxo de Alexa / boas-vindas / aviso interno de chegada.
> **Não implementa nada** · apenas mapeia código, schema e legacy para decidir
> próximas fases com segurança.
> Worker 71 OFF · zero envio · zero call provider externo · zero migration.

---

## 1. Resumo executivo

V2 **já entregou a parte essencial** do fluxo "paciente chegou" via
**internal alerts** (CRM_PHASE_2G · mig 161):

- RPC `appointment_arrival_internal_alert(uuid)` cria 2 rows em
  `appointment_internal_alerts` (kind=`arrival` · target_role ∈
  `{professional, secretaria}`)
- `appointment_attend` (RPC) é o **evento canônico** que dispara o alerta
  via best-effort no [`attendAppointmentAction`](../../apps/lara/src/app/crm/_actions/appointment.actions.ts#L385-L405)
- Dashboard renderiza via [`AlertBell`](../../apps/lara/src/components/AlertBell.tsx)
  com polling 30s · badge + dropdown · "Marcar como lido"
- **Zero WhatsApp · zero provider externo · zero `wa_outbox`**

Alexa real existe **apenas no legacy** (`apps/lara/public/legacy/js/services/alexa-notification.service.js`)
chamando webhook externo do alexa-bridge. **Não está wired no v2.**
9 RPCs Alexa estão **dormentes** no DB (sobrevivência do legacy · UI v2
explicitamente **omitiu** as tabs Alexa em
[`ClinicSettingsClient.tsx:53`](../../apps/lara/src/app/(authed)/configuracoes/clinica/ClinicSettingsClient.tsx#L53)).

**Recomendação:** seguir **Opção D híbrida** · polir o painel interno
v2 (2ALEXA.1) + criar painel-TV recepção (2ALEXA.2) **antes** de tocar
em Alexa real (2ALEXA.3+).

---

## 2. Estado atual (read-only)

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `a98bef1` |
| origin/main | `a98bef1` |
| Working tree | limpo |
| Worker 71 | OFF ✓ |
| Jobs 12/72/89-94 | ON ✓ |
| `wa_outbox` queued/pending/unsafe | 0/0/0 ✓ |
| `appointment_internal_alerts` total | row schema ok · uso real ainda baixo (3 finalizados últimos 30d) |
| Cron com `%alexa%` | 0 ✓ |

---

## 3. O que existe no v2 (Layer A · aproveitável já)

### 3.1 RPC canônica de chegada

```
appointment_attend(p_id)               · RPC (mig 156)
  → UPDATE appointments
       SET status='na_clinica', chegada_em=now()
  → idempotente (skip se já em na_clinica/em_atendimento/finalizado)
```

### 3.2 Internal alerts (mig 161 · CRM_PHASE_2G)

- Tabela: `public.appointment_internal_alerts`
- Colunas: `id, clinic_id, appointment_id, alert_kind, target_role,
  target_user_id, payload, is_read, read_by, read_at, created_at`
- UNIQUE: `(appointment_id, alert_kind, target_role)` · idempotência nativa
- RLS · SELECT/UPDATE auth (clinic JWT) · INSERT/DELETE só service_role via RPCs

### 3.3 RPCs internal alerts

| RPC | Propósito |
|---|---|
| `appointment_internal_alert_create(uuid, text, text, uuid, jsonb)` | base · ON CONFLICT no-op |
| `appointment_internal_alert_mark_read(uuid)` | UI marca como lido |
| `appointment_arrival_internal_alert(uuid)` | cria 2 rows (professional + secretaria) |
| `_appointment_not_confirmed_alert_tick()` | tick service_role · D-1/D-0 |

### 3.4 Disparo TS após attend

[`attendAppointmentAction`](../../apps/lara/src/app/crm/_actions/appointment.actions.ts#L385-L410)
chama `repos.appointments.createArrivalInternalAlert(appointmentId)`
best-effort após RPC `attend` retornar `ok=true` e não-idempotent.
**Não bloqueia o fluxo** se alerta falhar (apenas log warn).

### 3.5 UI — AlertBell + hook

- [`apps/lara/src/components/AlertBell.tsx`](../../apps/lara/src/components/AlertBell.tsx)
  · sino + badge "9+" + dropdown
- [`apps/lara/src/hooks/useAppointmentInternalAlerts.ts`](../../apps/lara/src/hooks/useAppointmentInternalAlerts.ts)
  · polling 30s · mark_read otimista
- Labels canônicos: `arrival` = "Paciente chegou" · `not_confirmed_*` etc.

---

## 4. O que existe no legacy (Layer B · referência de UI/fluxo)

### 4.1 AlexaNotificationService

[`apps/lara/public/legacy/js/services/alexa-notification.service.js`](../../apps/lara/public/legacy/js/services/alexa-notification.service.js)
· **chama webhook externo** (alexa-bridge HTTP) com:

- 2 devices: `reception_device_name` + sala (via `clinic_rooms.alexa_device_name`)
- Templates com vars: `{{nome}} {{profissional}} {{procedimento}} {{sala}} {{hora}}`
- Bearer cookie auth · retry com backoff (3x · 2s/4s/8s) · rate-limit 2s entre devices
- Toast honesto: "Cookie expirado", "X OK · Y falhou"

### 4.2 Settings & repositories legacy

- [`alexa-settings.js`](../../apps/lara/public/legacy/js/alexa-settings.js) · CRUD config + métricas + health check
- [`alexa-devices.repository.js`](../../apps/lara/public/legacy/js/repositories/alexa-devices.repository.js)
- [`agenda-automations.engine.js`](../../apps/lara/public/legacy/js/agenda-automations.engine.js#L554)
  · chama `AlexaNotificationService.getConfig()` em rules da agenda

### 4.3 Tabelas DB criadas pelo legacy (zumbi · existem mas dormentes em v2)

| Tabela | Uso legacy |
|---|---|
| `clinic_alexa_config` | webhook_url, reception_device, welcome_template, room_template, auth_token, is_active |
| `clinic_rooms.alexa_device_name` | mapping sala → device Alexa |
| `alexa_devices` | inventory de devices |
| `alexa_announce_log` | audit das mensagens enviadas |

### 4.4 RPCs Alexa zumbi no DB (9 total)

```
upsert_alexa_config / get_alexa_config
upsert_alexa_device / get_alexa_devices / delete_alexa_device
alexa_log_announce / alexa_log_update / alexa_metrics / alexa_pending_queue
```

Status: presentes · grants antigos · **NÃO invocadas pelo v2** ·
risco zero enquanto UI v2 não importar `AlexaNotificationService`.

### 4.5 Decisão explícita do v2

[`apps/lara/src/app/(authed)/configuracoes/clinica/ClinicSettingsClient.tsx:53`](../../apps/lara/src/app/(authed)/configuracoes/clinica/ClinicSettingsClient.tsx#L53):
> `// Tabs alexa/documentos do legado omitidas (alexa = 5 campos extras, documentos...`

→ Time decidiu **não portar Alexa** ao v2 nessa rota. Decisão alinhada
com gate de envio WhatsApp/Meta.

---

## 5. Evento canônico recomendado

**`appointment_attend(p_id)`** é a única porta para chegada do paciente.
Características:

- Único caller na UI: botão "Marcar chegada" → `attendAppointmentAction`
- Atualiza `status='na_clinica' + chegada_em=now()` atomicamente
- Idempotente · skip se status já avançou (em_atendimento/finalizado/etc.)
- **Já dispara** `appointment_arrival_internal_alert(p_id)` best-effort

**Não usar** transição de status sem `appointment_attend` · trigger DB de
arrival foi descartado em 2G (decisão arquitetural: dispatch via TS para
manter controle e log estruturado).

**Não usar** trigger em `appointments.status='na_clinica'` para chamar
provider externo · isso conflita com o ban gate 2L e tornaria difícil
desativar Alexa quando necessário.

---

## 6. Destinatários

| Quem | Como | Onde |
|---|---|---|
| **Paciente** | nenhum por enquanto (canal Meta bloqueado · DRY-RUN do 2RC.1 cobre quando liberar) | — |
| **Mirian (profissional)** | `appointment_internal_alerts` row com `target_role='professional'` | dashboard via `AlertBell` |
| **Secretaria** | `appointment_internal_alerts` row com `target_role='secretaria'` | dashboard via `AlertBell` |
| **Recepção (TV/painel local)** | **NÃO implementado** · candidato 2ALEXA.2 | — |
| **Devices Alexa** | **NÃO implementado** · zumbi legacy · candidato 2ALEXA.3+ | — |

---

## 7. Canais possíveis

### 7.1 Dashboard (✅ implementado em v2)

`AlertBell` no header · polling 30s · zero infra externa · zero risco
provider. Suficiente para Mirian e Secretaria quando estão no PC.

### 7.2 Painel recepção/TV (🟡 candidato 2ALEXA.2)

Rota nova `/recepcao/painel` · RSC com `revalidate=15` ou client poll ·
mostra cards "Paciente chegou" + relógio + próximo paciente. **Mesma fonte
de dados** (`appointment_internal_alerts`). Zero provider externo.

### 7.3 Alerta interno sonoro (🟡 candidato 2ALEXA.1)

Beep local via Web Audio API quando novo alerta `arrival` chega · zero
provider externo · zero dependência Alexa. Toggle por user
(localStorage). Acessibilidade ARIA-live também ajuda leitores de tela.

### 7.4 Alexa real (🔴 candidato 2ALEXA.3 · DEFERIDO)

Requer:
- Conta Amazon Developer + skill aprovada OU bridge proprietário (alexa-bridge legacy)
- ENV/secrets: webhook_url + auth_token
- Kill switch operacional (toggle UI + DB flag)
- Logging dedicado (já existe `alexa_announce_log` zumbi)
- Cron de retry (não existe atualmente)
- Autorização explícita do Alden + plano de canary

**NÃO implementar nesta janela.** Sem env Meta liberado + sem bridge
acessível + sem template manager · custo de implementar agora > benefício.

---

## 8. Riscos identificados

| Risco | Severidade | Mitigação |
|---|---|---|
| 9 RPCs Alexa zumbi no DB · alguém invoca por engano | 🟡 médio | grep dirty no PR + monitor `alexa_announce_log.created_at` |
| Trigger de DB em `appointments.status='na_clinica'` que chama provider | 🟢 baixo | inventário confirmou: nenhum trigger desse tipo · só `normalize_phone` e `updated_at` |
| `clinic_alexa_config.is_active=true` em alguma clínica | 🟡 médio | auditar tabela antes de ressuscitar legacy (block sql opcional) |
| Reintrodução do `AlexaNotificationService` em rota v2 | 🟡 médio | code review + lint regra contra import de `public/legacy/js/*` no `src/` |
| `wa_outbox` insert disparado por erro de cópia do legacy | 🔴 alto | banner DRY-RUN permanente em todas rotas · validation SQL `wa_outbox_delta=0` no smoke |
| `appointment_arrival_internal_alert` best-effort silencioso pode falhar sem feedback | 🟢 baixo | log warn já existe · 2ALEXA.1 pode adicionar contador de falhas |
| Polling 30s do `AlertBell` é alto para clínicas grandes | 🟢 baixo | adaptar para SSE/Realtime quando justificar custo |

---

## 9. O que NÃO implementar agora

- ❌ Webhook para alexa-bridge (não existe env · não há autorização)
- ❌ Trigger DB para arrival (preserva controle TS · evita acoplamento ao provider)
- ❌ Reativar templates `clinic_alexa_config` (sem UI v2 · zumbi sem migração)
- ❌ Cron tick para arrival (já é dispatched on-demand via TS · não precisa)
- ❌ Integração com TTS/voice de paciente (fora do escopo · 2T+)
- ❌ Som local "beep" sem toggle de usuário (acessibilidade · pode incomodar)
- ❌ Push notification mobile (requer PWA + service worker · 2ALEXA.4+)
- ❌ Drop das 9 RPCs Alexa zumbi (postpone até audit final · descartar em fase dedicada)

---

## 10. Plano recomendado em fases

### 2ALEXA.1 · Internal Welcome Panel (próximo · baixo risco)

- Polir `AlertBell` · destacar cor para `arrival` (verde escuro?)
- Toggle de som local (Web Audio API · beep curto · localStorage)
- Mostrar tempo desde chegada na linha (`5 min atrás`)
- Botão rápido "Iniciar atendimento" inline no alerta
- **Sem** provider externo · **sem** migration

### 2ALEXA.2 · Reception Dashboard (TV)

- Rota nova `/recepcao/painel` · full-screen layout dashboard
- Cards grandes "Paciente chegou" com nome + procedimento + sala + foto
- Poll 15s ou Supabase Realtime
- Relógio + próximo paciente
- Modo "kiosk" no browser do PC da recepção
- **Sem** provider externo

### 2ALEXA.3 · Alexa Real Preflight (DEFERIDO)

- Mapear bridge alexa-bridge (legacy) · status atual?
- Documentar template manager + cookie refresh procedure
- ENV/secrets manager para webhook URL + Bearer token
- Kill switch UI · DB flag (`clinic_alexa_config.is_active`)
- Canary 1 device whitelisted · sem rollout massivo
- Cron retry tick com gate role admin
- **Requer autorização explícita do Alden**

### 2ALEXA.4 · Alexa Canary

- Smoke real-send canary (1 device · ban gate liberado)
- Logging dedicado · `alexa_announce_log` ativo
- Métricas: success rate · cookie expired count · latência
- Rollout gradual sala-a-sala

---

## 11. Critérios de segurança (invioláveis)

Em qualquer fase futura:

- ❌ Worker 71 nunca ligado preventivamente · só por autorização explícita
- ❌ Sem chamada Evolution/Meta/Cloud sem unban gate 2L
- ❌ Sem chamada alexa-bridge sem env explicitamente configurado
- ❌ Sem cron novo sem `is_active=false` por padrão + smoke transacional
- ❌ Sem trigger DB que chame provider externo
- ✅ Kill switch sempre em UI + DB flag
- ✅ Audit log em tabela dedicada
- ✅ Smoke transacional ROLLBACK antes de ship
- ✅ Validation SQL com `unsafe_outbox_count=0` + `worker71_off=true`

---

## 12. Veredito

**Fluxo "paciente chegou" v2 está completo no nível dashboard.**
Alexa real é projeto à parte · requer infra adicional + autorização +
canary. Próxima janela natural: **2ALEXA.1 (polish panel) + 2ALEXA.2 (TV)** ·
ambas zero-risk · sem provider · sem migration.

Audit SQL passou:
```json
{
  "worker71_off": true,
  "no_provider_call": true,
  "arrival_event_exists": true,
  "internal_alert_path_exists": true,
  "alexa_rpcs_dormant_count": 9,
  "arrival_alerts_total": 0,
  "unsafe_outbox_count": 0,
  "can_open_alexa_implementation_plan": true
}
```

Próximas decisões em [`87-next-prompt-after-2alexa-audit.md`](87-next-prompt-after-2alexa-audit.md).
