/**
 * Login page · Mira.
 *
 * Server-rendered · usa Server Actions pra login (sem JS client necessario).
 * Apos login, redireciona pra ?redirect=<path> ou /dashboard (default).
 *
 * Tokens da marca Mirian · Cormorant Garamond italic + Montserrat uppercase.
 * Mirror estrutural da Lara · usa apenas tokens `hsl(var(--*))`.
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@clinicai/supabase'
import { Sparkles, AlertTriangle, ExternalLink } from 'lucide-react'
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
    <main className="min-h-screen flex items-center justify-center p-6 bg-[hsl(var(--chat-bg))]">
      <div className="w-full max-w-md">
        {/* Brand mark + tagline */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] mb-6 shadow-luxury-sm">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="inline-block px-3 py-1 rounded-pill text-[10px] uppercase tracking-widest border border-[hsl(var(--primary))]/40 text-[hsl(var(--primary))] mb-6 font-display-uppercase">
            Clínica AI · Mirian de Paula
          </div>
          <h1 className="text-5xl font-light leading-tight">
            <span className="font-cursive-italic text-[hsl(var(--primary))]">Mira</span>
          </h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-3">
            Painel B2B · parcerias e vouchers
          </p>
        </div>

        {/* Card luxury */}
        <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-6 shadow-luxury-md">
          <form action={loginAction} className="space-y-5">
            <input type="hidden" name="redirect" value={redirectTo} />

            <div>
              <label
                htmlFor="email"
                className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2 font-display-uppercase"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2 font-display-uppercase"
              >
                Senha
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] transition-colors"
                placeholder="••••••••"
              />
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-md text-xs bg-[hsl(var(--danger))]/10 border border-[hsl(var(--danger))]/30 text-[hsl(var(--danger))]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{decodeURIComponent(errorMsg)}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full mt-2 px-6 py-3 rounded-pill font-display-uppercase text-xs tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all hover:-translate-y-px shadow-luxury-sm hover:shadow-luxury-md"
            >
              Entrar
            </button>
          </form>
        </div>

        {/* Footer link */}
        <div className="mt-8 text-center text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
          {process.env.NEXT_PUBLIC_PAINEL_URL && (
            <a
              href={process.env.NEXT_PUBLIC_PAINEL_URL}
              className="inline-flex items-center gap-1.5 hover:text-[hsl(var(--primary))] transition-colors"
            >
              Voltar ao painel CRM
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </main>
  )
}
