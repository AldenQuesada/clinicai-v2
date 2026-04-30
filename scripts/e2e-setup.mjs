#!/usr/bin/env node
/**
 * Setup do test user pra E2E happy path (Camada 11d).
 *
 * Roda 1 vez · cria:
 *   1. User no Supabase Auth (email + senha pre-confirmados)
 *   2. Row em clinic_members vinculando o user ao clinic_id existente
 *      (single-tenant Mirian) com role='owner'
 *
 * Apos rodar, imprime as 4 env vars pra colar nos GitHub Secrets:
 *   TEST_SUPABASE_URL
 *   TEST_SUPABASE_ANON_KEY
 *   TEST_USER_EMAIL_OWNER
 *   TEST_USER_PASSWORD
 *
 * Uso:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/e2e-setup.mjs
 *
 * Idempotente: se user ja existe, reutiliza · se ja tem row em
 * clinic_members, nao duplica.
 */

import crypto from 'node:crypto'

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const REF = process.env.SUPABASE_PROJECT_REF || 'oqboitkpcvuaudouwvkl'
const TEST_EMAIL = process.env.TEST_EMAIL || 'e2e-test@miriandpaula.com.br'

if (!TOKEN) {
  console.error('❌ SUPABASE_ACCESS_TOKEN nao setado')
  console.error('   Gere em: https://supabase.com/dashboard/account/tokens')
  process.exit(1)
}

const PROJECT_URL = `https://${REF}.supabase.co`
const MGMT_URL = 'https://api.supabase.com/v1'

// ── 1. Pega keys do projeto (anon + service_role) via Management API ────────

console.log(`→ Buscando keys do projeto ${REF}...`)
const keysRes = await fetch(`${MGMT_URL}/projects/${REF}/api-keys`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
})
if (!keysRes.ok) {
  console.error(`❌ HTTP ${keysRes.status}: ${await keysRes.text()}`)
  process.exit(1)
}
const keys = await keysRes.json()
const anonKey = keys.find((k) => k.name === 'anon')?.api_key
const serviceKey = keys.find((k) => k.name === 'service_role')?.api_key
if (!anonKey || !serviceKey) {
  console.error('❌ Faltou anon ou service_role key na resposta · abortando')
  process.exit(1)
}

// ── 2. Resolve clinic_id existente (single-tenant Mirian) via SQL query ─────

console.log('→ Resolvendo clinic_id (single-tenant)...')
const queryRes = await fetch(`${MGMT_URL}/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query: 'SELECT public._default_clinic_id() AS clinic_id;',
  }),
})
if (!queryRes.ok) {
  console.error(`❌ HTTP ${queryRes.status}: ${await queryRes.text()}`)
  process.exit(1)
}
const queryData = await queryRes.json()
const clinicId = queryData[0]?.clinic_id
if (!clinicId) {
  console.error('❌ _default_clinic_id() retornou null · abortando')
  process.exit(1)
}
console.log(`  clinic_id = ${clinicId}`)

// ── 3. Cria/recupera user via Auth admin API ────────────────────────────────

const TEST_PASSWORD = process.env.TEST_PASSWORD ?? crypto.randomBytes(24).toString('base64url')
console.log(`→ Criando user ${TEST_EMAIL}...`)

const createRes = await fetch(`${PROJECT_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
    app_metadata: { is_e2e_test: true },
    user_metadata: { name: 'E2E Test Owner' },
  }),
})

let userId
if (createRes.status === 422 || createRes.status === 400) {
  // User ja existe · busca pelo email
  console.log('  User ja existe · buscando id...')
  const listRes = await fetch(
    `${PROJECT_URL}/auth/v1/admin/users?filter=email.eq.${encodeURIComponent(TEST_EMAIL)}`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  )
  const listData = await listRes.json()
  const existing = (listData.users ?? []).find((u) => u.email === TEST_EMAIL)
  if (!existing) {
    console.error(`❌ User ja existe mas nao encontrado no list · abortando`)
    process.exit(1)
  }
  userId = existing.id
  console.log(`  user_id = ${userId} (existente · senha NAO foi alterada)`)
  console.log(`  ⚠️ Se voce nao tem a senha original, rode com TEST_EMAIL diferente ou`)
  console.log(`     reset via Supabase dashboard > Auth > Users`)
} else if (!createRes.ok) {
  console.error(`❌ HTTP ${createRes.status}: ${await createRes.text()}`)
  process.exit(1)
} else {
  const userData = await createRes.json()
  userId = userData.id
  console.log(`  user_id = ${userId}`)
}

// ── 4. Insere/atualiza row em clinic_members (idempotente via UPSERT) ───────

console.log('→ Vinculando user a clinic_members (role owner)...')
const upsertSql = `
  INSERT INTO public.clinic_members (user_id, clinic_id, role, active, is_primary, created_at)
  VALUES ('${userId}', '${clinicId}', 'owner', true, true, now())
  ON CONFLICT (user_id, clinic_id) DO UPDATE SET role='owner', active=true, is_primary=true;
`
const memberRes = await fetch(`${MGMT_URL}/projects/${REF}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: upsertSql }),
})
if (!memberRes.ok) {
  console.error(`❌ clinic_members upsert falhou · HTTP ${memberRes.status}`)
  console.error(`   ${await memberRes.text()}`)
  console.error(`   Setup parcial · cleanup manual: DELETE FROM auth.users WHERE id='${userId}'`)
  process.exit(1)
}
console.log('  ok')

// ── 5. Output env vars ──────────────────────────────────────────────────────

console.log('')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('✅ Setup concluido · cole as 4 env vars abaixo nos GitHub Secrets')
console.log('   (Settings → Secrets and variables → Actions → New secret)')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')
console.log(`TEST_SUPABASE_URL=${PROJECT_URL}`)
console.log(`TEST_SUPABASE_ANON_KEY=${anonKey}`)
console.log(`TEST_USER_EMAIL_OWNER=${TEST_EMAIL}`)
if (process.env.TEST_PASSWORD) {
  console.log(`TEST_USER_PASSWORD=${TEST_PASSWORD}  # (passada via env · nao gerada)`)
} else {
  console.log(`TEST_USER_PASSWORD=${TEST_PASSWORD}  # gerada aleatoriamente · GUARDA AGORA`)
}
console.log('')
console.log('Local (~/.envrc ou .env.test gitignored):')
console.log(`export TEST_SUPABASE_URL=${PROJECT_URL}`)
console.log(`export TEST_SUPABASE_ANON_KEY=${anonKey}`)
console.log(`export TEST_USER_EMAIL_OWNER=${TEST_EMAIL}`)
console.log(`export TEST_USER_PASSWORD=${TEST_PASSWORD}`)
console.log('')
