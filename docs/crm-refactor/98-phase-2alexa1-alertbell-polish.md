# CRM_PHASE_2ALEXA.1 · AlertBell Polish / Chegada UX

> UI polish do sino de alertas internos. **Zero migration · zero provider ·
> zero WhatsApp · zero `wa_outbox`**. Destaque visual para arrival, tempo
> decorrido inline, link rápido para abrir atendimento e toggle opcional de
> som local (Web Audio API · falha silenciosa).

---

## 1. Resumo executivo

Polish do `AlertBell.tsx` que consome `appointment_internal_alerts` (mig 161
· CRM_PHASE_2G):

1. **Destaque emerald** para alertas `arrival`/`patient_arrived` (cor + ícone +
   linha de fundo · agrupados primeiro em "Chegadas agora")
2. **Tempo decorrido inline** ("agora mesmo", "há 2 min", "há 1h", "há 2d") ·
   atualiza a cada 30s via ticker leve · zero polling extra
3. **Link "Abrir"** → `/crm/agenda/[appointment_id]` para todos alertas. Para
   arrival mostra "Abrir" com cor verde · sem mutação direta (backend protege)
4. **Toggle "Som local"** no header do dropdown · persistência via `localStorage`
   APENAS como PREFERÊNCIA UI · Web Audio API sintetiza beep 880Hz/300ms · falha
   silenciosa se API indisponível ou sem user-gesture. Som dispara apenas em
   **NOVO** alerta `arrival` (diff de IDs vs lista anterior)
5. **Agrupamento**: "Chegadas agora" (verde) primeiro · "Outros alertas" depois ·
   empty state claro

Backend: **reaproveitado 100%** · zero novas actions/RPCs/migrations.

**Veredito:** `PASS_CRM_2ALEXA1_ALERTBELL_POLISH_READY_LOCAL_COMMIT`

---

## 2. Estado inicial

- HEAD: `830a104`
- Branch `main` · origin sincronizado
- Worker 71 OFF · contratos canon prontos
- `appointment_internal_alerts` table + 3 RPCs (arrival, mark_read, attend) operacionais
- AlertBell base 2G já em produção · ícone amber genérico para todos kinds

---

## 3. O que foi melhorado

### 3.1 Arrival highlight (visual)

| Aspecto | Antes | Depois |
|---|---|---|
| Ícone bg | amber 10% para todos | emerald 12% se `arrival` · red 12% se `attention_required` · amber para resto |
| Ícone color | amber #f59e0b para todos | emerald `#10b981` para arrival · red para attention · amber resto |
| Título do alerta | cor ivory padrão | **emerald bold** para arrival |
| Linha de fundo | transparente | emerald 4% para arrival (sutilmente diferente) |
| Badge do sino (com arrival) | sempre vermelho | **emerald** se há arrivals · vermelho caso só outros |

### 3.2 Tempo decorrido inline

Novo helper `elapsedLabel(iso, now)`:

```
< 1 min  → "agora mesmo"
< 60 min → "há N min"
< 24 h   → "há Nh"
≥ 24 h   → "há Nd"
```

Fonte do timestamp: `payload.chegada_em` se presente (preferido para arrival) ·
fallback `created_at` do alerta. Atualizado a cada 30s via hook local `useTicker`
(zero polling adicional · só força re-render).

### 3.3 Quick action

Cada item do dropdown ganhou um **Link** (não botão de mutação) com seta direita:

- Label "Abrir" para arrival (verde) · "Ver" para outros alertas
- Destino: `/crm/agenda/[appointment_id]`
- Sem mutação · sem provider · backend protege ações sensíveis (state machine
  do `appointment_attend` rejeita transições inválidas)

Botão "Marcar como lido" (✓) continua presente abaixo do Link.

### 3.4 Som local opcional

Toggle "Som on / Som off" no header do dropdown:

- Preferência persistida em `localStorage['crm_alertbell_sound_v1']` · APENAS
  como UI preference (nunca fonte operacional)
- Web Audio API (`AudioContext`) · oscilador sine 880Hz · gain ramp 0.15 ·
  300ms total
- Beep dispara apenas quando NOVO `arrival` aparece (diff vs lista anterior
  por id) · não toca retroativamente no mount
- Primeira ativação produz beep de feedback (também desbloqueia AudioContext)
- Falha silenciosa: try/catch · falta de Web Audio = sem som · sem erro

### 3.5 UX dropdown · agrupamento

- Header com toggle de som à direita
- Grupo "Chegadas agora" (uppercase emerald) seguido de items arrival
- Grupo "Outros alertas" (uppercase muted) com restante
- Empty state: "Sem alertas no momento."
- Width: 380 → 420px (espaço para Link + Marcar lido lado a lado)

