/**
 * Vitest config · Mira app.
 *
 * Configuracao minimalista alinhada com Next.js 16 + Turbopack:
 *   - environment 'node' · testes rodam offline (mocks pra Supabase/Anthropic/Slack/Sentry)
 *   - globals true · habilita describe/it/expect sem import explicito
 *   - alias '@' apontando pra src/ (espelha tsconfig paths)
 *   - coverage v8 mira integration paths (Waves 1-3 incidente vouchers)
 */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.d.ts', '**/*.test.ts', '**/types.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
