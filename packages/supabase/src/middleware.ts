/**
 * Supabase client pra Next.js middleware · valida session via cookies.
 *
 * Usado em apps/<x>/src/middleware.ts pra proteger rotas autenticadas
 * antes do RSC executar. Quando session expira, refresh acontece
 * automaticamente · novos cookies sao setados no NextResponse.
 */

import { createServerClient as createSSRServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

interface CookieToSet {
  name: string
  value: string
  options?: Record<string, unknown>
}

/**
 * Cria client Supabase pra usar dentro de Next.js middleware.
 * Caller passa req e res · cookies sao lidos do req e escritos no res
 * automaticamente quando session refresh acontece.
 *
 * Exemplo de uso:
 *   import { createMiddlewareClient } from '@clinicai/supabase'
 *   export async function middleware(req: NextRequest) {
 *     const res = NextResponse.next()
 *     const supabase = createMiddlewareClient(req, res)
 *     const { data: { user } } = await supabase.auth.getUser()
 *     if (!user) return NextResponse.redirect(new URL('/login', req.url))
 *     return res
 *   }
 */
export function createMiddlewareClient(
  req: NextRequest,
  res: NextResponse,
): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Supabase config faltando · NEXT_PUBLIC_SUPABASE_URL/ANON_KEY')
  }

  return createSSRServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // Adiciona domain compartilhado em prod (SSO cross-subdomain)
        const sharedDomain = getSharedCookieDomainMiddleware()
        cookiesToSet.forEach(({ name, value, options }: CookieToSet) => {
          req.cookies.set(name, value)
          const enrichedOpts = sharedDomain
            ? { ...(options || {}), domain: sharedDomain }
            : (options as Parameters<typeof res.cookies.set>[2])
          res.cookies.set(
            name,
            value,
            enrichedOpts as Parameters<typeof res.cookies.set>[2],
          )
        })
      },
    },
  })
}

function getSharedCookieDomainMiddleware(): string | null {
  const override = process.env.AUTH_COOKIE_DOMAIN
  if (override) return override
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl?.includes('miriandpaula.com.br')) {
    return '.miriandpaula.com.br'
  }
  return null
}
