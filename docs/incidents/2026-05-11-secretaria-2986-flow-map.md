# Mapa Visual · Fluxos Secretaria/Mih (2986) · 2026-05-11

> Companheiro de [isolation-audit.md](2026-05-11-secretaria-2986-isolation-audit.md).
>
> Cinco diagramas:
> 1. Fluxo Cotidiano ponta a ponta (inbound real)
> 2. Fluxo Programado ponta a ponta (agenda/CRM/outbox)
> 3. Sequence diagram do fluxo programado
> 4. Mapa de convergência (onde os 2 fluxos se encontram)
> 5. Mapa de risco (verde/amarelo/vermelho)

---

## Diagrama 1 — Fluxo Cotidiano (inbound real do paciente / outbound real da secretária)

```mermaid
flowchart TD
  classDef sql fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
  classDef ts fill:#fff8e1,stroke:#f57f17,color:#5d4037
  classDef db fill:#f1f8e9,stroke:#558b2f,color:#33691e
  classDef cron fill:#fce4ec,stroke:#c2185b,color:#880e4f
  classDef dash fill:#ede7f6,stroke:#4527a0,color:#311b92

  PAC[Paciente / Secretária real]
  EVO[Evolution Mih instance · provider]
  WEBHOOK["/api/webhook/whatsapp-evolution<br/>route.ts"]:::ts
  AUTH{HMAC + secret OK?}:::ts
  PARSE[Inline parser<br/>route.ts:629-761]:::ts
  RESOLVE[Tenant resolve<br/>wa_numbers_resolve_by_instance<br/>route.ts:431]:::sql
  ROLE{inbox_role = 'secretaria'?}:::ts
  LID{remoteJid termina @lid?}:::ts
  LIDPEND[(wa_pending_lid_events)]:::db
  CONV[Resolve/Create conversation<br/>resolveConversation route.ts:1377]:::ts
  WAMSG[(wa_messages)]:::db
  TRG[Trigger SQL<br/>_sync_wa_conversation_preview_v2<br/>AFTER INSERT]:::sql
  WACONV[(wa_conversations)]:::db
  REPOUPD[updateLastMessage<br/>route.ts:1561 · TS double-write]:::ts
  SAVEOUT[MessageRepository.saveOutbound<br/>message.repository.ts:321-345<br/>TS double-write]:::ts
  PAGE["/secretaria · page.tsx"]:::dash
  QUERY[listByStatus<br/>conversation.repository.ts:113-161]:::dash

  PAC --> EVO
  EVO -->|webhook event| WEBHOOK
  WEBHOOK --> AUTH
  AUTH -- ok --> PARSE
  AUTH -- fail --> WEBHOOK
  PARSE --> RESOLVE
  RESOLVE --> ROLE
  ROLE -- não --> WEBHOOK
  ROLE -- sim --> LID
  LID -- sim & sem senderPn --> LIDPEND
  LID -- não / resolvido --> CONV
  CONV --> WAMSG
  CONV -.outbound from device.-> SAVEOUT
  SAVEOUT --> WAMSG
  WAMSG -->|AFTER INSERT trigger| TRG
  TRG -->|UPDATE preview canônico| WACONV
  WAMSG -.também.-> REPOUPD
  REPOUPD -.UPDATE redundante.-> WACONV
  SAVEOUT -.UPDATE redundante.-> WACONV
  WACONV --> QUERY
  WAMSG --> QUERY
  QUERY --> PAGE
```

**Lendo o diagrama:**
- Caminho azul (SQL) = canônico, robusto.
- Caminho amarelo (TS) = código aplicativo. **Os 2 nodes "double-write"** são as redundâncias que duplicam o trigger SQL.
- O dash lê de `wa_conversations` (preview) e ocasionalmente de `wa_messages` (thread).

---

## Diagrama 2 — Fluxo Programado (agenda/CRM gera mensagem que TALVEZ saia pelo Mih ou Lara)

