#!/usr/bin/env node
/**
 * Camada 12a · Divergence check entre legacy_2026_04_28 e public.
 *
 * Compara counts (total + por status quando aplicavel) das 4 tabelas
 * canonicas migradas em 2026-04-28:
 *   - leads
 *   - patients
 *   - appointments
 *   - orcamentos
 *
 * Output em 2 formatos:
 *   - Pretty-print (default · stdout)
 *   - JSON (--json) · pra cron logging / Slack alert
 *
 * Exit code:
 *   0 = sem divergencia significativa OU --warn-only
 *   1 = divergencia detectada (count v2 < legacy · perda de dados)
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... pnpm db:divergence
 *   SUPABASE_ACCESS_TOKEN=sbp_... pnpm db:divergence --json
 *   SUPABASE_ACCESS_TOKEN=sbp_... pnpm db:divergence --warn-only
 *
 * Pra rodar em cron daily durante o soak window 30 dias:
 *   adicione ao .github/workflows/lara-crons.yml com schedule diario
 *   + opcional: pipe pra Slack via webhook
 *
 * NOTA: nao detecta DRIFT (rows que existem em ambos mas com valores
 * diferentes). Se ficar paranoia v2, adicionar checksum por id em
 * Camada 12c (sample-based, nao full table).
 */

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF || 'oqboitkpcvuaudouwvkl'

if (!TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN nao setado')
  console.error('   Gere em: https://supabase.com/dashboard/account/tokens')
  process.exit(1)
}

const args = process.argv.slice(2)
const isJson = args.includes('--json')
const warnOnly = args.includes('--warn-only')

const LEGACY_SCHEMA = 'legacy_2026_04_28'
const CURRENT_SCHEMA = 'public'

const TABLES = ['leads', 'patients', 'appointments', 'orcamentos']

async function querySql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'curl/8.7.1',
    },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  return res.json()
}

async function tableExists(schema, table) {
  const sql = `SELECT 1 FROM information_schema.tables WHERE table_schema='${schema}' AND table_name='${table}' LIMIT 1`
  const data = await querySql(sql)
  return Array.isArray(data) && data.length > 0
}

async function countRows(schema, table) {
  // Contagem total · sem filtro deleted_at (legacy pode nao ter essa coluna)
  const sql = `SELECT COUNT(*)::INT AS n FROM ${schema}.${table}`
  try {
    const data = await querySql(sql)
    return data[0]?.n ?? 0
  } catch {
    return null
  }
}

async function countActive(schema, table) {
  // Tenta count excluindo soft-deleted (NULL deleted_at)
  const sql = `SELECT COUNT(*)::INT AS n FROM ${schema}.${table} WHERE deleted_at IS NULL`
  try {
    const data = await querySql(sql)
    return data[0]?.n ?? 0
  } catch {
    return null // tabela nao tem deleted_at column
  }
}

async function main() {
  const report = {
    ranAt: new Date().toISOString(),
    project: REF,
    legacySchema: LEGACY_SCHEMA,
    currentSchema: CURRENT_SCHEMA,
    tables: [],
    summary: {
      ok: 0,
      missing: 0,
      divergent: 0,
      total: TABLES.length,
    },
    divergences: [],
  }

  for (const table of TABLES) {
    const [legacyExists, currentExists] = await Promise.all([
      tableExists(LEGACY_SCHEMA, table),
      tableExists(CURRENT_SCHEMA, table),
    ])

    if (!legacyExists) {
      report.tables.push({ table, status: 'legacy_missing', note: 'tabela nao existe em legacy_2026_04_28 · pode ser nova em v2' })
      report.summary.missing++
      continue
    }
    if (!currentExists) {
      report.tables.push({ table, status: 'current_missing', note: 'tabela nao existe em public · BUG · investigar' })
      report.summary.missing++
      report.divergences.push({ table, severity: 'critical', msg: 'tabela ausente em public' })
      continue
    }

    const [legacyTotal, legacyActive, currentTotal, currentActive] = await Promise.all([
      countRows(LEGACY_SCHEMA, table),
      countActive(LEGACY_SCHEMA, table),
      countRows(CURRENT_SCHEMA, table),
      countActive(CURRENT_SCHEMA, table),
    ])

    const row = {
      table,
      legacyTotal,
      legacyActive,
      currentTotal,
      currentActive,
      status: 'ok',
    }

    // Heuristica de divergencia:
    // 1. v2 active < legacy active · PERDA de dados (critico)
    // 2. v2 total much smaller · pode ser cleanup esperado, warning
    // 3. v2 active > legacy active · OK (novos dados em v2)
    const lActive = legacyActive ?? legacyTotal
    const cActive = currentActive ?? currentTotal

    if (cActive !== null && lActive !== null && cActive < lActive) {
      const diff = lActive - cActive
      const pct = lActive > 0 ? ((diff / lActive) * 100).toFixed(1) : '?'
      row.status = 'divergent'
      row.diffActive = diff
      row.diffPct = pct
      report.summary.divergent++
      report.divergences.push({
        table,
        severity: diff > 5 ? 'critical' : 'warning',
        msg: `v2 active (${cActive}) < legacy active (${lActive}) · perda de ${diff} rows (${pct}%)`,
      })
    } else {
      report.summary.ok++
    }

    report.tables.push(row)
  }

  if (isJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    prettyPrint(report)
  }

  if (warnOnly) process.exit(0)
  process.exit(report.summary.divergent > 0 ? 1 : 0)
}

function prettyPrint(report) {
  console.log('')
  console.log(`━━━ Divergence check · ${report.ranAt}`)
  console.log(`    project: ${report.project}`)
  console.log(`    legacy:  ${report.legacySchema}`)
  console.log(`    current: ${report.currentSchema}`)
  console.log('')
  console.log('Tabela       | legacy total | legacy active | v2 total | v2 active | status')
  console.log('-------------|--------------|---------------|----------|-----------|--------')
  for (const r of report.tables) {
    const pad = (v, w) => String(v ?? '—').padStart(w)
    const statusIcon = r.status === 'ok' ? '✅' : r.status === 'divergent' ? '⚠️ ' : '❌'
    console.log(
      `${r.table.padEnd(12)} | ${pad(r.legacyTotal, 12)} | ${pad(r.legacyActive, 13)} | ${pad(r.currentTotal, 8)} | ${pad(r.currentActive, 9)} | ${statusIcon} ${r.status}`,
    )
  }
  console.log('')
  console.log(
    `Resumo: ${report.summary.ok} ok · ${report.summary.divergent} divergent · ${report.summary.missing} missing`,
  )

  if (report.divergences.length > 0) {
    console.log('')
    console.log('━━━ Divergencias detectadas')
    for (const d of report.divergences) {
      const icon = d.severity === 'critical' ? '🚨' : '⚠️ '
      console.log(`  ${icon} [${d.table}] ${d.msg}`)
    }
  }
  console.log('')
}

main().catch((err) => {
  console.error('❌ Divergence check falhou:', err.message)
  process.exit(2)
})
