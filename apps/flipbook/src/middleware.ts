import { type NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@clinicai/supabase/middleware'

/**
 * Middleware · auth gate + CSP por request com nonce.
 *
 * Auth gate · /admin/** requer:
 *   1. usuario logado (sessao Supabase valida)
 *   2. email do usuario na FLIPBOOK_ADMIN_EMAILS allowlist (csv)
 * Se logado mas nao admin → redirect pra / com erro.
 *
 * CSP estrita em prod (script-src 'strict-dynamic' 'nonce-{...}') e
 * relaxada em dev (Turbopack/HMR exige unsafe-eval). Nonce gerado por
 * request via crypto.randomUUID e injetado em x-nonce pra Server
 * Components consumirem via headers().
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://*.supabase.co'
const SUPABASE_HOST = SUPABASE_URL.replace(/\/$/, '')
const SUPABASE_WS = SUPABASE_HOST.replace(/^https:/, 'wss:')

function buildCsp(nonce: string, isProd: boolean): string {
  // Em dev, Next/Turbopack avalia código via eval (HMR) — exige unsafe-eval.
  // Em prod, usar nonce + strict-dynamic permite só scripts originados do bootstrap autenticado.
  const scriptSrc = isProd
    ? `'self' 'nonce-${nonce}' 'strict-dynamic'`
    : "'self' 'unsafe-inline' 'unsafe-eval'"

  // Style: Tailwind 4 emite link extracted em prod. Inline crítico do Next usa nonce.
  // unsafe-inline é mantido pra style-src porque alguns componentes usam style={...} e
  // remover quebra a UI silenciosamente — risco baixo (style não executa código).
  const styleSrc = "'self' 'unsafe-inline' https://fonts.googleapis.com"

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "font-src 'self' https://fonts.gstatic.com data:",
    `connect-src 'self' ${SUPABASE_HOST} ${SUPABASE_WS}`,
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "worker-src 'self' blob:",
    "upgrade-insecure-requests",
  ].join('; ')
}

export async function middleware(request: NextRequest) {
  const isProd = process.env.NODE_ENV === 'production'

  // Nonce em base64 (16 bytes randomUUID → 22 chars base64 sem padding)
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const csp = buildCsp(nonce, isProd)

  // Propaga nonce em request header pros Server Components consumirem via headers()
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)

  // ── Auth gate (mantém comportamento original) ──
  const supabase = createMiddlewareClient(request, response)
  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  const adminPaths = ['/admin', '/settings', '/stats']
  if (adminPaths.some((p) => path === p || path.startsWith(p + '/'))) {
    if (!user) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', path)
      return NextResponse.redirect(loginUrl)
    }
    const allowlist = (process.env.FLIPBOOK_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
    if (allowlist.length > 0 && !allowlist.includes((user.email ?? '').toLowerCase())) {
      const home = new URL('/', request.url)
      home.searchParams.set('error', 'forbidden')
      return NextResponse.redirect(home)
    }
  }

  if (path === '/login' && user) {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return response
}

export const config = {
  // Exclui assets estáticos pra não gerar nonce desnecessário a cada request de imagem/font.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|pdfjs/).*)'],
}
