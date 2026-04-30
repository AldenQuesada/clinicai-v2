#!/usr/bin/env node
/**
 * Cleanup de test data E2E (Camada 11d).
 *
 * Deleta TODAS as rows com `metadata->>'is_e2e_test' = 'true'` em:
 *   - leads
 *   - patients
 *   - orcamentos
 *   - appointments
 *
 * NAO toca em rows sem o tag · safe pra rodar quando quiser.
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/e2e-cleanup.mjs
 *
 * Tipicamente rodado:
 *   - afterAll() em cada spec E2E (cleanup automatico)
 *   - Manualmente quando suspeita de leak
 *   - CI step pos-fail (defensivo)
 */

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF || 'oqboitkpcvuaudouwvkl'

if (!TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN nao setado')
  process.exit(1)
}

const TABLES = ['orcamentos', 'appointments', 'patients', 'leads']
// Ordem importa pra FK · orcamentos/appointments referenciam leads/patients

const sql = TABLES.map(
  (t) => `DELETE FROM public.${t} WHERE metadata->>'is_e2e_test' = 'true';`,
).join('\n') + `
SELECT 'leads' AS table_name, COUNT(*) AS remaining FROM public.leads WHERE metadata->>'is_e2e_test' = 'true'
UNION ALL
SELECT 'patients', COUNT(*) FROM public.patients WHERE metadata->>'is_e2e_test' = 'true'
UNION ALL
SELECT 'orcamentos', COUNT(*) FROM public.orcamentos WHERE notes ~~* '%[E2E_TEST]%'
UNION ALL
SELECT 'appointments', COUNT(*) FROM public.appointments WHERE metadata->>'is_e2e_test' = 'true';
`

console.log(`→ Cleanup E2E test data em ${REF}...`)

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
console.log(text)

if (!res.ok) {
  console.error('❌ Cleanup falhou')
  process.exit(1)
}
console.log('✅ Cleanup concluido · todas rows com is_e2e_test=true deletadas')
