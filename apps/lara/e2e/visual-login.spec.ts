/**
 * E2E · visual regression em /login.
 *
 * Camada 11c · primeiro spec de visual diff. Snapshot baseline da pagina
 * de login captura mudancas nao-intencionais em layout/cores/fontes.
 *
 * IMPORTANTE: o primeiro run salva o baseline em
 * `e2e/visual-login.spec.ts-snapshots/`. Runs subsequentes diff vs baseline.
 *
 * Pra atualizar baseline (mudanca intencional):
 *   pnpm -F @clinicai/lara e2e --update-snapshots
 *
 * Threshold maxDiffPixelRatio:0.02 = 2% tolerancia · tolera anti-aliasing,
 * font rendering minor differences entre OS · falha em mudancas reais
 * (botao novo, cor mudou, layout shift > 2%).
 */
import { test, expect } from '@playwright/test'

test.describe('/login · visual regression', () => {
  test('baseline desktop 1280x720', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/login', { waitUntil: 'networkidle' })

    // Espera fontes carregarem (Google Fonts) · sem isso snapshot pega
    // fallback font e da diff em runs subsequentes
    await page.evaluate(() => document.fonts.ready)

    // Esconde elementos dinamicos (timestamp, animacoes loop, etc) que
    // dariam ruido no diff. v1 nao tem nenhum, mas deixa a pattern.
    // await page.addStyleTag({ content: '.no-snap { visibility: hidden }' })

    await expect(page).toHaveScreenshot('login-desktop.png', {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
  })
})
