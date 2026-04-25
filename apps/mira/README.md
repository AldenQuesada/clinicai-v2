# @clinicai/mira

Assistente WhatsApp da Mira · B2B (parceiras) + admin (agenda, financeiro, pacientes).

**Porta:** 3006 (Lara é 3005)
**Domínio prod:** mira.miriandpaula.com.br

## Webhook

`POST /api/webhook/evolution` — recebe `messages.upsert` da Evolution API (instância `mira-mirian`).

Auth: header `apikey` ou `X-Evolution-Secret` (timing-safe compare contra `EVOLUTION_WEBHOOK_SECRET`).

## Cron

`GET /api/cron/mira-state-cleanup` — chamado pelo Easypanel cron a cada 10min, dispara cleanup de states expirados (RPC `mira_state_cleanup_expired`). Idempotente.

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

## Migrations

P0 introduz 5 migrations em `db/migrations/`:

- `20260800000001_clinicai_v2_mira_discriminators.sql` — `leads.source`, `wa_conversations.context_type`, `wa_messages.channel`
- `20260800000002_clinicai_v2_mira_state.sql` — `mira_conversation_state` + RPCs + cron cleanup
- `20260800000003_clinicai_v2_b2b_core.sql` — `b2b_partnerships`, `b2b_vouchers`, etc + auto-whitelist trigger
- `20260800000004_clinicai_v2_wa_pro_admin.sql` — `wa_pro_*` tables + RPCs admin
- `20260800000005_clinicai_v2_b2b_seeds.sql` — 13 templates + `mira_channels` rows

**Aplicação não é automática** · Alden roda via pooler antes do deploy.
