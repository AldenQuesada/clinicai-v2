/**
 * Lara · middleware de auth.
 *
 * Protege todas rotas exceto webhook + cron + login + assets:
 *   - /api/webhook/whatsapp · entry point Meta · validado por verify_token
 *   - /api/cron/*           · agendado externamente · validado por header secret
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

// Rotas publicas · NUNCA exigem auth
const PUBLIC_PATHS = [
  '/login',
  '/api/auth',
  '/api/webhook',
  '/api/cron',
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
  const supabase = createMiddlewareClient(req, res)

  // getUser() valida JWT · refresh automatico se expirado
  const {
    data: { user },
  } = await supabase.auth.getUser()

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
