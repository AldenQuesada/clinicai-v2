import { type NextRequest, NextResponse } from 'next/server'
import { createMiddlewareClient } from '@clinicai/supabase/middleware'

/**
 * Auth gate · /admin/** requer:
 *   1. usuario logado (sessao Supabase valida)
 *   2. email do usuario na FLIPBOOK_ADMIN_EMAILS allowlist (csv)
 *
 * Se logado mas nao admin → redirect pra / com erro.
 */
export async function middleware(request: NextRequest) {
  const response = NextResponse.next()
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json).*)'],
}
