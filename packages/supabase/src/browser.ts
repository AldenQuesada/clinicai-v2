/**
 * Supabase client browser-side · Client Components, hooks, event handlers.
 *
 * Anon key · respeita RLS · clinic_id resolvido via JWT do user logado
 * (custom_access_token_hook injeta clinic_id + app_role).
 */

import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

let _browserClient: SupabaseClient<Database> | null = null

export function createBrowserClient(): SupabaseClient<Database> {
  if (_browserClient) return _browserClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase browser config faltando · checar NEXT_PUBLIC_SUPABASE_URL/ANON_KEY')
  }
  _browserClient = createSSRBrowserClient<Database>(url, key)
  return _browserClient
}
