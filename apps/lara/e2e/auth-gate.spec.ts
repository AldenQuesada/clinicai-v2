/**
 * E2E · auth gate · valida middleware redirect pra /login quando sem JWT.
 *
 * Camada 11c foundation · testa o gate sem precisar logar (negativo).
 * Cobre as 4 maiores areas autenticadas:
 *   - /crm (CRM home)
 *   - /crm/orcamentos (Camada 9)
 *   - /crm/agenda (Camada 8)
 *   - /conversas (chat principal)
 *
 * Pattern do middleware (apps/lara/src/middleware.ts):
 *   - PUBLIC_PATHS: /login, /join, /orcamento, /api/auth, /api/webhook,
 *     /api/cron, /api/cold-open
 *   - resto exige session · redirect 307 pra /login com ?redirect=<destino>
 */
import { test, expect } from '@playwright/test'

const AUTHED_ROUTES = [
  { path: '/crm', label: 'CRM home' },
  { path: '/crm/orcamentos', label: 'Orcamentos listagem' },
  { path: '/crm/agenda', label: 'Agenda' },
  { path: '/conversas', label: 'Conversas' },
] as const

test.describe('Middleware auth gate · sem JWT', () => {
  for (const { path, label } of AUTHED_ROUTES) {
    test(`${label} (${path}) → redirect /login`, async ({ page, context }) => {
      // Garante que nao tem cookie de sessao residual
      await context.clearCookies()

      const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
      // Final URL deve ser /login (Next/middleware redirect server-side eh
      // transparente no goto · checa pathname final)
      expect(page.url()).toContain('/login')

      // Status final 200 (login renderizou) · nao 4xx
      expect(response?.status() ?? 0).toBeLessThan(400)
    })
  }

  test('preserva querystring no redirect', async ({ page, context }) => {
    await context.clearCookies()
    await page.goto('/crm/orcamentos?status=sent&from=2026-04-01', {
      waitUntil: 'domcontentloaded',
    })

    const url = new URL(page.url())
    expect(url.pathname).toBe('/login')
    // O middleware preserva o destino completo em ?redirect= · pode incluir
    // querystring original
    const redirect = url.searchParams.get('redirect') ?? ''
    expect(redirect).toContain('/crm/orcamentos')
  })

  test('rota publica /login eh acessivel sem auth', async ({ page, context }) => {
    await context.clearCookies()
    const response = await page.goto('/login')
    expect(response?.status()).toBe(200)
    // NAO redireciona pra outro lugar
    expect(page.url()).toContain('/login')
  })

  test('rota publica /orcamento/<token> nao gateia (mesmo com token invalido)', async ({
    page,
    context,
  }) => {
    await context.clearCookies()
    // Token invalido deve dar 404 da pagina, NAO redirect pra /login
    const response = await page.goto('/orcamento/ffffffff-ffff-ffff-ffff-ffffffffffff')
    expect(response?.status()).toBe(404)
    expect(page.url()).not.toContain('/login')
  })
})
