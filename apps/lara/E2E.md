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

## Specs atuais

| Spec | Cobre | Auth | Hit DB? |
|------|-------|------|---------|
| `e2e/public-login.spec.ts` | `/login` renderiza form email + sem erros JS | Não | Não |
| `e2e/public-orcamento.spec.ts` | `/orcamento/<token-invalido>` retorna 404 | Não | Sim (service_role · null) |
| `e2e/auth-gate.spec.ts` | Middleware redireciona /crm, /crm/orcamentos, /crm/agenda, /conversas pra /login · preserva querystring | Não | Não |
| `e2e/visual-login.spec.ts` | Snapshot baseline visual de /login (skip ate baseline commited) | Não | Não |
| `e2e/authed/lead-to-orcamento.spec.ts` | **Happy path**: lead seed → criar orçamento → marcar enviado → aprovar | **Sim** | Sim (cria/deleta com is_e2e_test=true) |

## Happy path E2E · setup (CRM_E2E_AUTH_TOOLING_SETUP · 2026-05-17)

Decisão: usar **mesma clínica Mirian** com **isolamento via tag** `metadata.is_e2e_user=true` + `metadata.is_e2e_test=true` nas fixtures. Razão: single-tenant em prod (não há outra clínica); criar segundo projeto Supabase exigia migrar todas as 80+ migs. Trade-off é cleanup defensivo via spec.

### Passo 1 (você, 1 vez) · Criar test user via script real

```bash
pnpm --filter lara e2e:setup
```

Pré-req: `apps/lara/.env.local` precisa de:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (admin operations · NÃO commitar)

O script (`apps/lara/scripts/e2e-setup.mjs`):
1. Cria/reusa user `e2e-test@miriandpaula.com.br` no Supabase Auth (`email_confirm=true` · senha hex 32 chars se primeira execução)
2. UPSERT em `profiles` vinculando user à clínica Mirian (`00000000-0000-0000-0000-000000000001`) com `role='owner'`
3. Imprime 4 envs uma única vez (cole em GitHub Settings → Secrets → Actions)

**Idempotente** — se user já existe, reusa. Senha só é impressa se foi gerada/reset.

**Reset de senha:** rode com `E2E_TEST_PASSWORD=<nova-senha> pnpm --filter lara e2e:setup`.

### Passo 2 (você, 1 vez) · Adicionar 4 secrets no GitHub

Settings → Secrets and variables → Actions → New repository secret:

```
TEST_SUPABASE_URL          (https://oqboitkpcvuaudouwvkl.supabase.co)
TEST_SUPABASE_ANON_KEY     (output do e2e:setup)
TEST_USER_EMAIL_OWNER      (e2e-test@miriandpaula.com.br)
TEST_USER_PASSWORD         (output do e2e:setup · senha gerada)
```

### Passo 3 · Pronto

Workflow `.github/workflows/lara-e2e.yml` (manual via `workflow_dispatch`) roda Playwright autenticado contra prod URL. Specs `e2e/authed/*` têm `test.skip(!HAS_TEST_ENVS)` se as 4 envs faltarem.

### Cleanup

Cada spec autenticado:
1. Cria fixtures com `metadata.is_e2e_test=true` + nomes prefixados `[E2E_TEST]`
2. Faz cleanup explícito em `afterAll()` (delete por id)
3. Cleanup defensivo opcional via script futuro (não implementado nesta rodada)

Manual: deletar via Supabase Studio se houver vazamento.

### Adicionar mais specs autenticados

```typescript
// e2e/authed/<nome>.spec.ts
import { test, expect, getAuthedSupabase } from '../_fixtures/auth'

test.use({ authedAs: 'owner' })

test('meu cenario', async ({ page }) => {
  // page já vem com session do test user
  await page.goto('/crm/...')
  // ...
})
```

Cenários prioritários ainda pendentes (12d):
- `agenda-flow.spec.ts`: criar appt → confirmar → atender → finalizar wizard 3 outcomes

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
