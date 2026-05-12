# CRM_PHASE_2L · WhatsApp Real Send Readiness / Mih Ban Gate

> **Data:** 2026-05-12
> **Status:** **BLOCKED · envio real bloqueado**
> **HEAD:** `c9257c4137df8e7756f2ad1951601bed2563272b` · `origin/main`
> **Verdict do gate:** `BLOCKED_CRM_PHASE_2L_WHATSAPP_REAL_SEND_NUMBER_BANNED`

---

## 1 · Resumo executivo

O número de WhatsApp oficial da Secretaria/Mih (`5544991622986`) está **banido pelo WhatsApp**. Tentativas anteriores de reparear via Baileys/Evolution retornaram **403 Forbidden** com `reason: "rva"` (reauthorization failure · cliente não-oficial detectado).

Toda a infraestrutura de geração de fila (crons 89/90, tick fns d_before/d_zero, helpers de enqueue, idempotência) está **funcional e segura em dry-mode**. Worker 71 (`wa_outbox_worker_tick`) está e **deve permanecer** `active=false` enquanto o canal oficial de envio não estiver aprovado.

Esta é a **fase de gate documental** · zero ação no banco · zero envio · documenta o bloqueador e o caminho de readiness antes de liberar envio real.

---

## 2 · Estado atual

| Item | Valor |
|---|---|
| Mig 160 | aplicada · tracker registrado |
| Tick fns | `_agenda_alert_d_before_tick()` + `_agenda_alert_d_zero_tick()` existem |
| Cron job 89 (d_zero) | `active=true` · `0 11 * * *` UTC · 08:00 BRT |
| Cron job 90 (d_before) | `active=true` · `0 13 * * *` UTC · 10:00 BRT |
| Cron job 12 (daily-summary) | `active=true` (canal interno) |
| Cron job 72 (min_before) | `active=true` (dry · janela curta) |
| **Cron job 71 (worker)** | **`active=false`** ✅ **gate inegociável** |
| `wa_outbox` total | 123 (66 sent · 8 failed · 49 cancelled · 0 queued) |
| `wa_outbox` queued últ 1h | 0 |
| `agenda_alerts_log` total | 0 |
| Mih (5544991622986) WhatsApp Web/Baileys | **banido** (403 rva) |
| Lara (5544995887773) Cloud Meta API | ativo (mas não é o canal default de regras "Confirmacao D-1" / "Chegou o Dia") |

---

## 3 · Novo bloqueador

**Número de WhatsApp da Secretaria/Mih está banido.**

Cronologia:
- 2026-05-11 12:48 UTC · Evolution instance Mih recebeu `device_removed` (401).
- 2026-05-12 ~04:30 BRT · tentativa de re-pareamento via Evolution (QR scan, restart instance) retornou 403 com `reason: "rva"` (banimento por automação Baileys detectada pelo WhatsApp).
- 2026-05-12 ~05:00 BRT · usuário relata: "eles baniram o número até no telefone".

Doc de incidente preserva o root cause: [`docs/incidents/2026-05-11-secretaria-2986-isolation-audit.md`](../incidents/2026-05-11-secretaria-2986-isolation-audit.md).

---

## 4 · Implicação

1. **Nenhum envio real pode ser ativado.** Job 71 não pode ser ligado.
2. **Fila em `wa_outbox` não deve ser processada por worker.** Permanece `queued` (ou cancelada manualmente quando aplicável).
3. **Tentativas de reconnect Baileys são contraproducentes.** WhatsApp aprofunda o ban a cada nova conexão automatizada.
4. **Mesmo se um cron 89/90 enfileirar mensagens** (quando voltarem appointments futuros operacionais), nada sai do sistema sem worker.
5. **Canal Lara (5544995887773, Cloud Meta API)** continua online e pode ser usado pra comunicação manual ou processos diferentes · mas **regras "Confirmacao D-1" e "Chegou o Dia" não estão explicitamente roteadas pra esse canal**. Sem regra explícita de wa_number_id, o helper `_appt_professional_phone` resolve telefone do profissional (não do canal de envio) · a regra usa `subject_phone` do appointment. **Antes de ligar worker, decidir explicitamente qual `wa_number_id` é o sender de cada regra.**

---

## 5 · Gate absoluto (regra inegociável)

