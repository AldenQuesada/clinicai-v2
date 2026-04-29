/**
 * Playwright config · @clinicai/lara · Camada 11b.
 *
 * Foco v1: smoke de paginas publicas (sem auth · sem hit em DB real).
 * Specs em apps/lara/e2e/ · executados contra `pnpm start` na porta 3005.
 *
 * Strategy:
 *   - chromium-only (uma engine basta pra smoke; webkit/firefox depois se rede surgir)
 *   - 1 worker em CI (paginas publicas nao escalam testes simultaneos sem fixtures)
 *   - retries=2 em CI, 0 local (catch flake)
 *   - baseURL via env LARA_E2E_URL ou default localhost:3005
 *
 * Como rodar local:
 *   1. pnpm -F @clinicai/lara build
 *   2. pnpm -F @clinicai/lara start &  (aguarde "ready")
 *   3. pnpm -F @clinicai/lara e2e
 *
 * Quando expandir pra auth (Camada 11c):
 *   - global setup que stub Supabase session via cookie/localStorage
 *   - ou usar test fixture com `page.addInitScript`
 */
import { defineConfig, devices } from '@playwright/test'

const PORT = 3005
const baseURL = process.env.LARA_E2E_URL ?? `http://localhost:${PORT}`
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // smoke specs, sem paralelismo agressivo v1
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // CI nao usa webServer · pipeline starta `pnpm start` em job separado.
  // Local: descomente se quiser auto-start.
  // webServer: {
  //   command: 'pnpm start',
  //   url: baseURL,
  //   timeout: 60_000,
  //   reuseExistingServer: !isCI,
  // },
})
