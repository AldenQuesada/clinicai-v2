# clinicai-v2 · context map (Next.js 16 monorepo)

> **Regra inviolável:** ANTES de qualquer Read em arquivo deste monorepo, consultar o grafo. Reler arquivo bruto = desperdício de tokens quando o grafo já tem a resposta.

## Fluxo obrigatório por pergunta

1. **Primeiro:** consultar [graphify-out/wiki/index.md](graphify-out/wiki/index.md) — entrypoint navegável (378 páginas)
2. **Segundo:** rodar `graphify query "sua pergunta"` da raiz `clinicai-v2/`
3. **Terceiro:** seguir links `[[Page]]` até node certo
4. **Só então** Read no arquivo bruto, e SÓ se o grafo não tiver a resposta ou Alden disser explicitamente "leia o arquivo X"

## Stack canônica (inegociável)

- **Runtime:** Next.js 16 + React 19 + TypeScript + Tailwind 4
- **Monorepo:** pnpm workspaces + Turbo · `apps/` + `packages/`
- **DB:** Supabase Postgres · multi-tenant ADR-028 via `app_clinic_id()` JWT · RLS em todas tabelas · RPC SECURITY DEFINER pra mutações cross-clinic
- **WhatsApp:** Cloud Meta API (Lara) + Evolution Baileys (Mih/Mira) · webhook routes em `apps/lara/src/app/api/webhook/`

## Estrutura do monorepo

```
apps/
  lara/            ← Next.js · webhook + inbox UI + secretaria + dra · 514 files
  dashboard/       ← Next.js · dashboard nova
  flipbook/        ← Next.js · biblioteca digital
  mira/            ← Next.js · módulo Mira voz
  mira-cron/       ← background jobs Mira
packages/
  repositories/    ← repo classes (LeadRepo, AppointmentRepo, B2BPartnershipRepo...) · 263 files
  whatsapp/        ← Cloud + Evolution adapters · 5 files
  ai/              ← Claude calls + prompts · 5 files
  supabase/        ← typed client factory · 9 files
  utils/           ← shared utils · 8 files
  ui/              ← shared UI primitives · 14 files
  logger/          ← structured logger · 1 file
  tsconfig/        ← shared TS configs
db/                ← migrations (mas as canônicas estão em supabase/migrations/ do clinic-dashboard repo legacy)
```

## God nodes do projeto (top 15 do grafo)

| Edges | Node | Significado |
|---|---|---|
| 156 | `loadServerReposContext()` | Server-side context loader · pattern central |
| 36 | `LeadRepository` | Repo principal · canônico do REFACTOR_LEAD_MODEL |
| 36 | `zodFail()` | Helper validação Zod |
| 28 | `B2BPartnershipRepository` | Módulo B2B core |
| 27 | `makeRepos()` | DI factory · cria todos os repos |
| 22 | `AppointmentRepository` | Agenda |
| 22 | `B2BVoucherRepository` | Vouchers B2B |
| 22 | `OrcamentoRepository` | Orçamentos |
| 21 | `ConversationRepository` | Conversas WhatsApp |
| 20 | `B2BCommTemplateRepository` | Templates comunicação B2B |
| 18 | `UsersRepository` | Usuários multi-tenant |
| 17 | `MessageRepository` | Mensagens · `saveOutbound` com dedup cross-channel |
| 16 | `WaNumberRepository` | wa_numbers map · canal/transport |
| 16 | `can()` | Permission gate (RBAC) |
| 15 | `processInboundMessage()` | Webhook entry · processa cada inbound |

## Quick links — entry points por domínio

**Lara (apps/lara/src/):**
- `app/api/webhook/whatsapp/route.ts` — Cloud Meta webhook (HMAC-validated, processInboundMessage)
- `app/api/webhook/whatsapp-evolution/route.ts` — Evolution Mih webhook (LID-aware)
- `app/(authed)/conversas/` — inbox UI principal
- `app/(authed)/secretaria/` — 6 KPIs + dra-pending mirror
- `app/(authed)/dra/perguntas/` — mirror read-only Dra Mirian
- `app/api/diag/simulate-inbound/route.ts` — diag E2E bypass signature
- `app/api/secretaria/dra-pending/route.ts` — count + IDs de pending questions
- `services/` — orchestration · `prompt/` — Claude prompts · `lib/` — shared

**Repositories (packages/repositories/src/):**
- `message.repository.ts` — saveOutbound + cross-channel dedup (5s window) + countInboundSince
- `conversation.repository.ts` — wa_conversations · UNIQUE per-channel
- `lead.repository.ts` — REFACTOR_LEAD_MODEL canonical
- `appointment.repository.ts` — agenda CRUD
- `b2b-partnership.repository.ts` + `b2b-voucher.repository.ts` — módulo B2B
- `wa-number.repository.ts` — canais (Lara/Mih/Mira)

## Workflow padrão

- **Sempre push após commit** — sem perguntar, sem adiar
- **Mudou edge function/worker?** Deploy automático sem pedir
- **Migration nova?** LER `~/.claude/projects/.../memory/reference_security_checklist.md` ANTES (evita débitos clinic_id literal, GRANT anon, tokens fracos)
- **Trabalhar no Lara webhook ou conversation routing?** LER memória `project_lara_paralelo_canais_2026_05_04.md` (mig 109 estado canônico)
- **Trabalhar em leads/patients/orcamentos/perdidos/appointments/phase_history?** LER `~/.claude/projects/.../memory/reference_refactor_lead_model.md` PRIMEIRO

## Migrations

Migrations vivem no clinic-dashboard repo (`Documents/clinic-dashboard/supabase/migrations/`), NÃO neste repo. O grafo do clinic-dashboard cobre 646 SQLs. Quando precisar de "qual migration adicionou X", consultar grafo de lá.

## Quando o grafo não souber

- `apps/lara/` tem AST mas NÃO tem semantic layer ainda — perguntas tipo "por que X foi feito assim?" exigem Read no arquivo
- `apps/dashboard/`, `apps/flipbook/`, `apps/mira/` NÃO foram extraídas — só Lara + packages
- Edge functions Supabase (`supabase/functions/`) não estão no grafo

Se grafo retornar vazio:
1. Roda `graphify add <subdir>` ou re-extrai aquele subdir específico
2. Avisa: "grafo não tem · vou atualizar e responder"
3. Só então Read seletivo

## Memórias que sempre se aplicam aqui

Carregadas via `~/.claude/CLAUDE.md` global · não precisa re-ler. Os feedback memories que mais batem neste repo:
- Trabalhar passo a passo · sempre push após commit · nunca propor adiar
- Audit profundo = varredura da CLASSE inteira (não fix pontual)
- Checar MEU código antes de blame externo (Evolution/Easypanel/cache)
- Event/template/dispatch → 3 peças no MESMO commit (nunca separar)
- Template DB é contrato canônico (código USA o template, hardcoded só fallback)
- Stack inegociável · Next.js 16 (NÃO regredir pra vanilla)
