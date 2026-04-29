/**
 * Lara · middleware de auth.
 *
 * Protege todas rotas exceto webhook + cron + cold-open + login + assets:
 *   - /api/webhook/whatsapp · entry point Meta · validado por verify_token + HMAC
 *   - /api/cron/*           · agendado externamente · validado por header secret
 *   - /api/cold-open        · push pos-quiz · validado por COLD_OPEN_SECRET / CRON_SECRET
 *   - /login                · pagina de login publica
 *   - /api/auth/*           · server actions de login/logout
 *   - _next/* · favicon · etc
 *
 * Resto exige session valida · senao redireciona pra /login com ?redirect=<destino>.
 *
 * Cookies escritos com domain '.miriandpaula.com.br' em prod · SSO cross-subdomain
 * (painel + lara + mira + app). Configurado em @clinicai/supabase/middleware.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createMiddlewareClient } from '@clinicai/supabase'

// Rotas publicas · NUNCA exigem auth (cada uma tem seu proprio guard interno)
const PUBLIC_PATHS = [
  '/login',
  '/join', // landing pra aceitar convite · valida token via RPC
  '/api/auth',
  '/api/webhook',
  '/api/cron',
  '/api/cold-open',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Permite rotas publicas direto
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const res = NextResponse.next()

  // Defensive · createMiddlewareClient pode throw se env vars faltarem ·
  // getUser() pode throw se refresh token corrupto / clock skew / network.
  // Sem catch, exception escapa → digest opaco no RSC seguinte. Tratar como
  // sessao invalida e redirecionar pra /login.
  let user = null as { id: string } | null
  try {
    const supabase = createMiddlewareClient(req, res)
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch (e) {
    console.error('[middleware] auth check failed:', (e as Error).message)
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('error', 'session_expired')
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname + req.nextUrl.search)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (!user) {
    const loginUrl = new URL('/login', req.url)
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname + req.nextUrl.search)
    }
    return NextResponse.redirect(loginUrl)
  }

  return res
}

export const config = {
  // Aplica em todas rotas exceto static assets · publicas filtradas no codigo
  // (matcher exclude · ja cobre _next + arquivos estaticos)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.svg$|.*\\.jpg$|.*\\.ico$).*)',
  ],
}
