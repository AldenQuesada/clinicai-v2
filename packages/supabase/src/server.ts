/**
 * Supabase clients server-side · Next.js App Router (RSC + Server Actions).
 *
 * Dois modos:
 * - createServerClient(): cookie-aware · respeita JWT do user logado · usar
 *   em RSC e Server Actions. RLS aplicada · clinic_id vem do JWT via
 *   custom_access_token_hook.
 * - createServiceRoleClient(): bypassa RLS · USAR APENAS em rotas server-side
 *   que precisam admin total (webhook entry point, cron, migrations programaticas).
 *   NUNCA expor pro browser.
 *
 * Multi-tenant (ADR-028): clinic_id resolvido via tenant.ts ou custom_access_token_hook.
 */

import { createServerClient as createSSRServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

// Camada 3 (2026-04-28): tipos derivados das funcoes em vez de
// `SupabaseClient<Database>` nominal · evita mismatch entre os 3 generics
// que `@supabase/ssr@0.5.2` retorna e os 4 que `@supabase/supabase-js@2.103+`
// expande quando `Database` eh um tipo concreto (Camada 3 substituiu `any`).
type ServerClient = ReturnType<typeof createSSRServerClient<Database>>
type ServiceClient = ReturnType<typeof createClient<Database>>

interface CookieToSet {
  name: string
  value: string
  options?: Record<string, unknown>
}

interface CookieMethodsAdapter {
  getAll(): Array<{ name: string; value: string }>
  setAll?(cookiesToSet: CookieToSet[]): void
}

/**
 * Cliente server-side autenticado · usar em RSC, Server Actions e Route Handlers.
 *
 * Caller injeta cookies adapter:
 *   import { cookies } from 'next/headers'
 *   const cookieStore = await cookies()
 *   const supabase = createServerClient({
 *     getAll: () => cookieStore.getAll(),
 *     setAll: (cookies) => cookies.forEach(c => cookieStore.set(c.name, c.value, c.options)),
 *   })
 */
export function createServerClient(
  cookies: CookieMethodsAdapter,
): ServerClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase server config faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createSSRServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookies.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          // Adiciona domain compartilhado em prod pra SSO entre subdominios
          // miriandpaula.com.br (painel + lara + mira). Em dev fica default.
          const sharedDomain = getSharedCookieDomain()
          const enriched: CookieToSet[] = sharedDomain
            ? cookiesToSet.map((c: CookieToSet) => ({
                ...c,
                options: { ...(c.options || {}), domain: sharedDomain },
              }))
            : cookiesToSet
          cookies.setAll?.(enriched)
        } catch {
          // Ignored · Server Components não permitem set; só Server Actions
        }
      },
    },
  })
}

/**
 * Retorna domain compartilhado pra cookies cross-subdomain.
 * Prod: '.miriandpaula.com.br' · cookie vale em painel.* / lara.* / mira.* / app.*
 * Dev/staging: null (cookie default · mesmo origin)
 */
export function getSharedCookieDomain(): string | null {
  // Override explicito via env (util pra staging custom)
  const override = process.env.AUTH_COOKIE_DOMAIN
  if (override) return override

  // Auto-detect baseado em NEXT_PUBLIC_APP_URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl?.includes('miriandpaula.com.br')) {
    return '.miriandpaula.com.br'
  }

  return null
}

/**
 * Service role · BYPASSA RLS · USAR SO em:
 * - Webhook entry points (validados por verify token)
 * - Cron jobs internos
 * - Edge functions com auth proprio
 *
 * NUNCA usar em RSC ou Server Actions de UI · sempre createServerClient acima.
 */
let _serviceClient: ServiceClient | null = null

export function createServiceRoleClient(): ServiceClient {
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
