/**
 * E2E auth fixture · Camada 11d (real implementation).
 *
 * Login via Supabase Auth signInWithPassword + injecao de cookie SSR
 * compativel com o middleware Lara (createMiddlewareClient @supabase/ssr).
 *
 * Setup necessario · ver E2E.md secao 'Happy path E2E':
 *   1. Rodar `pnpm e2e:setup` 1x · cria test user no Supabase Auth +
 *      vincula a clinic_members com role owner
 *   2. Setar 4 env vars (GitHub Secrets + local .env.test ou direnv):
 *      TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY,
 *      TEST_USER_EMAIL_OWNER, TEST_USER_PASSWORD
 *
 * Uso em specs:
 *   import { test, expect } from './_fixtures/auth'
 *   test.use({ authedAs: 'owner' })
 *   test('cria orcamento', async ({ page }) => { ... })
 *
 * Cleanup automatico: a fixture nao limpa data criada pelo spec ·
 * cada spec deve usar test.afterAll() chamando supabase delete por id, OU
 * rodar `pnpm e2e:cleanup` apos a suite. Tudo criado por specs deve
 * ter `metadata.is_e2e_test=true` · cleanup script filtra por essa tag.
 */
import { test as base, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type AuthRole = 'owner' | 'admin' | 'receptionist' | 'therapist' | 'unauth'

interface AuthFixtures {
  authedAs: AuthRole
}

interface TestEnv {
  url: string
  anonKey: string
  email: string
  password: string
  projectRef: string
}

function assertTestEnvs(): TestEnv {
  const url = process.env.TEST_SUPABASE_URL
  const anonKey = process.env.TEST_SUPABASE_ANON_KEY
  const email = process.env.TEST_USER_EMAIL_OWNER
  const password = process.env.TEST_USER_PASSWORD

  const missing: string[] = []
  if (!url) missing.push('TEST_SUPABASE_URL')
  if (!anonKey) missing.push('TEST_SUPABASE_ANON_KEY')
  if (!email) missing.push('TEST_USER_EMAIL_OWNER')
  if (!password) missing.push('TEST_USER_PASSWORD')

  if (missing.length > 0) {
    throw new Error(
      `[e2e/auth] Missing env vars · ${missing.join(', ')}.\n` +
        `Setup necessario · ver apps/lara/E2E.md secao 'Happy path E2E'.`,
    )
  }

  // Project ref vem do hostname · sb-<ref>-auth-token cookie usa esse formato
  const projectRef = new URL(url!).hostname.split('.')[0]

  return { url: url!, anonKey: anonKey!, email: email!, password: password!, projectRef }
}

let _client: SupabaseClient | null = null
function getTestClient(env: TestEnv): SupabaseClient {
  if (_client) return _client
  _client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

/**
 * Faz login via Supabase Auth · injeta cookie SSR no contexto da page.
 *
 * Cookie format: `sb-<project-ref>-auth-token` com JSON encoded array
 * (formato @supabase/ssr canonical · middleware Lara le isso).
 */
async function loginAs(role: AuthRole, page: Page): Promise<void> {
  if (role === 'unauth') return

  const env = assertTestEnvs()
  const sb = getTestClient(env)

  const { data, error } = await sb.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  })
  if (error) throw new Error(`[e2e/auth] login failed · ${error.message}`)
  if (!data.session) throw new Error('[e2e/auth] login retornou sem session')

  const cookieValue = JSON.stringify([
    data.session.access_token,
    data.session.refresh_token,
    null,
    null,
    data.session.expires_at,
  ])

  // Domain depende do baseURL · localhost pra dev, host real pra preview/prod
  const baseURL = process.env.LARA_E2E_URL ?? 'http://localhost:3005'
  const domain = new URL(baseURL).hostname

  await page.context().addCookies([
    {
      name: `sb-${env.projectRef}-auth-token`,
      value: cookieValue,
      domain,
      path: '/',
      httpOnly: false,
      secure: baseURL.startsWith('https://'),
      sameSite: 'Lax',
    },
  ])
}

export const test = base.extend<AuthFixtures>({
  authedAs: ['unauth', { option: true }],
  page: async ({ page, authedAs }, use) => {
    if (authedAs !== 'unauth') {
      await loginAs(authedAs, page)
    }
    await use(page)
  },
})

export { expect }

/**
 * Helper exportado pra specs · cliente Supabase autenticado pra setup
 * direto via SQL/RPC (criar lead seed, etc) sem passar pela UI.
 *
 * Usa anon key + login do test user (mesma sessao do browser).
 */
export async function getAuthedSupabase(): Promise<SupabaseClient> {
  const env = assertTestEnvs()
  const sb = getTestClient(env)
  const { data, error } = await sb.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  })
  if (error || !data.session) {
    throw new Error(`[e2e/auth] getAuthedSupabase login failed · ${error?.message}`)
  }
  return sb
}
