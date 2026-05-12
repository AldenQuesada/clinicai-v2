# CRM · Next Safe Prompt · After WhatsApp Ban Gate

> **Use este doc como ponto de partida para a próxima rodada Claude Code · todas as opções abaixo são SAFE enquanto o número de WhatsApp da Secretaria/Mih estiver banido.**

---

## Estado consolidado (resumo)

- HEAD esperado pós-`PASS_CRM_SAFE_ROUND_2F4_MONITORED_AND_2L_BAN_GATE_DOCUMENTED`: à frente de `c9257c4` (commit doc desta rodada).
- Worker 71 (`wa_outbox_worker_tick`): **OFF** (gate inegociável).
- Crons 89 (d_zero) + 90 (d_before): `active=true` (dry-mode).
- Mig 160 aplicada · tick fns existem.
- `wa_outbox` saudável · zero pending old · zero unsafe.
- Mih (5544991622986) **banido pelo WhatsApp** (403 rva).
- Lara (5544995887773) Cloud Meta API ativo · não é destinatário default das rules d_before/d_zero.
- Bloqueador formal documentado: [45-phase-2l-whatsapp-real-send-ban-gate.md](45-phase-2l-whatsapp-real-send-ban-gate.md).
- Validação read-only do gate: [sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql](sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql).

---

## Regras invioláveis para a próxima rodada

- **NÃO ativar job 71.**
- **NÃO enviar WhatsApp real.**
- **NÃO chamar Meta / Evolution / qualquer provider.**
- **NÃO executar tick fns manualmente.**
- **NÃO processar fila `wa_outbox`.**
- **NÃO tentar reparear Mih em Baileys** (aprofunda ban).
- **NÃO fazer migration sem prep doc + autorização.**
- **NÃO commitar TS/app code sem solicitação explícita.**

---

## Comandos seguros (rodáveis sem autorização adicional)

```bash
# Snapshot ambiente
git status --short
git rev-parse HEAD
git rev-parse origin/main
git log --oneline -10

# Re-rodar gate validation (read-only)
# Cole conteúdo de docs/crm-refactor/sql/phase-2l-whatsapp-real-send-ban-gate-validation.sql
# no SQL Editor do Supabase em modo read-only · ou via Management API SQL endpoint

# Audit DB read-only via Management API SQL endpoint
# (apenas SELECTs · nunca INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE)
```

---

## 3 opções autorizadas para próxima rodada

### Opção A · **CRM_PHASE_2G · Internal Alerts Secretaria/Mirian** (recomendada)

**Escopo:**
- Alerta interno "paciente não confirmou" (D-1 sem resposta inbound do paciente)
- Alerta interno "paciente chegou" (quando `chegada_em` é setado em `appointments`)
- Canal: dashboard `/secretaria` ou `/agenda` · notification badge + som · **zero WhatsApp**
- Preferir tabela `notifications` (se já existir) ou criar nova tabela `internal_alerts` se não houver
- Se usar `wa_outbox`, o **worker 71 OFF é o gate** · nada sai
- Trigger DB em `appointments` (AFTER UPDATE OF chegada_em) ou tick fn dedicada

**Por que recomendada:**
- Valor operacional imediato pra Luciana/Mirian sem depender de canal externo
- Não afetado pelo ban Mih
- Cobertura de 2 gaps P1 da auditoria 2E
- Pode usar a infra agenda alert que já existe (`_enqueue_agenda_alert` mas direcionado a tabela interna)

**Próximos passos:**
1. Auditoria das tabelas de notification existentes
2. Doc 47 com contratos
3. Mig PREP local (tick fn `_internal_alert_arrival_tick()` + `_internal_alert_unconfirmed_tick()`)
4. Smoke ROLLBACK
5. Apply controlado em fase 2G.2

### Opção B · **CRM_PHASE_2H · Frontend Agenda/CRM State Alignment**

**Escopo:**
- Remover hardcodes perigosos em `apps/lara/src/app/crm/agenda/[id]/page.tsx:90-101` (`canAttend`/`canFinalize`)
- Consumir `crm_operational_view` (criada em mig 150)
- Backend retornar `allowedActions` por appointment via RPC nova ou extensão de `appointment_change_status`
- UI/UX só renderiza · zero infer
- Zero mexer em envio · zero migration mutativa de dados

**Bom para:**
- Quando a parte de DB está estável (status atual)
- Sem dependência de canal de envio

**Próximos passos:**
1. Audit das 3 hardcodes existentes
2. Doc 47b com contratos UI
3. Patch local em `route.ts` + `page.tsx` + `_actions-bar.tsx`
4. Typechecks
5. Smoke manual no dashboard (Alden)
6. Commit + push

### Opção C · **CRM_PHASE_2L.1 · WhatsApp Cloud Meta / Ban Resolution Audit**

**Escopo:**
- READ-ONLY
- Auditar `wa_numbers` para inventário completo de providers (já fizemos parcialmente · agora detalhar)
- Verificar status WABA via Meta Business Suite (se houver acesso)
- Listar templates aprovados (se houver tabela `wa_templates`)
- Documentar plano de migração Mih → Cloud Meta API
- Documentar plano alternativo Mih → novo número
- Documentar plano operacional intermediário (atender via Lara 5544995887773)
- **Sem chamada Meta API · sem envio**
- Preparar checklist completo de readiness (item 7 do doc 45)

**Bom para:**
- Quando o ban está sendo trabalhado (recurso ao WhatsApp · ou decisão de migrar)
- Não bloqueia outras fases · pode rodar em paralelo a 2G ou 2H

---

## Escolha sugerida

**Recomendação ordenada (mais valor operacional primeiro):**

1. **2G** (alertas internos) · valor imediato pra clínica · zero dependência ban
2. **2H** (UI consistency) · paralelo a 2G se quiser duas frentes
3. **2L.1** (audit readiness) · iniciar quando recurso WhatsApp for enviado · 24-72h espera

**Não recomendado agora:**
- Ativar worker 71 sob qualquer pretexto
- Tentar reparear Mih em Baileys
- Avançar 2K (d_after pós-consulta) antes de fechar 2G
- Avançar 2M (worker activation plan) antes de fechar 2L

---

## Sinais de risco (parar e reportar imediatamente)

- `worker71_off` no SQL de validação retornar **false**
- Aparecer cron novo em `cron.job` com command que inclui `wa_outbox_tick`, `_send_`, ou similar
- `wa_outbox.status='queued'` antiga > 1h crescendo sem explicação
- `agenda_alerts_log` ganhando rows sem que cron 89/90 tenham rodado
- Aparecer trigger novo em `wa_outbox` com side-effect em `wa_messages` ou `wa_conversations`
- Mig nova aparecer em `supabase_migrations.schema_migrations` sem prep prévio

---

## Verdict alvo da próxima rodada (escolha conforme opção)

- **2G:** `PASS_CRM_PHASE_2G_INTERNAL_ALERTS_PREP_LOCAL_COMMIT`
- **2H:** `PASS_CRM_PHASE_2H_FRONTEND_STATE_ALIGNMENT_LOCAL_COMMIT`
- **2L.1:** `PASS_CRM_PHASE_2L1_BAN_RESOLUTION_AUDIT_READY`

Cada um sem apply ou deploy · só doc + prep · review humano antes de avançar para `.2` (apply controlado).