---

## 4. Contrato de segurança

| Regra | Status |
|---|---|
| Zero envio WhatsApp | ✅ apenas Link → rota interna |
| Zero provider externo | ✅ Web Audio API é browser-only |
| Zero chamada Alexa | ✅ |
| Zero `wa_outbox` mutation | ✅ smoke confirma 0 |
| Zero migration | ✅ |
| Zero alteração cron | ✅ |
| Zero env/secrets | ✅ |
| localStorage como fonte operacional | ❌ apenas PREFERÊNCIA UI · documentado |
| Web Audio API permission | ✅ não requer (sintetiza · não carrega arquivo) |
| Notification API | ❌ não usado · evita pedir permission |
| Polling rate | ✅ mantido 30s do hook 2G |

---

## 5. Smoke / Validation

### Validation SQL (`phase-2alexa1-alertbell-polish-validation.sql`)

```json
{
  "worker71_off": true,
  "alert_contract_ready": true,
  "arrival_path_ready": true,
  "appointment_attend_ready": true,
  "unsafe_outbox_count": 0,
  "phase_perdido_count": 0,
  "invalid_appointment_status_count": 0,
  "cron_with_provider_call": 0,
  "alexa_authenticated_grants": 0,
  "can_continue": true
}
```

### Smoke SQL (`phase-2alexa1-alertbell-polish-smoke.sql`)

| Test | Resultado |
|---|---|
| A worker71_off | ✅ true |
| B wa_outbox baseline | 0/0/0 |
| C internal_alerts table | ✅ exists |
| D arrival RPC | ✅ exists |
| E attend RPC | ✅ exists |
| F invalid statuses | 0 |
| G phase_perdido | 0 |
| H provider cron | 0 |
| I alexa authenticated grants | 0 (CONTROL.2 OK) |

### Manual UI checklist

1. ✅ Abrir dashboard com alert bell — sino renderiza
2. ✅ Confirmar destaque emerald visual para arrival (cor + bg + título bold)
3. ✅ Confirmar tempo decorrido inline ("há X min") · atualiza após 30s
4. ✅ Confirmar Link "Abrir" → `/crm/agenda/[id]` (sem mutação direta)
5. ✅ Confirmar toggle "Som local" persiste em localStorage
6. ✅ Confirmar beep dispara em NOVO arrival (não no mount)
7. ✅ Confirmar agrupamento "Chegadas agora" / "Outros alertas"
8. ✅ Confirmar sem botão "Enviar WhatsApp"
9. ✅ Confirmar sem chamada Alexa / provider externo

---

## 6. O que NÃO foi feito (escopo controlado)

- ❌ Botão "Iniciar atendimento" inline com mutação direta · prefere Link para
  detail · backend protege transição
- ❌ Notification API (Permission API) · pode ser refinement futuro
- ❌ Real-time via Supabase channel · polling 30s suficiente para clinic UX
- ❌ Custom som personalizado (upload de arquivo) · arquitetura simples
- ❌ Dashboard widget "Próximas chegadas" · candidato 2ALEXA.2 (painel TV)
- ❌ Histórico de alertas lidos (página dedicada) · alert dropdown é só pendentes

---

## 7. Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| Web Audio API bloqueada sem user-gesture | 🟢 baixo | Toggle exige click · primeira ativação desbloqueia ctx |
| localStorage indisponível (modo privado) | 🟢 baixo | try/catch · soundOn default false |
| Beep retroativo no mount | 🟢 baixo | `initializedRef` previne · só toca em diff |
| Tempo decorrido drift se aba dormente | 🟢 baixo | useTicker re-roda no foco · suficiente para UX |
| Link sem indicador de status | 🟡 médio | Detail page mostra state machine atual · backend valida |

---

## 8. Próxima fase

Ver [`99-next-prompt-after-2alexa1.md`](99-next-prompt-after-2alexa1.md).

Recomendado:
- **LEGACY.PORT.PROCEDURES_ADMIN** (CRUD admin · ROI operacional)
- **2ALEXA.2** (painel-TV recepção · expandir UX visual)
- **LEGACY.PORT.ANAMNESIS_BUILDER** (templates customizáveis)

---

## 9. Veredito

**`PASS_CRM_2ALEXA1_ALERTBELL_POLISH_READY_LOCAL_COMMIT`**

UI polish entregue com som local opcional. Zero backend novo · zero migration ·
zero provider. AlertBell agora destaca arrival visualmente, mostra tempo
decorrido inline, oferece link rápido para detail e som local (toggle opt-in).
Worker 71 OFF · core contracts preservados · `can_continue=true`.
