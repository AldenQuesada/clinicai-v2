# CRM · Next Prompt After 2L.2 entregue

> Round: 2L.2 entregou foundation canary (Mig 168 + edge dry-run · zero envio real).

---

## Estado consolidado pós-2L.2

- HEAD esperado: commit local `feat(crm): add cloud meta canary preflight`
- Migs 156–166 + 167 + **168** aplicadas
- Edge function `wa-canary-send` commitada no repo (NÃO deployada)
- `wa_message_templates` ganhou 6 colunas mirror Meta approval (todas NULL/unknown · admin precisa popular)
- `wa_cloud_meta_canary_attempts` audit table criada (RLS · masking · imutável)
- Worker 71 OFF preservado · ban gate 2L intacto
- Zero envio real · zero chamada Graph API

## Regras invioláveis

- NÃO ativar job 71
- NÃO enviar WhatsApp/Evolution/Meta sem autorização explícita
- NÃO processar wa_outbox
- NÃO setar `WA_CANARY_REAL_SEND_ENABLED=true` sem autorização
- NÃO migration sem prep + smoke

---

## Opções vertical · escolher 1

### Opção A · CRM_PHASE_2L.3 · Internal Cloud Meta Canary Send (REAL · requer autorização)

**Por quê:** entrega o teste real de Cloud Meta · 1 mensagem para 1 destinatário interno (Alden/dev) · valida o pipeline end-to-end.

**Pré-requisitos obrigatórios (checklist 2L.2 seção 14):**
1. ✅ Mig 168 aplicada
2. ✅ Edge function commitada
3. ⏳ Edge function **deployed** (`supabase functions deploy wa-canary-send`)
4. ⏳ `WA_CANARY_INTERNAL_SECRET` configurada (Supabase dashboard · Functions secrets)
5. ⏳ `WA_CANARY_ALLOWED_RECIPIENTS=<E164_alden>` configurada (apenas 1 número interno)
6. ⏳ `WA_CANARY_REAL_SEND_ENABLED=true` configurada (gate final)
7. ⏳ **Pelo menos 1 template `meta_approval_status='approved'` populado no DB** após conferência Meta Business Manager
8. ⏳ **Autorização explícita do usuário** para envio canary
9. ⏳ Monitoramento `delivered_at`/`read_at` via webhook setup
10. ⏳ Kill switch documentado em `docs/runbooks/`

**Escopo da fase 2L.3:**
- Validação dos 10 pré-requisitos (script SQL + checklist)
- 1 invocação edge com `dry_run=false` + `canary_reason="2L.3 internal canary"`
- Aguardar receipt `delivered_at` (até 60s via polling de `wa_messages` ou webhook log)
- Validar audit row em `wa_cloud_meta_canary_attempts` com `status='sent'` ou `delivered`
- Documentar resultado · success/failure + provider_message_id
- **Não repetir automaticamente** se delivered não vier · investigação manual
- Rollback: kill switch (remover env) + audit

**Verdict alvo:** `PASS_CRM_PHASE_2L3_INTERNAL_CANARY_DELIVERED`

### Opção B · CRM_PHASE_2J.1 · Lead lost dedicado (paralelizável · zero WhatsApp)

**Escopo:**
- UI: botão "Marcar como perdido" no card do lead em `/crm/leads/[id]`
- Schema TS `MarkLeadLostInput` (lead_id + reason min 5 chars)
- Action `markLeadLostAction` wrapper de `lead_lost` RPC
- Repository method `LeadRepository.markLost`
- Smoke ROLLBACK + doc

**Verdict alvo:** `PASS_CRM_PHASE_2J1_LEAD_LOST_DEDICATED_READY`

### Opção C · CRM_PHASE_2H.1 · Cleanup zumbis status (paralelizável · zero WhatsApp)

**Escopo:**
- READ-ONLY scan: `rg "em_consulta|pre_consulta|compareceu|reagendado"` em apps/ packages/
- Remover do TS state machine + enum + APPOINTMENT_STATUS_LABELS + APPOINTMENT_STATUS_COLORS
- Manter migs antigas (histórico) com comentário
- Doc mapping legacy → canônico

**Verdict alvo:** `PASS_CRM_PHASE_2H1_STATUS_ZOMBIE_CLEANUP_READY`

### Opção D · CRM_PHASE_2AUX · Modal agendamento completo (paralelizável · zero WhatsApp)

**Escopo:**
- Wizard rich em `/crm/agenda/novo` (3 telas: subject → tempo → procedimento)
- Search/select de lead OU patient
- Validação de conflito client-side
- Smoke + doc

**Verdict alvo:** `PASS_CRM_PHASE_2AUX_SCHEDULE_WIZARD_READY`

### Opção E · CRM_PHASE_2L.2.1 · Popular template approval

**Por quê:** sem nenhum template approved, 2L.3 está bloqueada. Esta sub-fase é pequena (não precisa migration · só UPDATE manual + doc).

**Escopo:**
- Doc com checklist para conferência Meta Business Manager
- SQL helper para preencher `meta_approval_status` + `meta_template_name` + `meta_language`
- Validation SQL para confirmar pelo menos 1 approved
- Sem código novo · sem mig

**Verdict alvo:** `PASS_CRM_PHASE_2L21_TEMPLATE_APPROVAL_POPULATED`

---

## Recomendação ordenada

1. **2L.2.1** · popular template approval (15min · sem migration) — destrava 2L.3
2. **2L.3** · canary real send (após 2L.2.1 + autorização)
3. **2J.1** · lead_lost dedicado (paralelizável durante template approval)
4. **2H.1** · cleanup zumbi (paralelizável)
5. **2AUX** · wizard agendamento (paralelizável)

Paralelizáveis (B, C, D) podem rodar em paralelo com A/E porque não tocam pipeline WhatsApp.

---

## Comandos seguros

```bash
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Validar 2L.2 foundation
# Rodar docs/crm-refactor/sql/phase-2l2-cloud-meta-canary-preflight-validation.sql

# Conferir audit table imutabilidade
SELECT count(*) FROM public.wa_cloud_meta_canary_attempts;  -- 0 esperado pos rollback smoke
```

## Comandos PROIBIDOS

- `cron.alter_job(71, active := true)` (sem checklist seção 14 do doc 68)
- `supabase functions deploy wa-canary-send` (sem autorização)
- Setar `WA_CANARY_REAL_SEND_ENABLED=true` sem autorização
- UPDATE direto `meta_approval_status='approved'` sem conferência Meta Business Manager
- `git push --force`

---

## Sinais de risco (parar e reportar)

- `wa_cloud_meta_canary_attempts.status='sent'` sem autorização documentada
- Edge `wa-canary-send` deployada sem revisão
- Worker 71 ON
- Template marcado approved sem `meta_approval_checked_at` populado
- Allowlist com número de paciente real (não interno)

---

## Sequência sugerida pra próxima rodada

1. Push docs 2L.2 (após autorização)
2. Decisão: 2L.2.1 · 2L.3 · 2J.1 · 2H.1 · 2AUX
3. Se 2L.3: confirmar checklist 14 do doc 68 completo
4. Executar prompt da fase escolhida
