/**
 * Supabase client browser-side · Client Components, hooks, event handlers.
 *
 * Anon key · respeita RLS · clinic_id resolvido via JWT do user logado
 * (custom_access_token_hook injeta clinic_id + app_role).
 */

import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

// Camada 3 (2026-04-28): trocamos `SupabaseClient<Database>` por
// `ReturnType<typeof createSSRBrowserClient<Database>>` pra evitar mismatch
// entre os 3 generics que `@supabase/ssr@0.5.2` retorna e os 4 generics que
// `@supabase/supabase-js@2.103+` expande quando referenciado nominalmente.
type BrowserClient = ReturnType<typeof createSSRBrowserClient<Database>>

let _browserClient: BrowserClient | null = null

export function createBrowserClient(): BrowserClient {
  if (_browserClient) return _browserClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase browser config faltando · checar NEXT_PUBLIC_SUPABASE_URL/ANON_KEY')
  }
  _browserClient = createSSRBrowserClient<Database>(url, key)
  return _browserClient
}
