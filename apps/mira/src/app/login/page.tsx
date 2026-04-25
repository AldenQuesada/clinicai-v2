/**
 * Login page · Mira · admin tone (mirror mira-config antigo).
 *
 * Server-rendered · usa Server Actions pra login. Sem cursive italic, sem ícone
 * box gigante luxury · estilo operacional B2B · Inter only, gold accent.
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@clinicai/supabase'
import { AlertTriangle, ExternalLink } from 'lucide-react'
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
      <div className="w-full max-w-[400px]">
        {/* Brand mark · denso */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-[#C9A96E]/18 border border-[#C9A96E]/30 text-[#C9A96E] font-bold text-base mb-4">
            M
          </div>
          <h1 className="text-base font-semibold text-[#F5F0E8]">Mira</h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Admin · B2B · Clínica AI
          </p>
          <div className="mt-3 inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] bg-[#C9A96E]/15 text-[#C9A96E]">
            Mirian de Paula
          </div>
        </div>

        {/* Card flat denso */}
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
          <form action={loginAction} className="flex flex-col gap-3.5">
            <input type="hidden" name="redirect" value={redirectTo} />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                autoComplete="email"
                className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-sm focus:outline-none focus:border-[#C9A96E]/50 transition-colors"
                placeholder="seu@email.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]"
              >
                Senha
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-sm focus:outline-none focus:border-[#C9A96E]/50 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-md text-xs bg-[#EF4444]/8 border border-[#EF4444]/30 text-[#FCA5A5]">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{decodeURIComponent(errorMsg)}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full mt-1 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
            >
              Entrar
            </button>
          </form>
        </div>

        {/* Footer link */}
        <div className="mt-6 text-center text-[10px] uppercase tracking-[1.2px] text-[#6B7280]">
          {process.env.NEXT_PUBLIC_PAINEL_URL && (
            <a
              href={process.env.NEXT_PUBLIC_PAINEL_URL}
              className="inline-flex items-center gap-1.5 hover:text-[#C9A96E] transition-colors"
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
