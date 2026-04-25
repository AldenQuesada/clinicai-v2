/**
 * Vitest config · @clinicai/supabase.
 *
 * Cobre resolveClinicContext (cache + fallback RPC + warning unico)
 * com SupabaseClient mockado.
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
