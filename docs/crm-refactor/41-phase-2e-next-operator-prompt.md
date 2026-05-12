# CRM_PHASE_2E · Next Operator Prompt

> Use este prompt como ponto de partida da próxima rodada Claude Code · após review humano da auditoria 40-phase-2e-patient-journey-event-map-audit.md.

---

## Contexto curto

Auditoria CRM_PHASE_2E concluída em 2026-05-12. Banco saudável. Camada automation tem 8 trigger_types em `wa_agenda_automations` ativos mas órfãos (sem tick fn). Camada UI tem 3 anti-patterns documentados (hardcode status, view não consumida, soft-delete raw).

- HEAD esperado: `7d6c33a877346b7edaf1165f08accb6f592dc2d4` (ou descendente)
- Branch: `main`
- Working tree: pode ter `docs/incidents/` untracked
- Cron: job 12 ON, job 71 **OFF**, job 72 ON dry-mode
- wa_outbox: pending=0 · empty_content=0 · empty_phone=0 · missing_lead_id=0
- 14 RPCs CRM presentes · SECURITY DEFINER · grants OK
- crm_operational_view existe com 19 colunas (mig 150)

Doc principal: [40-phase-2e-patient-journey-event-map-audit.md](40-phase-2e-patient-journey-event-map-audit.md)
SQL audit: [sql/phase-2e-patient-journey-audit.sql](sql/phase-2e-patient-journey-audit.sql)

---

## Achados principais

1. **8 trigger_types órfãos** sem tick fn (P0): `d_before` (Confirmação D-1, Tarefa Confirmar Presença), `d_zero` (Chegou o Dia), `d_after` × 5 (Pós D+1/D+2/D+3, Tarefa Acompanhamento, NPS D+7), `on_finalize` × 1, `on_inbound_match` × 2, `on_recurrence_created` × 1.

2. **Frontend infere status** (P1): `apps/lara/src/app/crm/agenda/[id]/page.tsx:90-101` hardcoda `['na_clinica','em_consulta','em_atendimento','finalizado']` para decidir `canAttend`/`canFinalize`.

3. **`crm_operational_view` não consumida** (P1): zero grep hit em `apps/lara/src/`.

4. **`em_atendimento` e `em_consulta` são stubs** (P2): enum existe, calendar pinta cor, mas nenhum RPC seta.

5. **Anamnese sem UI/FK appointment/gate finalize** (P2).

6. **Consentimento sem signature/storage/gate** (P2).

7. **`lead_recovery_activate` existe sem trigger automático** (P1).

8. **Soft-delete appointment via raw UPDATE** (P2): `_actions-bar.tsx:245`.

9. **Sem alerta "paciente não confirmou"** (P1).

10. **Sem alerta "paciente chegou" pra Mirian** (P1).

Backlog ranqueado em seção 8 do doc 40.

---

## Blockers (precisa decisão antes)

- **Worker 71 (`wa_outbox_worker_tick`)** segue OFF intencionalmente até o Mih voltar do banimento e a migração para Cloud Meta API ser planejada. Não ligar.
- **Mih (5544991622986) banido pelo WhatsApp** desde 12/05 07:34 UTC · em recurso. Lara (5544995887773) é canal alternativo ativo.

---

## Próximos passos sugeridos (em ordem)

### Recomendação: começar pela Fase 2F · Appointment confirmation contracts

**Por quê:** mais valor operacional imediato (Confirmação D-1 + "Chegou o Dia") · menor patch (1 tick fn + 1 cron) · sem dependências externas · não toca código TS.

**Escopo Fase 2F:**

1. Criar Mig 160 prep com:
   - `_agenda_alert_d_before_tick()` (processa `trigger_type='d_before'`)
   - `_agenda_alert_d_zero_tick()` (processa `trigger_type='d_zero'`)
   - OU uma fn unificada `_agenda_alert_day_window_tick(p_window text)` que aceita `'d_before'`/`'d_zero'` como param
   - Cron job 73 + 74 (ou 1 job que chama ambas as fns)
   - Sanity DO block
   - NOTIFY pgrst reload
2. Validation SQL read-only
3. Rollback note
4. Prep doc
5. Apply controlado em fase 2F.2

**Importante:** estas tick fns SÓ enfileiram em `wa_outbox`. Como worker 71 está OFF, nada será enviado. Estado dry-mode preservado.

---

## Comandos seguros pra próxima rodada

```bash
# Snapshot ambiente
git status --short
git rev-parse HEAD
git rev-parse origin/main

# Re-rodar audit SQL (read-only)
node -e "fetch e cole o conteúdo de scripts/validation/ via Management API"
# OU rode manualmente os blocos de docs/crm-refactor/sql/phase-2e-patient-journey-audit.sql

# Confirmar gate seguro
# cron.job WHERE jobid=71 → active=false (esperado)
# wa_outbox WHERE status='queued' → 0 (esperado enquanto worker OFF)

# Iniciar fase 2F prep
# 1. Capturar def atual via Management API READ-ONLY (pg_get_functiondef)
# 2. Criar artefatos prep em working tree (forward SQL + down + rollback note + validation SQL + doc)
# 3. NÃO aplicar
# 4. Apresentar pra Alden review
```

---

## Comandos PROIBIDOS (não rodar sem autorização explícita)

- `supabase db push`
- `supabase migration repair --status applied <version>` (apenas após apply aprovado)
- `supabase functions deploy`
- `vercel deploy` / qualquer deploy
- `git push` (apenas após commit aprovado)
- `cron.alter_job(71, active := true)` ← **NUNCA sem autorização**
- `cron.alter_job(<n>, active := true)` para qualquer worker novo sem aprovação
- `INSERT`/`UPDATE`/`DELETE`/`ALTER`/`DROP`/`CREATE`/`TRUNCATE` em produção
- Qualquer chamada Meta/Evolution
- Qualquer endpoint que envie mensagem real

---

## Sinais de risco (parar e reportar imediatamente)

- `wa_outbox.status='queued'` com counts crescentes sem worker 71 ligado · indica path direto a provider
- Trigger novo em `wa_outbox` que UPDATE `wa_conversations` ou `wa_messages`
- Cron job apareceu novo com `wa_outbox_worker` no nome ou comando
- `phase_history` ganhou origem `auto_trigger_on_lost` (ou similar) — indica perda automática indevida
- `leads.phase='perdido'` aparecendo no banco (deveria ser 0)

---

## Verdict alvo da próxima rodada

`PASS_CRM_PHASE_2F_PREP_MIG160_READY` (com 5 artefatos forward + down + rollback note + validation SQL + prep doc · sem apply).

---

## Notas operacionais

- Lara em produção atende canal `5544995887773` (Cloud Meta API) · está saudável.
- Mih (5544991622986) está banido (Baileys / Evolution) · pendente decisão de migrar para Cloud Meta API · ver doc `docs/incidents/2026-05-11-secretaria-2986-isolation-audit.md`.
- Patches recentes commitados: `319953f` (Patch 1 TS scope Mih), `7d6c33a` (Mig 159 DB hardening), aplicados em prod.
- Job 72 está rodando dry-mode a cada minuto · status `succeeded` consistente · 0 inserts em outbox/log porque não há appointment elegível.