```mermaid
flowchart TD
  classDef sql fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
  classDef db fill:#f1f8e9,stroke:#558b2f,color:#33691e
  classDef cron fill:#fce4ec,stroke:#c2185b,color:#880e4f
  classDef off fill:#ffebee,stroke:#c62828,color:#b71c1c
  classDef on fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20

  CRON72[cron job 72<br/>agenda_alert_min_before_tick<br/>*/1 * * * * · ATIVO dry-run]:::on
  CRON12[cron job 12<br/>daily-agenda-summary<br/>0 11 * * * · ATIVO]:::on
  CRON71[cron job 71<br/>wa_outbox_worker_tick<br/>*/1 * * * * · DESLIGADO]:::off
  CRON9[cron job 9<br/>wa-outbox-cleanup<br/>*/5 · ATIVO · só limpa]:::on
  CRONB2B[crons b2b_cron_*<br/>mensais · ATIVOS]:::on

  TICK[_agenda_alert_min_before_tick]:::sql
  ENQ[_enqueue_agenda_alert<br/>mig 156 + mig 158 NULLIF]:::sql
  PHONE[_appt_professional_phone]:::sql
  SUMMARY[wa_daily_summary]:::sql
  WORKER[_wa_outbox_tick · WORKER]:::off

  APPT[(appointments)]:::db
  RULES[(wa_agenda_automations)]:::db
  PROF[(professional_profiles)]:::db
  OUTBOX[(wa_outbox)]:::db
  ALOG[(agenda_alerts_log<br/>UNIQUE appt_id, alert_kind)]:::db
  WAMSG[(wa_messages)]:::db
  WACONV[(wa_conversations)]:::db
  EVOPROVIDER[Provider · Cloud OR Evolution]

  CRON72 -->|chama a cada min| TICK
  TICK -->|lê regras ativas| RULES
  TICK -->|busca appts na janela| APPT
  TICK -->|chama com appt| ENQ
  ENQ -->|resolve phone| PHONE
  PHONE --> PROF
  ENQ -->|INSERT row queued| OUTBOX
  ENQ -->|INSERT idempotente| ALOG

  CRON12 -->|chama 11h diário| SUMMARY
  SUMMARY -->|INSERT broadcast queued| OUTBOX

  CRONB2B -.gera dispatch B2B.-> OUTBOX

  OUTBOX -.lê queued.- WORKER
  WORKER -.OFFLINE: caso ON, chamaria provider.- EVOPROVIDER
  WORKER -.OFFLINE: caso ON, MessageRepository.saveOutbound.- WAMSG
  WAMSG -.AFTER INSERT trigger.-> WACONV

  CRON9 -->|DELETE rows sent old| OUTBOX
```

**Lendo o diagrama:**
- Verde = está ligado.
- Vermelho = **off** (worker job 71 desligado é o gate atual de envio real).
- Linhas pontilhadas = "se ligado / quando ligado".
- **`wa_outbox` é o ponto de espera**. Mensagens programadas se acumulam ali.
- **`agenda_alerts_log` é o gate de idempotência.** Garante que o mesmo alerta para o mesmo appt não enfileira 2x.
- Programado NUNCA escreve em `wa_messages` ou `wa_conversations` diretamente. Só via worker, que está OFF.

---

## Diagrama 3 — Sequence do fluxo programado (quando ativado)

