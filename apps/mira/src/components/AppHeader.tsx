/**
 * Mira · AppHeader · top bar denso · mirror mira-config antigo.
 *
 * Server Component · pega user via cookies do Supabase. Sem cursive italic,
 * sem brand luxury · estética admin operacional B2B (Inter only, gold accent
 * suave #C9A96E, borders white/8).
 */

import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { createServerClient } from '@clinicai/supabase'
import { ProfileRepository } from '@clinicai/repositories'
import {
  LogOut,
  ExternalLink,
  LayoutDashboard,
  Handshake,
  Ticket,
  FileText,
  Settings,
} from 'lucide-react'
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

  let firstName = ''
  let role = ''
  try {
    const profiles = new ProfileRepository(supabase)
    const profile = await profiles.getById(user.id)
    firstName = profile?.firstName ?? ''
    role = profile?.role ?? ''
  } catch {
    // ignore
  }

  const displayName = firstName || user.email?.split('@')[0] || 'Usuário'
  const initials = (firstName || user.email || 'U').slice(0, 1).toUpperCase()

  const headerStore = await headers()
  const pathname = headerStore.get('x-invoke-path') ?? headerStore.get('x-pathname') ?? ''
  const isOnDashboard = pathname.startsWith('/dashboard')
  const isOnPartnerships = pathname.startsWith('/partnerships')
  const isOnVouchers = pathname.startsWith('/vouchers')
  const isOnTemplates = pathname.startsWith('/templates')
  const isOnConfig = pathname.startsWith('/configuracoes')
  const canManageConfig = !role || ['owner', 'admin'].includes(role)

  return (
    <header className="h-12 shrink-0 border-b border-white/8 bg-[hsl(var(--chat-panel-bg))] flex items-center justify-between px-5 z-20">
      <div className="flex items-center gap-5">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-md bg-[#C9A96E]/18 border border-[#C9A96E]/30 flex items-center justify-center text-[#C9A96E] font-bold text-xs">
            M
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xs font-semibold text-[#F5F5F5] group-hover:text-[#C9A96E] transition-colors">
              Mira
            </span>
            <span className="text-[9px] uppercase tracking-[1.2px] text-[#6B7280] mt-0.5">
              Admin · B2B
            </span>
          </div>
        </Link>

        <nav className="flex items-center gap-0.5">
          <NavLink href="/dashboard" icon={<LayoutDashboard className="w-3.5 h-3.5" />} active={isOnDashboard}>
            Visão geral
          </NavLink>
          <NavLink href="/partnerships" icon={<Handshake className="w-3.5 h-3.5" />} active={isOnPartnerships}>
            Parcerias
          </NavLink>
          <NavLink href="/vouchers" icon={<Ticket className="w-3.5 h-3.5" />} active={isOnVouchers}>
            Vouchers
          </NavLink>
          <NavLink href="/templates" icon={<FileText className="w-3.5 h-3.5" />} active={isOnTemplates}>
            Templates
          </NavLink>
          {canManageConfig && (
            <NavLink href="/configuracoes" icon={<Settings className="w-3.5 h-3.5" />} active={isOnConfig}>
              Config
            </NavLink>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={PAINEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-[1px] border border-white/8 text-[#9CA3AF] hover:text-[#C9A96E] hover:border-[#C9A96E]/40 transition-colors"
        >
          Painel CRM
          <ExternalLink className="w-3 h-3" />
        </Link>

        <div className="flex items-center gap-2 pl-3 border-l border-white/8">
          <div className="w-7 h-7 rounded-md bg-white/5 border border-white/8 text-[#F5F5F5] flex items-center justify-center text-[11px] font-bold">
            {initials}
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xs font-medium text-[#F5F5F5]">{displayName}</span>
            {role && (
              <span className="text-[9px] uppercase tracking-[1.2px] text-[#6B7280] mt-0.5">
                {role}
              </span>
            )}
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              title="Sair"
              className="ml-1.5 p-1.5 rounded text-[#9CA3AF] hover:text-[#FCA5A5] hover:bg-white/5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}

function NavLink({
  href,
  icon,
  active,
  children,
}: {
  href: string
  icon: React.ReactNode
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-semibold uppercase tracking-[1px] transition-colors ${
        active
          ? 'bg-[#C9A96E]/15 text-[#C9A96E]'
          : 'text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-white/5'
      }`}
    >
      {icon}
      {children}
    </Link>
  )
}
