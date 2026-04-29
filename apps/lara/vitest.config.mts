/**
 * Vitest config · @clinicai/lara.
 *
 * Foco em Server Actions e schemas Zod · usa mock de loadServerReposContext
 * + next/cache pra isolar a action da infraestrutura Next.js.
 *
 * NOTA: arquivo eh ESM (import esm de vitest/config). apps/lara nao tem
 * "type": "module" no package.json (Next 16 usa CJS) entao precisamos
 * renomear pra .mjs (ou .mts). Vitest aceita ambos.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/*.d.ts', '**/*.test.ts', '**/.next/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
