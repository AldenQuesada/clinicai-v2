# Lara · E2E (Playwright) + Sentry

Camada 11b foundation · 2026-04-29.

## Como rodar E2E local

```bash
# 1. instalar browser uma vez
pnpm -F @clinicai/lara exec playwright install --with-deps chromium

# 2. terminal 1: build + start lara
pnpm -F @clinicai/lara build
pnpm -F @clinicai/lara start
# (aguardar "ready" em localhost:3005)

# 3. terminal 2: rodar specs
pnpm -F @clinicai/lara e2e

# UI mode (interativo · debugar specs)
pnpm -F @clinicai/lara e2e:ui
```

## Specs atuais (2 · todos publicos)

| Spec | Cobre | Hit DB? |
|------|-------|---------|
| `e2e/public-login.spec.ts` | `/login` renderiza form email + sem erros JS | Não |
| `e2e/public-orcamento.spec.ts` | `/orcamento/<token-invalido>` retorna 404 | Sim (service_role lookup, mas resultado é null → notFound()) |

## Como expandir pra auth (Camada 11c · pendente)

Padrão recomendado · global setup que stub Supabase session via cookie/storage:

1. Criar `apps/lara/e2e/_fixtures/auth.ts` com helper `loginAs(role)` que injeta cookie de sessão Supabase (precisa de service_role pra criar sessão fake)
2. Test fixture estendendo `test` base com auto-login antes de cada spec autenticado
3. Specs auth-only em `apps/lara/e2e/authed/*.spec.ts`

Cenários prioritários quando expandir:
- Lead → criar orçamento → marcar enviado → marcar aprovado
- Agenda criar → confirmar → atender → finalizar (3 outcomes wizard)

## CI

Workflow: `.github/workflows/lara-e2e.yml` · roda contra deploy de preview ou staging via `LARA_E2E_URL` env (variable de repo).

`continue-on-error: true` no início (E2E flaky no setup). Quando estável (5 runs verdes seguidas), remover flag pra bloquear PR em fail.

Browsers cacheados via `actions/cache@v4` key=`playwright-{os}-{hash(package.json)}` · primeiro run baixa ~250MB, próximos hits cache.

## Sentry

`@sentry/nextjs ^10.51.0` configurado em 11a · 4 configs (client/server/edge/instrumentation) com fail-soft sem DSN.

### Ativar em prod

1. Criar projeto no https://sentry.io · obter DSN
2. Easypanel · adicionar env vars no service `lara`:
   - `SENTRY_DSN` (server/edge)
   - `NEXT_PUBLIC_SENTRY_DSN` (client · pode ser o mesmo DSN)
   - `SENTRY_ENV=production` (opcional · default = NODE_ENV)
3. Restart service · log `[sentry] SENTRY_DSN ausente · Sentry desabilitado` deve sumir

### beforeSend filter (Camada 11b)

Adicionado em `sentry.server.config.ts` pra eliminar ruído:
- `NEXT_NOT_FOUND` / `NEXT_REDIRECT` (controle de fluxo do Next)
- `AbortError` (cliente fechou conexão)
- `PGRST116` (Postgres "no rows" · já tratado como null)
- Result<T,E>.fail com codes `forbidden`/`invalid_input`/`not_found` (validação normal, não bug)

### Alertas Slack/email

Configurar no Sentry UI (não em código):
1. Settings → Alerts → New Alert Rule
2. Condition: "An issue is first seen" + "Number of events > 5 in 5 min"
3. Action: Send notification to Slack (integration nativa) ou email

Recomendação inicial:
- 1 alerta crítico: erro novo em prod (notify imediato)
- 1 alerta volume: > 50 eventos/h (degradação)

## Diferido pra Camada 11c

- Auth fixtures + specs autenticados (lead → orcamento → approve · agenda flow)
- Visual regression (Playwright screenshot diff)
- Performance budget (Lighthouse CI integration)
- Coverage threshold em CI (hoje: nenhum gate)
