/**
 * E2E · /login renderiza · pagina publica (rota fora do PUBLIC_PATHS gate
 * de auth, mas aceita visita anonima e mostra form).
 *
 * Smoke minimal · garante que:
 *   - HTTP 200 OK
 *   - Pagina carrega assets sem erro server-side
 *   - Tem input de email (form basico)
 */
import { test, expect } from '@playwright/test'

test.describe('/login (public)', () => {
  test('renderiza form com input email', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response?.status()).toBe(200)

    // Aceita label PT-BR ou EN-US (caso tema mude)
    const emailInput = page.getByRole('textbox', { name: /e-?mail/i }).or(
      page.locator('input[type="email"]'),
    )
    await expect(emailInput.first()).toBeVisible({ timeout: 10_000 })
  })

  test('nao expoe erros JS na console (smoke)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.goto('/login', { waitUntil: 'networkidle' })
    // Tolera erros nao-criticos (ex: extension noise) · so falha em
    // exception JS top-level
    const critical = errors.filter(
      (e) => !e.includes('favicon') && !e.includes('extension') && !e.includes('chrome-error'),
    )
    expect(critical, `Erros criticos no console: ${critical.join('; ')}`).toEqual([])
  })
})
