/**
 * E2E · publico · CRM_FUNCTIONALITY_MULTI_AGENT · Lote 4 Agente G (testes).
 *
 * Cenario: /orcamento/<token> publico · token invalido + token vazio.
 *
 * Diferente de public-orcamento.spec.ts (que ja existe): este spec foca
 * em garantir comportamento defensivo de tokens malformados/inexistentes
 * apos os patches dos Lotes 1-3 que podem ter alterado o token-resolver.
 *
 * Cenarios:
 *   1. Token UUID-shaped mas inexistente → 404
 *   2. Token NaN (string lixo nao-UUID) → 404 (zod fail no resolver)
 *   3. Path sem token → 404 ou redirect
 *
 * Roda SEM secrets · pode ser executado imediatamente.
 */
import { test, expect } from '@playwright/test'

const NEVER_EXISTS_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
const MALFORMED_TOKEN = 'token-invalido-xyz'

test.describe('/orcamento/<token> · defensive routing', () => {
  test('token UUID inexistente → 404', async ({ page }) => {
    const response = await page.goto(`/orcamento/${NEVER_EXISTS_UUID}`)
    expect(response?.status()).toBe(404)
  })

  test('token malformado (nao-UUID) → 404 ou pagina de erro', async ({ page }) => {
    const response = await page.goto(`/orcamento/${MALFORMED_TOKEN}`)
    // Resolver usa zod uuid · falha vai pra notFound() (404)
    // Tolerancia: alguns implementations dao 200 com mensagem · aceita 404 ou
    // body com "nao encontrado"
    const status = response?.status() ?? 0
    if (status === 200) {
      const bodyText = await page.textContent('body')
      expect(bodyText?.toLowerCase()).toMatch(
        /n[ãa]o encontrado|invalid|not found|expirado/i,
      )
    } else {
      expect([404, 400]).toContain(status)
    }
  })

  test('path /orcamento/ sem token → 404 ou redirect', async ({ page }) => {
    const response = await page.goto('/orcamento/')
    // Next sem segmento dinamico → 404 (preferido) ou 307/308 (redirect)
    expect([404, 307, 308]).toContain(response?.status() ?? 0)
  })

  test('nao gateia por auth · sem cookie continua publico', async ({ page, context }) => {
    await context.clearCookies()
    const response = await page.goto(`/orcamento/${NEVER_EXISTS_UUID}`)
    // Mesmo sem JWT, comportamento eh 404 da pagina (nao redirect pra /login)
    expect(response?.status()).toBe(404)
    expect(page.url()).not.toContain('/login')
  })
})
