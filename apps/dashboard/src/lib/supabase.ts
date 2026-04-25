/**
 * Supabase clients · server e browser.
 *
 * Server: service-role key · BYPASSA RLS · USAR SOMENTE em rotas/server actions
 * autenticadas. Nunca expor pro client.
 *
 * Browser: anon key · respeita RLS · OK pra usar em client components.
 *
 * SSR: para auth com cookies em RSC, ver `supabase-ssr.ts` (a criar quando
 * implementarmos SSO compartilhado com painel.miriandpaula.com.br).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _serverClient: SupabaseClient | null = null
let _browserClient: SupabaseClient | null = null

export function createServerClient(): SupabaseClient {
  if (_serverClient) return _serverClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase server config faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY')
  }
  _serverClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _serverClient
}

export function createBrowserClient(): SupabaseClient {
  if (_browserClient) return _browserClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase browser config faltando')
  }
  _browserClient = createClient(url, key)
  return _browserClient
}
