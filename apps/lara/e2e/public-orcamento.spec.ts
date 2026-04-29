/**
 * E2E · /orcamento/<token> publico · token invalido retorna 404.
 *
 * Valida o caminho critico introduzido na Camada 9:
 *   - Middleware (PUBLIC_PATHS) permite passagem sem JWT
 *   - Server Component executa service_role lookup
 *   - notFound() dispara quando token nao bate
 *
 * Token de teste: UUID-shaped mas garantidamente inexistente em DB
 * (prefixado com 0xff repetido). Em produçao, esse token NUNCA existira
 * porque ensureShareToken usa crypto.randomUUID v4.
 *
 * NOTA: este spec hit o DB real (service_role lookup). Em CI roda contra
 * env LARA_E2E_URL apontando pra deploy de preview ou staging. Local
 * roda contra dev server ou build server.
 */
import { test, expect } from '@playwright/test'

const NEVER_EXISTS_TOKEN = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

test.describe('/orcamento/<token> (public)', () => {
  test('token invalido → 404', async ({ page }) => {
    const response = await page.goto(`/orcamento/${NEVER_EXISTS_TOKEN}`)
    expect(response?.status()).toBe(404)
  })

  test('token vazio (path malformado) → 404 ou redirect', async ({ page }) => {
    // /orcamento sozinho sem token segmento · Next deve dar 404
    const response = await page.goto('/orcamento/')
    expect([404, 308, 307]).toContain(response?.status() ?? 0)
  })
})
