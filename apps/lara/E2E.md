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

## Specs atuais (4 · todos sem auth real)

| Spec | Cobre | Hit DB? |
|------|-------|---------|
| `e2e/public-login.spec.ts` | `/login` renderiza form email + sem erros JS | Não |
| `e2e/public-orcamento.spec.ts` | `/orcamento/<token-invalido>` retorna 404 | Sim (service_role lookup, mas resultado é null → notFound()) |
| `e2e/auth-gate.spec.ts` | Middleware redireciona `/crm`, `/crm/orcamentos`, `/crm/agenda`, `/conversas` pra `/login` quando sem cookie · preserva querystring | Não |
| `e2e/visual-login.spec.ts` | Snapshot baseline visual de `/login` desktop 1280x720 (maxDiff 2%) | Não |

## Happy path E2E (Camada 11d · pendente)

`apps/lara/e2e/_fixtures/auth.ts` tem o **esqueleto pronto** com API `test.use({ authedAs: 'owner' })`. Hoje o stub falha com mensagem clara apontando aqui. Pra completar:

### Passo 1 · Criar projeto Supabase de test

Conta Supabase free tier · projeto separado de prod. Razão: happy path E2E faz writes (cria leads, orçamentos, appointments) e não pode poluir prod.

### Passo 2 · Setar env vars (GitHub repo + local)

```
TEST_SUPABASE_URL=https://<test-project>.supabase.co
TEST_SUPABASE_ANON_KEY=eyJhbGc...
TEST_USER_EMAIL_OWNER=test-owner@miriandpaula.com.br
TEST_USER_PASSWORD=<gerar-via-openssl>
```

GitHub: Settings → Secrets and variables → Actions → New secret.
Local: `.env.test` (gitignored) ou `direnv`.

### Passo 3 · Implementar `loginAs` em `_fixtures/auth.ts`

Substituir `_stubLogin` por:

```typescript
import { createBrowserClient } from '@clinicai/supabase'

async function loginAs(page: Page, role: AuthRole): Promise<void> {
  const env = assertTestEnvs()
  const sb = createBrowserClient(env.url, env.anonKey)
  const { data, error } = await sb.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  })
  if (error) throw new Error(`[e2e/auth] login failed · ${error.message}`)

  // Inject cookies que Supabase SSR espera (formato sb-<project-ref>-auth-token)
  const projectRef = new URL(env.url).hostname.split('.')[0]
  await page.context().addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: JSON.stringify([data.session!.access_token, data.session!.refresh_token]),
      domain: 'localhost', // ou .miriandpaula.com.br em prod-like
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ])
}
```

### Passo 4 · Seed script (`e2e/_fixtures/seed.ts`)

Inserir no test project (via service_role):
- 1 clínica de test
- 1 user owner
- 3-5 leads em estados conhecidos (novo, qualificado, perdido)
- 1-2 orçamentos (draft, sent)
- 1-2 appointments (agendado, finalizado)

Limpar com `truncate cascade` antes de cada run global setup.

### Passo 5 · Specs auth-only em `e2e/authed/`

Cenários prioritários:

**`e2e/authed/lead-to-orcamento.spec.ts`**
1. Login owner
2. `/crm/leads` → click no primeiro lead "novo"
3. Click "Criar orçamento" → form
4. Preencher items (1 procedimento, R$ 200) + validade 30d
5. Submit → redirect `/crm/orcamentos/<id>`
6. Click "Marcar enviado" → status muda
7. Click "Marcar aprovado" → modal confirmação → confirm
8. Assert: badge mostra "Aprovado" + lead source orig agora desativado

**`e2e/authed/agenda-flow.spec.ts`**
1. Login owner
2. `/crm/agenda/novo` → form com lead pré-selecionado
3. Preencher data/hora/duração
4. Submit → redirect `/crm/agenda/<id>`
5. ActionsBar: "Marcar chegada" → status `na_clinica`
6. "Finalizar" → wizard 3 outcomes
7. Selecionar "Paciente" → form datos clínicos → submit
8. Assert: status `finalizado` + paciente promovido (verificar via `/crm/pacientes`)

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
