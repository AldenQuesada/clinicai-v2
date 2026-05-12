# CRM_PHASE_2ALEXA.2 · Painel-TV Recepção

> Painel visual de chegada para recepção física da clínica. Modo kiosk
> read-only · 4 blocos (chegaram agora / em atendimento / próximos / atrasados).
> **Zero migration · zero provider · zero WhatsApp · zero Alexa · zero
> mutação · zero dado clínico sensível.**

---

## 1. Resumo executivo

Rota nova `/recepcao/painel` (dentro do `(authed)` group) que mostra estado
da agenda do dia em formato kiosk-friendly · TV da recepção pode deixar
aberta o dia inteiro.

Entrega:
- **Server page** com `revalidate=15` (Next.js auto-refresh)
- **Client component** com:
  - Relógio do header (tick 1s)
  - Tempo decorrido inline (tick 30s · sem refetch)
  - Botão "Atualizar agora" (router.refresh)
- **4 blocos visuais:**
  - Chegaram agora (`status=na_clinica`) · cor emerald
  - Em atendimento (`status=em_atendimento`) · cor azul
  - Atrasados (status pré-chegada com `start_time` ≥ 10 min no passado) · cor vermelha
  - Próximos horários (agendado/aguardando_confirmacao/confirmado/aguardando) · coluna lateral
- **Zero backend novo** · reusa `AppointmentRepository.listByDate`

**Veredito:** `PASS_CRM_2ALEXA2_RECEPTION_PANEL_READY_LOCAL_COMMIT`

---

## 2. Estado inicial

- HEAD: `fc7cf61`
- Branch `main` sincronizado · working tree limpo
- worker 71 OFF · `wa_outbox` 0/0/0 · cron provider 0
- 0 appointments hoje no DB de dev · painel renderiza empty states OK

---

## 3. Rota criada

`apps/lara/src/app/(authed)/recepcao/painel/page.tsx`

- Path: `/recepcao/painel`
- Server Component · `revalidate=15` (refresh automático server-side)
- `force-dynamic` para sempre ler dados atuais
- Acessível dentro do AppShell autenticado

Sub-arquivos:
- `_client.tsx` · client component com clock + ticker + UI completa
- (exporta tipo `PanelRow` da page para o client tipar props)

---

## 4. Fontes de dados

| Source | Uso |
|---|---|
| `AppointmentRepository.listByDate(clinicId, today)` | reusado (já existia · 2H) |
| `appointments.status` | classifica em 4 buckets |
| `appointments.chegada_em` | calcula "há X min" para arrival/in_service |
| `appointments.start_time` | calcula "X min atrasado" para overdue |
| `appointments.subject_name` | nome do paciente (pode mostrar) |
| `appointments.subject_phone` | **mascarado · só últimos 4 dígitos** |
| `appointments.professional_name` | nome do profissional |
| `appointments.procedure_name` | nome do procedimento (não detalhes clínicos) |

**Nenhum join clínico/financeiro:**
- ❌ `anamnesis_requests`
- ❌ `legal_doc_requests` (consent)
- ❌ Valores/`payment_status`
- ❌ Observações clínicas
- ❌ Dados médicos sensíveis

---

## 5. Contrato de privacidade

| Dado | Status | Notas |
|---|---|---|
| Nome do paciente | ✅ exposto | recepção física já sabe quem é |
| Telefone | 🟡 mascarado | apenas últimos 4 dígitos via `maskPhone()` |
| Profissional | ✅ exposto | público |
| Procedimento | ✅ exposto | nome do serviço (não diagnóstico) |
| Horário | ✅ exposto | público |
| Tempo decorrido | ✅ derivado | calculado client-side |
| Valor | ❌ **NÃO exposto** | financeiro fora do escopo TV |
| Anamnese/Consent | ❌ **NÃO exposto** | clínico sensível |
| Observações | ❌ **NÃO exposto** | pode conter info clínica |
| CPF/email/endereço | ❌ **NÃO exposto** | não consultado |

Enforced no código (`page.tsx`):
- Função `maskPhone()` aplica regex `/\D/g` + `slice(-4)`
- Função `toRow()` mapeia apenas campos seguros do `AppointmentDTO`
- Nenhum join clínico chamado

---

## 6. UI entregue

### Header (full-width)
- "Recepção · {data extenso PT-BR}"
- Título "Painel da clínica"
- Relógio gigante (emerald · HH:MM:SS) · tick 1s
- "Atualização automática · 15s" + botão "Atualizar" manual

### Grid 2 colunas (2fr / 1fr)

**Coluna esquerda:**
1. **Chegaram agora** · `UserCheck` emerald · cards grandes nome + procedimento + profissional + "há X min" (calculado a partir de `chegada_em`)
2. **Em atendimento** · `Activity` azul · similar mas tone azul
3. **Atrasados** (condicional · só renderiza se > 0) · `AlertTriangle` vermelho · "X min atrasado" calculado de `start_time`

