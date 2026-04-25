/**
 * Vitest config · @clinicai/repositories.
 *
 * Cobre testes de idempotencia (voucher-dispatch-queue) e retry policy
 * (b2b-voucher.issueWithDedup) com SupabaseClient mockado · zero hit
 * em PostgreSQL real.
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
      exclude: ['**/*.d.ts', '**/*.test.ts', '**/types.ts', 'src/index.ts'],
    },
  },
})