```mermaid
sequenceDiagram
  participant CRON as pg_cron 72
  participant TICK as _agenda_alert_min_before_tick
  participant RULES as wa_agenda_automations
  participant APPT as appointments
  participant PHONE as _appt_professional_phone
  participant ENQ as _enqueue_agenda_alert
  participant OUTBOX as wa_outbox
  participant ALOG as agenda_alerts_log
  participant WORKER as _wa_outbox_tick (job 71 OFF)
  participant PROV as Provider (Cloud/Evolution)
  participant MSGS as wa_messages
  participant CONV as wa_conversations

  CRON->>TICK: executa */1 min
  TICK->>RULES: SELECT regras is_active=true, trigger_type='min_before'
  loop por regra
    TICK->>APPT: SELECT appts na janela now+9..now+11min, sem alert_kind no log
    loop por appt
      TICK->>PHONE: resolve phone do professional
      PHONE-->>TICK: '5544998787673' (ou NULL)
      alt phone OK
        TICK->>ENQ: enqueue(clinic, appt, alert_kind, rule, phone)
        ENQ->>OUTBOX: INSERT (status='queued', appt_ref, rule_id, content via NULLIF mig 158)
        ENQ->>ALOG: INSERT ON CONFLICT (appt_id, alert_kind) DO NOTHING
        ENQ-->>TICK: outbox_id
      end
    end
  end
  TICK-->>CRON: int v_fired (count)

  Note over OUTBOX,WORKER: GATE: worker job 71 está OFF<br/>nada flui daqui pra frente

  rect rgba(255,235,238,0.3)
    Note right of WORKER: HIPOTÉTICO · se worker ligar:
    WORKER->>OUTBOX: SELECT queued LIMIT N
    WORKER->>PROV: POST send
    PROV-->>WORKER: 200 OK + wa_message_id
    WORKER->>OUTBOX: UPDATE status='sent', sent_at, wa_message_id
    WORKER->>MSGS: INSERT wa_messages (direction='outbound', sender='lara' ou 'humano')
    MSGS->>CONV: TRIGGER _sync_wa_conversation_preview_v2 → UPDATE preview
  end
```

**Observação crítica:** o **único caminho legítimo** para um conteúdo programado se tornar visível na conversa real é via `INSERT em wa_messages` pelo worker **após confirmação do provider**. Nenhum atalho.

---

## Diagrama 4 — Mapa de Convergência

```mermaid
flowchart LR
  classDef cotidiano fill:#e3f2fd,stroke:#1976d2,color:#0d47a1
  classDef programado fill:#fce4ec,stroke:#c2185b,color:#880e4f
  classDef compart fill:#fff9c4,stroke:#f9a825,color:#5d4037
  classDef perigo fill:#ffcdd2,stroke:#c62828,color:#b71c1c

  subgraph COT[Fluxo Cotidiano]
    direction TB
    F1[Webhook Evolution]:::cotidiano
    F2[Inbound parser]:::cotidiano
    F3[saveInbound]:::cotidiano
    F4[saveOutbound device echo]:::cotidiano
  end

  subgraph PROG[Fluxo Programado]
    direction TB
    P1[cron 72 tick]:::programado
    P2[_enqueue_agenda_alert]:::programado
    P3[cron 12 daily-summary]:::programado
    P4[B2B crons]:::programado
  end

  subgraph SHARED[Pontos compartilhados]
    direction TB
    S_NUMBERS[(wa_numbers · phone map)]:::compart
    S_PROFILES[(professional_profiles · phone)]:::compart
    S_LEADS[(leads · phone)]:::compart
    S_OUTBOX[(wa_outbox · QUEUE compartilhada)]:::compart
    S_WORKER["_wa_outbox_tick (job 71 · OFF · gate)"]:::compart
    S_MSGS[(wa_messages · só worker insere · OFF)]:::compart
    S_CONV[(wa_conversations · preview)]:::perigo
  end

  COT --> S_NUMBERS
  COT --> S_LEADS
  COT --> S_MSGS
  COT --> S_CONV

  PROG --> S_NUMBERS
  PROG --> S_PROFILES
  PROG --> S_LEADS
  PROG --> S_OUTBOX
  S_OUTBOX --> S_WORKER
  S_WORKER -.OFF.-> S_MSGS
  S_MSGS -.AFTER INSERT trigger.-> S_CONV

  COT -.double-write TS PERIGO.-> S_CONV
```

**Pontos seguros (amarelo):**
- `wa_numbers`, `professional_profiles`, `leads` — read-only para ambos, sem conflito.
- `wa_outbox` — fila exclusiva do programado; cotidiano não lê nem escreve aqui.
- `_wa_outbox_tick` — worker é o **único ponto de cruzamento legítimo** (atualmente OFF).

**Ponto perigoso (vermelho):**
- `wa_conversations` — fonte da verdade do preview. Escrito por:
  1. Trigger SQL canônico (`_sync_wa_conversation_preview_v2`) via INSERT em `wa_messages`.
  2. **Double-write TS** do webhook Evolution (line 1561).
  3. **Double-write TS** de `saveOutbound` (line 321-345).

---

## Diagrama 5 — Mapa de Risco