**Coluna direita:**
4. **Próximos horários** · `CalendarClock` muted · lista compacta com horário + nome + profissional · limite 10

### Empty states
Cada bloco tem mensagem própria quando count=0:
- "Nenhum paciente aguardando agora."
- "Nenhum atendimento em curso."
- "Sem mais agendamentos hoje."
- (Atrasados omite bloco inteiro se count=0)

### Estilização

- Background `#0a0a0f` (preto profundo para TV em sala mal iluminada)
- Texto `#e5e5e5` (alta contraste sem ser branco puro)
- Fontes grandes para legibilidade à distância (h1: 32px, relógio: 56px, nomes em arrived: 22px)
- Tabular numbers em relógio + horários
- ARIA labels em botões

---

## 7. Auto-refresh

**Strategy:** dual refresh

1. **Server-side**: `export const revalidate = 15` · Next.js refaz fetch a cada 15s
2. **Client-side ticker**: `useTicker(30_000)` força re-render do label "há X min" sem refetch (evita network call)
3. **Manual**: botão "Atualizar agora" → `router.refresh()` força fresh server fetch

**Não usa:**
- ❌ Supabase Realtime channels (overkill para clinic UX)
- ❌ Polling cliente agressivo (mais rede + impede cache)
- ❌ Notification API (sem permission prompts)
- ❌ Service Workers / PWA push

---

## 8. O que NÃO foi feito

- ❌ Migration nova
- ❌ Repository novo (reutiliza `listByDate`)
- ❌ RPC/action nova
- ❌ Provider externo (Alexa, WhatsApp, push)
- ❌ Sound/beep no painel (AlertBell já tem · evita duplicar)
- ❌ Multi-clínica / cross-tenant
- ❌ Filtros (painel é overview do dia · não navegável)
- ❌ Detail page navegação (Link para `/crm/agenda/[id]` seria perigoso em TV pública)
- ❌ Drag-drop / reordenação
- ❌ Histórico de chegadas anteriores

---

## 9. Smoke / Validation

### Smoke (`phase-2alexa2-reception-panel-smoke.sql`)

11 cenários · 100% read-only · todos PASS:

| Test | Resultado |
|---|---|
| A worker71_off | true |
| B wa_outbox baseline | 0/0/0 |
| C appointments today query | roda (count=0 atual) |
| D na_clinica query | roda |
| E em_atendimento query | roda |
| F upcoming query | roda |
| G professional orphans today | 0 ✅ |
| H subject display orphans | 0 ✅ |
| I no provider cron | 0 ✅ |
| J clinical joins | absent ✅ |
| K unsafe outbox | 0 ✅ |

### Validation flags

```json
{
  "worker71_off": true,
  "reception_sources_ready": true,
  "privacy_contract_ok": true,
  "alert_contract_ready": true,
  "unsafe_outbox_count": 0,
  "phase_perdido_count": 0,
  "invalid_appointment_status_count": 0,
  "cron_with_provider_call": 0,
  "can_continue": true
}
```

---

## 10. Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| Painel-TV exibe nome de paciente publicamente | 🟡 médio | Decisão deliberada · recepção física já mostra · usuário deve posicionar TV em local apropriado |
| Tab dormente no browser atrasa tick client | 🟢 baixo | `revalidate=15` server-side garante refresh mesmo com aba inativa |
| Apertar refresh agressivamente | 🟢 baixo | `router.refresh` é debounced naturalmente · sem rate limit explícito |
| 0 dados hoje no dev | 🟢 baixo | Empty states bem documentados · UI renderiza corretamente vazia |
| Logged-out user acessa | 🟢 baixo | Rota dentro de `(authed)` group · AppShell já protege |
| Token JWT expira em sessão de TV longa | 🟡 médio | Padrão Supabase · pode falhar silenciosamente · operador precisa re-logar |

---

## 11. Próxima fase

Ver [`103-next-prompt-after-2alexa2.md`](103-next-prompt-after-2alexa2.md).

Recomendado:
- **LEGACY.PORT.WIZARD_PROCEDURES** (Select FK de procedimentos no wizard)
- **LEGACY.PORT.ANAMNESIS_BUILDER** (templates customizáveis)
- **LEGACY.PORT.PRONTUARIO** (timeline clínica do paciente)

---

## 12. Veredito

**`PASS_CRM_2ALEXA2_RECEPTION_PANEL_READY_LOCAL_COMMIT`**

Painel-TV recepção entregue · zero migration · zero provider · zero
mutação · zero dado clínico sensível. Reusa toda infra existente
(`AppointmentRepository.listByDate`). Privacidade enforced via masking
de telefone + ausência total de joins clínicos.