```
Worker 71 deve permanecer OFF até:
  (recuperação_ban_mih = true)
    OR (migração_cloud_meta_api = "complete")
    OR (canal_oficial_aprovado = true · com WABA + opt-in + templates aprovados)
    OR (decisão_humana_explícita_preflight_aprovado = true)

Nenhum worker / provider / call externo até esse gate passar.
```

---

## 6 · Rotas possíveis para desbloqueio

| Rota | Esforço | Reversibilidade | Notas |
|---|---|---|---|
| **A.** Recurso de desbanimento WhatsApp (consumer) | baixo (~30 min) · resultado em 24-72h | total | requer "Pedir revisão" no app + texto enxuto + comprovação de uso legítimo (clínica médica) |
| **B.** Migrar canal Secretaria → Cloud Meta API | médio (~1-3 dias) | parcial (precisa registro Meta) | Lara já roda nesse modelo · clínica precisa cadastrar número 5544991622986 (ou outro novo) em Meta Business Manager · Display Name aprovado · templates aprovados |
| **C.** Usar número alternativo + Cloud Meta API | médio (~2-5 dias) | total · não depende de desbanimento | comprar SIM novo · cadastrar Meta · operacional precisa mudar divulgação |
| **D.** Mover atendimento Secretaria pro número Lara (5544995887773) temporariamente | baixo · operacional | total | Lara continua atendendo Cloud Meta API · Luciana atende ali até resolução |

**Recomendação operacional:** rodar **A + D em paralelo** (recurso ao WhatsApp + ponte operacional via Lara). Se A não voltar em 7 dias, escalar para B ou C.

---

## 7 · Critérios mínimos antes de envio real

Lista de verificação para qualquer fase futura `2L.X` que considere ligar worker 71:

- [ ] Número de envio aprovado (sem banimento ativo)
- [ ] Provider definido (Cloud Meta API · NÃO Baileys)
- [ ] Canal de saída registrado em `wa_numbers` com `phone_number_id` + `access_token` + `business_account_id` válidos
- [ ] WABA / Display Name aprovado pela Meta
- [ ] Templates de confirmação aprovados pela Meta (ou janela 24h ativa)
- [ ] Opt-in / opt-out validado por paciente (LGPD)
- [ ] Rate limit do número conhecido (tier 1k/10k/100k mensagens/dia)
- [ ] Logs de delivery configurados (`wa_messages.delivered_at` / `read_at`)
- [ ] Fallback / rollback documentado (pause worker · cancel queued)
- [ ] Lista de destinatários de teste internos (telefones controlados pelo Alden)
- [ ] Job 71 **ainda OFF** durante todo o checklist
- [ ] Ativação progressiva (canário 1 → 10 → 100 destinatários) antes de full release
- [ ] Monitoramento em tempo real (`cron.job_run_details` + `wa_outbox.status` + `wa_messages` deltas)
- [ ] Recall plan: comando exato para pausar tudo se algo errado

---

## 8 · O que pode continuar em dry-mode (autorizado)

- ✅ Crons 89 + 90 (geração de fila futura)
- ✅ `wa_outbox` em `status='queued'` (acumula sem ser consumido)
- ✅ Alertas internos (notification center, task dashboard) — **CRM_PHASE_2G**
- ✅ UI / frontend agenda CRM — **CRM_PHASE_2H**
- ✅ Auditorias read-only adicionais
- ✅ Validações SQL read-only
- ✅ Migrations dry (PREP local, apply controlado em prep depois)
- ✅ Preparação Cloud Meta API: docs, planos, configuração WABA
- ✅ Templates: redação, revisão de placeholders (`{{nome}}`, `{{data}}`, etc)

---

## 9 · O que está proibido

- ❌ Ativar cron job 71 (`wa_outbox_worker_tick`)
- ❌ Executar `SELECT public._wa_outbox_tick()` manualmente
- ❌ Chamar Meta API / WhatsApp Cloud API com qualquer mensagem
- ❌ Chamar Evolution API com `/instance/connect/Mih` ou similar
- ❌ Tentativa de re-pareamento Baileys do Mih
- ❌ Criar cron novo cujo comando seja consumir `wa_outbox`
- ❌ Inserir mensagens fake em `wa_outbox` para "testar"
- ❌ Processar fila acumulada sem worker (via UPDATE manual de status='sent')

---

## 10 · Plano de preflight futuro (esqueleto)

Quando a rota de desbloqueio for tomada (A/B/C), seguir esta sequência:

