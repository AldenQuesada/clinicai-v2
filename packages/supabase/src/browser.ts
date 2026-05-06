/**
 * Supabase client browser-side · Client Components, hooks, event handlers.
 *
 * Anon key · respeita RLS · clinic_id resolvido via JWT do user logado
 * (custom_access_token_hook injeta clinic_id + app_role).
 *
 * Audit 2026-05-06 · runtime config injection:
 *   Lê window.__SUPABASE_CONFIG__ injetado pelo server component
 *   (apps/lara/src/app/layout.tsx) com valores RUNTIME do process.env do
 *   container. Bypassa o build-time embed do Webpack que exigia ARG
 *   NEXT_PUBLIC_* no Dockerfile + Build Args no Easypanel. Fallback pra
 *   process.env mantido pra compat com chamadas SSR/Node.
 */

import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

// Camada 3 (2026-04-28): trocamos `SupabaseClient<Database>` por
// `ReturnType<typeof createSSRBrowserClient<Database>>` pra evitar mismatch
// entre os 3 generics que `@supabase/ssr@0.5.2` retorna e os 4 generics que
// `@supabase/supabase-js@2.103+` expande quando referenciado nominalmente.
type BrowserClient = ReturnType<typeof createSSRBrowserClient<Database>>

declare global {
  interface Window {
    __SUPABASE_CONFIG__?: { url?: string; anonKey?: string }
  }
}

let _browserClient: BrowserClient | null = null

export function createBrowserClient(): BrowserClient {
  if (_browserClient) return _browserClient

  // 1ª prioridade · runtime config injetado pelo server component (layout.tsx)
  // 2ª prioridade · process.env (build-time embed · funciona se Build Args
  //   estão setados no Dockerfile/Easypanel)
  const runtimeCfg = typeof window !== 'undefined' ? window.__SUPABASE_CONFIG__ : null
  const url = runtimeCfg?.url || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = runtimeCfg?.anonKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error(
      'Supabase browser config faltando · checar window.__SUPABASE_CONFIG__ (layout.tsx) ou NEXT_PUBLIC_SUPABASE_URL/ANON_KEY (build args)',
    )
  }
  _browserClient = createSSRBrowserClient<Database>(url, key)
  return _browserClient
}
