/**
 * Vitest config · @clinicai/utils.
 *
 * CRM_PARITY_R2 · cobre Money helper (no float drift em N parcelas) +
 * derivação canônica de payment_status. Sem hit em rede / DB.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.d.ts', '**/*.test.ts', 'src/index.ts'],
    },
  },
})