```mermaid
flowchart TB
  classDef green fill:#c8e6c9,stroke:#2e7d32,color:#1b5e20
  classDef yellow fill:#fff9c4,stroke:#f9a825,color:#6d4c41
  classDef red fill:#ffcdd2,stroke:#c62828,color:#b71c1c
  classDef gate fill:#e1bee7,stroke:#6a1b9a,color:#4a148c

  subgraph GREEN[ZONA VERDE · ISOLADO E ROBUSTO]
    G1[Trigger SQL _sync_wa_conversation_preview_v2<br/>guards · EXCEPTION handler · canônico]:::green
    G2[wa_outbox sem trigger que toque wa_conversations]:::green
    G3[agenda_alerts_log UNIQUE appt_id, alert_kind<br/>idempotência garantida]:::green
    G4[_enqueue_agenda_alert mig 156+158<br/>guards lead_id, phone, NULLIF content]:::green
    G5[wa_pending_lid_events isolado<br/>não toca conversa]:::green
  end

  subgraph GATE_LAYER[GATE OPERACIONAL]
    GW[cron job 71 wa_outbox_worker_tick · OFF<br/>impede envio + impede insert em wa_messages]:::gate
  end

  subgraph YELLOW[ZONA AMARELA · ATENÇÃO]
    Y1[Double-write TS<br/>webhook Evolution route.ts:1561 + saveOutbound:321<br/>redundante mas não quebra preview]:::yellow
    Y2[B2B crons 26-33 · enqueue mensal<br/>worker OFF protege]:::yellow
    Y3[wa_daily_summary insere outbox sem conversation_id<br/>broadcast-like · sem preview update]:::yellow
    Y4[Conversa reativa archived→active em saveOutbound<br/>comportamento intencional · ok]:::yellow
  end

  subgraph RED[ZONA VERMELHA · QUEBRA PROVÁVEL]
    R1[🔴 listByStatus sem wa_number_id<br/>mistura Mih + Mira + Marci + Aux]:::red
    R2[🔴 getSecretariaKpiCounts sem wa_number_id<br/>KPIs inflados]:::red
    R3[🟠 Preview drift residual ~10 convs Mih<br/>até 24h atrasado vs MAX sent_at<br/>resíduo do trigger zumbi 2026-05-04]:::red
    R4[🔴 Query ordena por last_message_at sem fallback<br/>drift faz convs frescas afundarem]:::red
    R5[🟡 Mismatch silencioso quando trigger zumbi recidiva<br/>sem health-check / alerta]:::red
  end

  GREEN --> GATE_LAYER
  GATE_LAYER --> YELLOW
  YELLOW --> RED
```

**Lendo o mapa:**

- **Verde:** o que está bem isolado e correto. Trigger SQL é a estrela; `wa_outbox` e `agenda_alerts_log` não sangram.
- **Gate:** **job 71 OFF** é o único motivo de não termos um vazamento operacional sério. Quando ele ligar, a zona amarela precisa estar limpa.
- **Amarelo:** double-write TS, B2B crons, broadcast — funcionam, mas precisam ser limpos antes de produção plena.
- **Vermelho:** o que está quebrando agora. Defeitos 1, 2, 4 são o que torna o dash "vazio/stale". Defeito 5 é a falta de alarme caso 2026-05-04 se repita.

---

## Resumo executivo dos diagramas

| Diagrama | Mostra | Lição |
|---|---|---|
| 1 (Cotidiano) | Path real Evolution → wa_messages → preview | Trigger SQL canônico + double-write TS redundante |
| 2 (Programado) | Path tick → outbox → worker (off) | Programado NÃO toca conversa enquanto worker está OFF |
| 3 (Sequence) | Como agenda alert vira mensagem (hipotético) | Único caminho legítimo: worker INSERT em wa_messages → trigger atualiza preview |
| 4 (Convergência) | `wa_conversations` é o único ponto vermelho real | Compartilhamento existe, mas via trigger SQL é seguro |
| 5 (Risco) | Verde / Amarelo / Vermelho | Vermelho = query do dash + drift residual. Verde = SQL layer. Amarelo = TS redundante |
