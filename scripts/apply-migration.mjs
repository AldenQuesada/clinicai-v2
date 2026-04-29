#!/usr/bin/env node
/**
 * Aplica uma migration arbitraria em prod via Supabase Management API.
 *
 * Mesmo padrao de generate-types.mjs (fetch nativo Node, evita CLI Supabase).
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs <file>
 *
 *   # exemplo:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs \
 *     db/migrations/20260800000082_clinicai_v2_orcamento_followup.sql
 *
 * Argumentos:
 *   <file>   Caminho da migration (relativo ao repo root ou absoluto)
 *   --down   Aplica o `.down.sql` em vez do `.sql` (rollback)
 *
 * Variaveis de ambiente:
 *   SUPABASE_ACCESS_TOKEN  Personal access token (obrigatorio)
 *   SUPABASE_PROJECT_REF   Project ref (default: oqboitkpcvuaudouwvkl)
 *
 * Exit codes:
 *   0  HTTP 2xx
 *   1  config invalida ou HTTP nao-2xx
 *
 * NOTA: Management API nao mantem state-table de migrations aplicadas. Apos
 * apply, regenere types via `pnpm db:types` se a mig adicionou RPC/coluna.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF || 'oqboitkpcvuaudouwvkl'

if (!TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN nao setado')
  console.error('   Gere em: https://supabase.com/dashboard/account/tokens')
  process.exit(1)
}

const args = process.argv.slice(2)
const isDown = args.includes('--down')
const filePath = args.find((a) => !a.startsWith('--'))

if (!filePath) {
  console.error('❌ Uso: node scripts/apply-migration.mjs <file> [--down]')
  process.exit(1)
}

// Resolve o arquivo · suporta path absoluto, relativo ao cwd ou ao repo root
const repoRoot = path.resolve(new URL('..', import.meta.url).pathname)
let resolved = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)
try {
  await fs.access(resolved)
} catch {
  // Tenta relativo ao repo root
  const fallback = path.resolve(repoRoot, filePath)
  try {
    await fs.access(fallback)
    resolved = fallback
  } catch {
    console.error(`❌ Arquivo nao encontrado: ${filePath}`)
    process.exit(1)
  }
}

// Se --down, redireciona pro .down.sql correspondente
if (isDown) {
  const downPath = resolved.replace(/\.sql$/, '.down.sql')
  try {
    await fs.access(downPath)
    resolved = downPath
  } catch {
    console.error(`❌ .down.sql nao encontrado: ${downPath}`)
    process.exit(1)
  }
}

const sql = await fs.readFile(resolved, 'utf8')
const filename = path.basename(resolved)

console.log(`→ Aplicando ${filename} em ${REF} (${sql.length} chars)${isDown ? ' [ROLLBACK]' : ''}...`)

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
})

const text = await res.text()
console.log(`HTTP ${res.status}`)
console.log(text.slice(0, 2000))

if (!res.ok) {
  console.error(`❌ Falha ao aplicar migration`)
  process.exit(1)
}

console.log(`✅ Aplicada com sucesso`)
console.log(`   Pos-apply: pnpm db:types pra regenerar types se adicionou RPC/coluna`)
