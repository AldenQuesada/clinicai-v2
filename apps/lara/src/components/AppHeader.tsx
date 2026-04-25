/**
 * AppHeader · top bar com brand + user menu.
 * Server Component · pega user via cookies do Supabase.
 */

import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@clinicai/supabase'
import { LogOut, ExternalLink } from 'lucide-react'
import { logoutAction } from '@/app/login/actions'

const PAINEL_URL = process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'

export async function AppHeader() {
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
  if (!user) return null

  // Tenta resolver nome via profiles · graceful fallback se profile nao existir
  let firstName = ''
  let role = ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile } = await (supabase.from('profiles') as any)
      .select('first_name, role')
      .eq('id', user.id)
      .maybeSingle()
    firstName = profile?.first_name ?? ''
    role = profile?.role ?? ''
  } catch {
    // ignore · profile pode nao existir em dev
  }

  const displayName = firstName || user.email?.split('@')[0] || 'Usuário'
  const initials = (firstName || user.email || 'U').slice(0, 1).toUpperCase()

  return (
    <header className="h-14 shrink-0 border-b border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] flex items-center justify-between px-5 z-20">
      <Link href="/conversas" className="flex items-center gap-3 group">
        <div className="w-8 h-8 rounded-pill bg-[hsl(var(--primary))] flex items-center justify-center text-[hsl(var(--primary-foreground))] font-bold text-sm shadow-luxury-sm">
          L
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-display-uppercase text-xs tracking-widest text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors">
            Lara
          </span>
          <span className="text-[9px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
            Clínica AI
          </span>
        </div>
      </Link>

      <div className="flex items-center gap-3">
        <Link
          href={PAINEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] uppercase tracking-widest border border-[hsl(var(--chat-border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] hover:border-[hsl(var(--primary))] transition-colors"
        >
          Painel CRM
          <ExternalLink className="w-3 h-3" />
        </Link>

        <div className="flex items-center gap-2 pl-3 border-l border-[hsl(var(--chat-border))]">
          <div className="w-8 h-8 rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] flex items-center justify-center text-xs font-bold">
            {initials}
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xs font-medium text-[hsl(var(--foreground))]">{displayName}</span>
            {role && (
              <span className="text-[9px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                {role}
              </span>
            )}
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              title="Sair"
              className="ml-2 p-2 rounded-md text-[hsl(var(--muted-foreground))] hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
