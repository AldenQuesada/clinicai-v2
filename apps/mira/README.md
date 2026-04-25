# @clinicai/mira

Assistente WhatsApp da Mira · B2B (parceiras) + admin (agenda, financeiro, pacientes).

**Porta:** 3006 (Lara é 3005)
**Domínio prod:** mira.miriandpaula.com.br

## Webhook

`POST /api/webhook/evolution` — recebe `messages.upsert` da Evolution API (instância `mira-mirian`).

Auth: header `apikey` ou `X-Evolution-Secret` (timing-safe compare contra `EVOLUTION_WEBHOOK_SECRET`).

## Cron

Todos os endpoints aceitam `GET` com header `x-cron-secret: <MIRA_CRON_SECRET>` (timing-safe). Service role bypassa RLS, multi-tenant resolvido via RPC `_default_clinic_id()`.

| Endpoint | Schedule (cron) | Função |
|---|---|---|
| `/api/cron/mira-state-cleanup` | `* * * * *` (a cada 1min) | cleanup states expirados + dispara reminders |
| `/api/cron/mira-state-reminder-check` | `* * * * *` (alternativa) | só dispara reminders (sem cleanup) |
| `/api/cron/mira-daily-digest` | `0 10 * * 1-6` (10:00 seg-sáb) | agenda do dia + tarefas pendentes |
| `/api/cron/mira-evening-digest` | `0 23 * * 1-6` (23:00 seg-sáb) | resumo do dia + agenda amanhã |
| `/api/cron/mira-weekly-roundup` | `0 10 * * 1` (seg 10:00) | semana anterior + plano semana |
| `/api/cron/mira-preconsult-alerts` | `*/5 11-23 * * 1-6` (5min · 11-23h seg-sáb) | alerta admin 30min antes appt |
| `/api/cron/mira-anomaly-check` | `0 1 * * *` (01:00 diário) | gaps operacionais (zero agenda, NaN finance) |
| `/api/cron/mira-birthday-alerts` | `0 10 * * *` (10:00 diário) | aniversariantes do dia |
| `/api/cron/mira-task-reminders` | `*/5 * * * *` (a cada 5min) | tarefas vencidas |
| `/api/cron/mira-followup-suggestions` | `0 12 * * *` (12:00 diário) | suggestions Claude Haiku pra leads esquecidos |
| `/api/cron/mira-inactivity-radar` | `0 21 * * 5` (sex 21:00) | pacientes/leads sem atividade 30+d |

Cada endpoint tenta a RPC `wa_pro_<name>` em prod primeiro; quando ausente, faz fallback minimalista (counts simples) ou pula dispatch. Veja TODO P2 nos handlers — extrair lógica pra RPCs canônicas.

Configuração no Easypanel: criar 11 cron jobs com URL `https://mira.miriandpaula.com.br/<endpoint>` + header `x-cron-secret: $MIRA_CRON_SECRET`.

## Env vars (Easypanel)

| Var | Descrição |
|---|---|
| `EVOLUTION_API_URL` | Base URL da Evolution (ex: `https://evolution.aldenquesada.site`) |
| `EVOLUTION_API_KEY` | API key globalmente do cluster Evolution |
| `EVOLUTION_INSTANCE_MIRA` | Instância da Mira (ex: `mira-mirian`) |
| `EVOLUTION_INSTANCE_MIH` | Instância de dispatch p/ recipient (ex: `Mih`) |
| `EVOLUTION_WEBHOOK_SECRET` | Shared secret p/ validar webhook entrante |
| `ANTHROPIC_API_KEY` | Claude (intent classifier Tier 2 · Haiku) |
| `ANTHROPIC_MODEL` | (opcional) `claude-haiku-4-5-20251001` default |
| `GROQ_API_KEY` | Whisper-large-v3 transcription |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | service role (BYPASSA RLS · so server) |
| `NEXT_PUBLIC_APP_URL` | `https://mira.miriandpaula.com.br` |
| `MIRA_CRON_SECRET` | shared secret p/ proteger /api/cron/* |

## Build local

```bash
cd Documents/clinicai-v2
pnpm.cmd install
pnpm.cmd --filter @clinicai/mira typecheck
pnpm.cmd --filter @clinicai/mira build
pnpm.cmd start:mira
```

## Tests

Vitest configurado no monorepo. Testes rodam offline (mocks pra Supabase / Anthropic / Slack / Sentry · zero hit em prod).

```bash
# Mira app · 48 testes (bulk-list-parser, intent-classifier, alerts)
pnpm --filter @clinicai/mira test

# Watch mode (dev local)
pnpm --filter @clinicai/mira test:watch

# Repositories · 26 testes (idempotency + retry policy)
pnpm --filter @clinicai/repositories test

# Supabase · 10 testes (resolveClinicContext + cache)
pnpm --filter @clinicai/supabase test

# Roda tudo via turbo
pnpm test
```

Cobertura mira nas Waves 1-3 fixes do incidente 26 vouchers (2026-04-25):

| Test file | Cobertura |
|---|---|
| `apps/mira/src/lib/webhook/bulk-list-parser.test.ts` | 3 formatos bulk + edge cases + dedup + scheduleHint |
| `apps/mira/src/lib/webhook/intent-classifier.test.ts` | Tier 1 regex + Tier 2 fallback Anthropic mockado |
| `apps/mira/src/lib/alerts.test.ts` | Sentry tags/extras, Slack payload, alertCritical |
| `packages/repositories/src/voucher-dispatch-queue.repository.test.ts` | enqueue / pickPending / complete / markDedupHit / resetStuck / fail (zumbi guards) |
| `packages/repositories/src/b2b-voucher.repository.test.ts` | issueWithDedup retry policy (SQLSTATE 40001 + backoff 100/300/700ms) |
| `packages/supabase/src/tenant.test.ts` | resolveClinicContext (JWT claim + RPC fallback + cache + warning unico) |

### Coverage report

```bash
pnpm --filter @clinicai/mira test -- --coverage
# HTML: apps/mira/coverage/index.html
```

## Migrations

P0 introduz 5 migrations em `db/migrations/`:

- `20260800000001_clinicai_v2_mira_discriminators.sql` — `leads.source`, `wa_conversations.context_type`, `wa_messages.channel`
- `20260800000002_clinicai_v2_mira_state.sql` — `mira_conversation_state` + RPCs + cron cleanup
- `20260800000003_clinicai_v2_b2b_core.sql` — `b2b_partnerships`, `b2b_vouchers`, etc + auto-whitelist trigger
- `20260800000004_clinicai_v2_wa_pro_admin.sql` — `wa_pro_*` tables + RPCs admin
- `20260800000005_clinicai_v2_b2b_seeds.sql` — 13 templates + `mira_channels` rows

**Aplicação não é automática** · Alden roda via pooler antes do deploy.