```
2L.1 · Auditoria read-only do provider
  - wa_numbers schema vs Meta config
  - phone_number_id presente
  - access_token válido (test via GET /me · não envio)
  - WABA status

2L.2 · Confirmação de número
  - Display Name aprovado
  - Verified business

2L.3 · Templates
  - Confirmacao D-1 / Chegou o Dia · Meta-aprovados
  - Variables matching: {{nome}}, {{data}}, {{hora}}, {{profissional}}

2L.4 · Teste com destinatário interno
  - Lista hardcoded: telefones Alden + Luciana
  - 1 mensagem de cada template
  - Aguardar delivery receipt

2L.5 · Rollback rehearsed
  - `SELECT cron.alter_job(71, active := false)` testado
  - Pause + drain plan rehearsed

2L.6 · Canário 10 destinatários
  - Lista pequena de pacientes opt-in
  - 1 dia · monitor manual

2L.7 · Full release
  - Worker 71 ON 24h
  - Métricas: delivery_rate, opt-out, complaint
```

---

## 11 · Relação com fases

| Fase | Status | Bloqueada pelo ban? |
|---|---|---|
| 2F (tick fns + crons) | ✅ completa · dry-mode | Não |
| 2G (alertas internos secretária/Mirian) | pendente | Não · só interno |
| 2H (frontend state alignment) | pendente | Não · UI/UX |
| 2I (anamnese / consent) | pendente | Não |
| 2J (finalização enterprise) | pendente | Não |
| 2K (pós-consulta d_after) | pendente | Não (dry-mode segue worker OFF) |
| **2L (envio real)** | **BLOCKED** | **SIM** |
| 2M (worker activation plan) | bloqueado | SIM · depende de 2L |

---

## 12 · Rollback operacional documentado (NÃO EXECUTAR)

### Pause dos crons d_before / d_zero (se desejar parar geração de fila)
```sql
-- READ FIRST · NÃO EXECUTAR sem autorização explícita
SELECT cron.alter_job(89, active := false);  -- d_zero
SELECT cron.alter_job(90, active := false);  -- d_before
```

### Cancelar fila acumulada (se aparecer queue antiga após appointments voltarem)
```sql
-- READ FIRST · NÃO EXECUTAR sem autorização
SELECT count(*) FROM public.wa_outbox
 WHERE rule_id IN ('a9636e9e-56ac-4286-a1cc-faa52cb72548',
                   '4d8f841e-e320-4310-b732-36515c50f19b')
   AND status = 'queued';

UPDATE public.wa_outbox SET status='cancelled'
 WHERE rule_id IN ('a9636e9e-56ac-4286-a1cc-faa52cb72548',
                   '4d8f841e-e320-4310-b732-36515c50f19b')
   AND status = 'queued';
```

### Garantia do gate
```sql
-- READ-ONLY · executar sempre que houver dúvida
SELECT jobid, jobname, active FROM cron.job WHERE jobid = 71;
-- Esperado: active=false
```

**Worker 71 OFF é o gate principal.** Mesmo sem pause dos crons 89/90, zero envio acontece.

---

## 13 · Verdict do gate

> **`BLOCKED_CRM_PHASE_2L_WHATSAPP_REAL_SEND_NUMBER_BANNED`**

Enquanto o número de WhatsApp da Secretaria/Mih estiver banido ou sem canal oficial aprovado, qualquer envio real fica bloqueado. O job 71 deve permanecer OFF. Os crons 89/90 podem continuar em dry-mode gerando fila, mas a fila não pode ser processada por worker real. A liberação de envio exige uma fase separada de WhatsApp Real Send Readiness, com canal aprovado, opt-in, templates, provider definido, teste interno controlado e rollback.

---

## 14 · Histórico

- 2026-05-11 · Mig 157 / 158 / 159 aplicadas · isolation incident 2986 resolvido (Patch 1 + Mig 159)
- 2026-05-11 12:48 UTC · Evolution Mih `device_removed`
- 2026-05-12 ~04:30 BRT · tentativa re-pareamento Mih · 403 `rva` (ban confirmado)
- 2026-05-12 · Mig 160 aplicada (CRM_PHASE_2F.2 · `204d3a3`)
- 2026-05-12 · Crons 89 + 90 ativos (CRM_PHASE_2F.3 · `dbad1b0`)
- 2026-05-12 · Monitor primeira janela ainda NOT_YET_RUN (`c9257c4`)
- 2026-05-12 · Este gate doc criado · BLOCKED_CRM_PHASE_2L
