/**
 * E2E auth fixture · Camada 11c foundation.
 *
 * Stub agora · cumpre 2 funcoes:
 *   1. Define a API que specs autenticados vao usar (`test.use({ authedAs: 'owner' })`)
 *   2. Falha LOUD quando alguem tenta usar sem completar setup do test project
 *
 * Por que stub:
 *   - Login real precisa de Supabase test project com user de teste seedado
 *   - JWT proprio do projeto (nao tenho secret JWT_SIGNING aqui)
 *   - Test data (lead, orcamento, appointment) precisa seed script
 *
 * Como completar (5 passos · ver E2E.md secao "Happy path E2E"):
 *   1. Criar projeto Supabase de test (separado de prod)
 *   2. Setar env vars: TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY,
 *      TEST_USER_EMAIL_OWNER, TEST_USER_PASSWORD
 *   3. Substituir o stub abaixo por chamada real a
 *      `supabase.auth.signInWithPassword(...)` + `page.context().addCookies(...)`
 *   4. Adicionar seed script (e2e/_fixtures/seed.ts) com lead/orcamento/appointment
 *      base em estados conhecidos
 *   5. Escrever happy path specs em e2e/authed/
 *
 * Uso (quando completo):
 *   test.use({ authedAs: 'owner' })
 *   test('cria orcamento', async ({ page }) => { ... })
 */
import { test as base, expect } from '@playwright/test'

export type AuthRole = 'owner' | 'admin' | 'receptionist' | 'therapist' | 'unauth'

interface AuthFixtures {
  /**
   * Configura sessao Supabase pro role · injeta cookie sb-access-token + refresh.
   * 'unauth' explicito pra testes que querem confirmar gate (negativo).
   */
  authedAs: AuthRole
}

/**
 * Confirma que envs de test estao setadas. Falha cedo com instrucao clara
 * em vez de crash misterioso no Playwright.
 */
function assertTestEnvs(): { url: string; anonKey: string; email: string; password: string } {
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
        `Setup necessario · ver apps/lara/E2E.md#happy-path-e2e.\n` +
        `Stub atual nao consegue logar · use authedAs:'unauth' ou\n` +
        `complete o setup pra rodar specs autenticados.`,
    )
  }

  return { url: url!, anonKey: anonKey!, email: email!, password: password! }
}

/**
 * Login real via Supabase Auth · futuro · NAO IMPLEMENTADO v1.
 *
 * Quando completo: chama `auth.signInWithPassword`, extrai access_token +
 * refresh_token, monta cookies sb-<project>-auth-token (formato Supabase
 * SSR cookie), injeta via page.context().addCookies.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _stubLogin(_role: AuthRole): Promise<void> {
  // Placeholder · ver doc no header.
  assertTestEnvs() // intencional · falha loud com instrucao
  throw new Error('[e2e/auth] loginAs nao implementado v1 · ver E2E.md')
}

export const test = base.extend<AuthFixtures>({
  authedAs: [
    async ({ page: _page }, use) => {
      // Default: unauth (specs negativos · gate de auth)
      // Quando authedAs eh override, _stubLogin deveria rodar · v1 throws.
      await use('unauth')
    },
    { option: true },
  ],
})

export { expect }
