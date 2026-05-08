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
  '/orcamento', // pagina publica do orcamento · share_token serve de auth
  '/legacy', // sub-app legado anamnese · token publico + RLS · ver public/legacy/
  '/api/auth',
  '/api/webhook',
  '/api/cron',
  '/api/cold-open',
  '/api/diag', // diag temporario · auth via x-diag-secret header (REMOVER apos uso)
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

/**
 * Auth/API Hardening A (2026-05-08) · /api/* sem sessao valida deve retornar
 * JSON 401, NUNCA HTML do /login. Sem isso, fetch().json() no client crasha
 * com `Unexpected token '<'` quando refresh_token rate-limita (429 Supabase
 * Auth) ou JWT expira · auditoria 2026-05-08 mapeou cascata.
 *
 * SSE (route.ts) tem auth check proprio · ja retorna 401 plain text · este
 * helper nao afeta.
 */
function isApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

function jsonUnauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: 'unauthorized', code: 'session_expired' },
    {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    },
  )
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
  // sessao invalida e redirecionar pra /login (pages) OU JSON 401 (api).
  let user = null as { id: string } | null
  try {
    const supabase = createMiddlewareClient(req, res)
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch (e) {
    console.error('[middleware] auth check failed:', (e as Error).message)
    // Auth/API Hardening A · /api/* sempre JSON · pages mantem redirect HTML
    if (isApiPath(pathname)) {
      return jsonUnauthorizedResponse()
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('error', 'session_expired')
    if (pathname !== '/') {
      loginUrl.searchParams.set('redirect', pathname + req.nextUrl.search)
    }
    return NextResponse.redirect(loginUrl)
  }

  if (!user) {
    // Auth/API Hardening A · /api/* sempre JSON · pages mantem redirect HTML
    if (isApiPath(pathname)) {
      return jsonUnauthorizedResponse()
    }
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
