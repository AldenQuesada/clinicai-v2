/**
 * Login page · Mira.
 *
 * Server-rendered · usa Server Actions pra login (sem JS client necessario).
 * Apos login, redireciona pra ?redirect=<path> ou /dashboard (default).
 *
 * Tokens da marca Mirian · Cormorant Garamond italic + Montserrat uppercase.
 * Mirror estrutural da Lara.
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@clinicai/supabase'
import { loginAction } from './actions'

interface PageProps {
  searchParams: Promise<{ redirect?: string; error?: string }>
}

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams
  const redirectTo = params.redirect || '/dashboard'
  const errorMsg = params.error

  // Se ja logado, pula tela direto
  const cookieStore = await cookies()
  const supabase = createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options)
      })
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    redirect(redirectTo)
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-luxury-deep)]">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-block px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.3em] border border-[var(--color-champagne)]/40 text-[var(--color-champagne)] mb-6">
            Clinica AI · Mirian de Paula
          </div>
          <h1 className="text-4xl font-light leading-tight">
            <span className="font-cursive-italic text-[var(--color-champagne)]">Mira</span>
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-2">
            Painel B2B · parcerias e vouchers
          </p>
        </div>

        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="redirect" value={redirectTo} />

          <div>
            <label
              htmlFor="email"
              className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2"
            >
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-card border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-champagne)] transition-colors"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-[10px] uppercase tracking-widest text-[var(--color-text-muted)] mb-2"
            >
              Senha
            </label>
            <input
              type="password"
              id="password"
              name="password"
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-card border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text)] focus:outline-none focus:border-[var(--color-champagne)] transition-colors"
              placeholder="••••••••"
            />
          </div>

          {errorMsg && (
            <div className="px-3 py-2 rounded text-xs bg-[hsl(var(--danger))]/10 border border-[hsl(var(--danger))]/30 text-[hsl(var(--danger))]">
              {decodeURIComponent(errorMsg)}
            </div>
          )}

          <button
            type="submit"
            className="w-full mt-6 px-6 py-3 rounded-pill font-display-uppercase text-xs tracking-widest bg-[var(--color-champagne)] text-[var(--color-luxury)] hover:bg-[var(--color-champagne-soft)] transition-all hover:-translate-y-px shadow-luxury-sm hover:shadow-luxury-md"
          >
            Entrar
          </button>
        </form>

        <div className="mt-8 text-center text-[10px] text-[var(--color-text-subtle)] uppercase tracking-widest">
          {process.env.NEXT_PUBLIC_PAINEL_URL && (
            <a
              href={process.env.NEXT_PUBLIC_PAINEL_URL}
              className="hover:text-[var(--color-champagne)] transition-colors"
            >
              Voltar ao painel
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
