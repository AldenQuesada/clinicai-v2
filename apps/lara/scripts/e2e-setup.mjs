#!/usr/bin/env node
/**
 * apps/lara/scripts/e2e-setup.mjs
 *
 * Cria/atualiza o usuário E2E isolado (`e2e-test@miriandpaula.com.br`) +
 * vincula em `profiles` da clínica Mirian com role `owner`. Idempotente.
 *
 * Output (1x): 4 envs pra colar em GitHub Settings → Secrets → Actions
 *   TEST_SUPABASE_URL
 *   TEST_SUPABASE_ANON_KEY
 *   TEST_USER_EMAIL_OWNER
 *   TEST_USER_PASSWORD       ← só impressa se for recém-gerada
 *
 * Uso:
 *   pnpm --filter lara e2e:setup
 *
 * Envs necessárias (lê de `apps/lara/.env.local` ou shell):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   SUPABASE_SERVICE_ROLE_KEY     ← NUNCA impressa
 *
 * Envs opcionais:
 *   E2E_TEST_EMAIL       (default: e2e-test@miriandpaula.com.br)
 *   E2E_TEST_PASSWORD    (se ausente · gera aleatória de 32 hex chars)
 *
 * Regras de segurança:
 *   - Nunca imprime service_role / anon detalhada além do output final
 *   - User criado com `user_metadata.is_e2e_user=true` (isolamento de cleanup)
 *   - Cleanup de fixtures vive em specs (afterAll)
 *   - Zero deploy · zero migration · zero WhatsApp/Meta/Evolution
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── Carrega .env.local (preserva env já setadas no shell) ───────────────────
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const txt = readFileSync(filePath, 'utf8')
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (!m) continue
    const [, key, val] = m
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = val.trim()
    }
  }
}

loadEnvFile(resolve(__dirname, '..', '.env.local'))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const missing = []
if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
if (!SERVICE_ROLE) missing.push('SUPABASE_SERVICE_ROLE_KEY')
if (!ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if (missing.length > 0) {
  console.error('FALTA env:', missing.join(', '))
  console.error('Adicione em apps/lara/.env.local ou exporte no shell.')
  process.exit(1)
}

const EMAIL = process.env.E2E_TEST_EMAIL || 'e2e-test@miriandpaula.com.br'
// Clinic Mirian de Paula (single-tenant production)
const CLINIC_ID = '00000000-0000-0000-0000-000000000001'
const ROLE = 'owner' // owner cobre todos specs (incluindo mesa-archive · canAct gate)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function generatePassword() {
  return crypto.randomBytes(16).toString('hex') // 32 chars hex
}

async function findUserByEmail(email) {
  // Supabase Admin API listUsers · paginação se necessário
  let page = 1
  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < 1000) return null
    page++
  }
  return null
}

async function main() {
  console.log(`[~] e2e-setup · target email: ${EMAIL}`)
  console.log(`[~] clinic_id: ${CLINIC_ID} (Mirian de Paula)`)
  console.log(`[~] role: ${ROLE}`)
  console.log()

  let user = await findUserByEmail(EMAIL)
  let password = process.env.E2E_TEST_PASSWORD || null
  let passwordWasReset = false

  if (!user) {
    // ── Criar novo ───────────────────────────────────────────────────────
    password = password || generatePassword()
    const { data, error } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: {
        is_e2e_user: true,
        source: 'crm_e2e_setup',
        created_at: new Date().toISOString(),
      },
    })
    if (error) {
      console.error('createUser ERR:', error.message)
      process.exit(2)
    }
    user = data.user
    passwordWasReset = true
    console.log(`[+] auth.users CREATED · id=${user.id}`)
  } else {
    console.log(`[=] auth.users EXISTS · id=${user.id}`)
    // Reset password só se E2E_TEST_PASSWORD foi fornecida explicitamente
    if (password) {
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        password,
        user_metadata: {
          is_e2e_user: true,
          source: 'crm_e2e_setup',
          updated_at: new Date().toISOString(),
        },
      })
      if (error) {
        console.error('updateUserById ERR:', error.message)
        process.exit(3)
      }
      passwordWasReset = true
      console.log('[+] password RESET via E2E_TEST_PASSWORD')
    } else {
      // Atualiza só metadata (idempotência)
      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          is_e2e_user: true,
          source: 'crm_e2e_setup',
          updated_at: new Date().toISOString(),
        },
      })
    }
  }

  // ── UPSERT em profiles ────────────────────────────────────────────────
  const { error: upsertErr } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        clinic_id: CLINIC_ID,
        role: ROLE,
        first_name: 'E2E',
        last_name: 'Test',
        is_active: true,
      },
      { onConflict: 'id' },
    )
  if (upsertErr) {
    console.error('upsert profile ERR:', upsertErr.message)
    process.exit(4)
  }
  console.log(`[+] profiles UPSERT · clinic=Mirian role=${ROLE}`)

  // ── Output final ──────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log('GitHub Settings → Secrets and variables → Actions:')
  console.log('='.repeat(60))
  console.log(`TEST_SUPABASE_URL=${SUPABASE_URL}`)
  console.log(`TEST_SUPABASE_ANON_KEY=${ANON_KEY}`)
  console.log(`TEST_USER_EMAIL_OWNER=${EMAIL}`)
  if (passwordWasReset && password) {
    console.log(`TEST_USER_PASSWORD=${password}`)
    console.log('='.repeat(60))
    console.log('[!] SENHA EXIBIDA UMA UNICA VEZ · cole em GitHub Secrets agora')
    console.log('[!] Reset futuro: rode com E2E_TEST_PASSWORD=<nova>')
  } else {
    console.log('TEST_USER_PASSWORD=<use senha existente · nao reset nesta execucao>')
    console.log('='.repeat(60))
    console.log('[i] Pra reset · rode com E2E_TEST_PASSWORD=<nova-senha>')
  }
  console.log()
}

main().catch((e) => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
