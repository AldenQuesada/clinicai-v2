/**
 * Supabase clients server-side · Next.js App Router (RSC + Server Actions).
 *
 * Dois modos:
 * - createServerClient(): respeita JWT do cookie · usar em RSC autenticado.
 *   RLS aplicada · clinic_id vem do JWT via custom_access_token_hook.
 * - createServiceRoleClient(): bypassa RLS · USAR APENAS em rotas server-side
 *   que precisam admin total (webhook entry point, cron, migrations programaticas).
 *   NUNCA expor pro browser.
 *
 * Multi-tenant (ADR-028): este module NAO resolve clinic_id sozinho. Quem
 * resolve e tenant.ts ou Server Action via getClinicContext(req).
 */

import { createServerClient as createSSRServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

type CookieOptions = Record<string, unknown>

interface CookieAdapter {
  get(name: string): string | undefined
  set?(name: string, value: string, options?: CookieOptions): void
  remove?(name: string, options?: CookieOptions): void
}

/**
 * Cliente server-side autenticado · usar em RSC, Route Handlers, Server Actions.
 * Cookies passados pelo Next.js via `next/headers` cookies() (caller responsibility).
 *
 * Exemplo:
 *   import { cookies } from 'next/headers'
 *   const supabase = createServerClient(await cookies())
 */
export function createServerClient(cookieStore: CookieAdapter): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase server config faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createSSRServerClient<Database>(url, key, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set?.(name, value, options)
        } catch {
          // Ignored · alguns contextos (RSC) nao permitem set
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.remove?.(name, options)
        } catch {
          // Ignored
        }
      },
    },
  })
}

/**
 * Service role · BYPASSA RLS · USAR SO em:
 * - Webhook entry points (validados por verify token)
 * - Cron jobs internos
 * - Edge functions com auth proprio
 *
 * NUNCA usar em RSC ou Server Actions de UI · sempre createServerClient acima.
 */
let _serviceClient: SupabaseClient<Database> | null = null

export function createServiceRoleClient(): SupabaseClient<Database> {
  if (_serviceClient) return _serviceClient
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Supabase service role config faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY')
  }
  _serviceClient = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _serviceClient
}
