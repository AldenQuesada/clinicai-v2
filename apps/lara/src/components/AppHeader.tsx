/**
 * AppHeader · top bar Lara · vocabulario b2b-* (espelho Mira).
 *
 * Layout: bg b2b-bg-1, border-bottom b2b-border, height 56px.
 * Brand left + nav center + actions right (notificacoes / Painel CRM / user).
 * Active nav: champagne color + underline 1px champagne (estilo subtab Mira).
 */

import Link from 'next/link'
import { cookies, headers } from 'next/headers'
import { createServerClient } from '@clinicai/supabase'
import { ProfileRepository } from '@clinicai/repositories'
import {
  LogOut,
  ExternalLink,
  LayoutDashboard,
  MessageSquare,
  Settings,
  FileText,
  Sparkles,
  Image as ImageIcon,
} from 'lucide-react'
import { logoutAction } from '@/app/login/actions'
import { NotificationToggle } from '@/components/NotificationToggle'

const PAINEL_URL = process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'

export async function AppHeader() {
  const cookieStore = await cookies()
  const supabase = createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      // Server Components NAO podem mutar cookies em Next.js 15/16 · throw.
      // Padrao Supabase SSR: silenciar · middleware ja refresh-ou o token.
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)
        })
      } catch {
        // ignore · esperado em Server Components
      }
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  let firstName = ''
  let role = ''
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profiles = new ProfileRepository(supabase as any)
    const profile = await profiles.getById(user.id)
    firstName = profile?.firstName ?? ''
    role = profile?.role ?? ''
  } catch {
    /* ignore */
  }

  const displayName = firstName || user.email?.split('@')[0] || 'Usuário'
  const initials = (firstName || user.email || 'U').slice(0, 1).toUpperCase()

  const headerStore = await headers()
  const pathname = headerStore.get('x-invoke-path') ?? headerStore.get('x-pathname') ?? ''
  const isOnDashboard = pathname.startsWith('/dashboard')
  const isOnConversas = pathname.startsWith('/conversas')
  const isOnConfig = pathname.startsWith('/configuracoes')
  const isOnTemplates = pathname.startsWith('/templates')
  const isOnPrompts = pathname.startsWith('/prompts')
  const isOnMidia = pathname.startsWith('/midia')
  const canManageConfig = !role || ['owner', 'admin'].includes(role)

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        background: 'var(--b2b-bg-1)',
        borderBottom: '1px solid var(--b2b-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        zIndex: 20,
      }}
    >
      {/* Brand + Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        <Link
          href="/dashboard"
          style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}
          className="group"
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--b2b-champagne)',
              color: 'var(--b2b-bg-0)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
              fontFamily: 'Cormorant Garamond, serif',
            }}
          >
            L
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span
              className="font-display"
              style={{
                fontSize: 18,
                fontWeight: 400,
                color: 'var(--b2b-ivory)',
                fontStyle: 'italic',
              }}
            >
              Lara
            </span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: 'var(--b2b-text-muted)',
              }}
            >
              Clínica AI
            </span>
          </div>
        </Link>

        <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <NavLink
            href="/dashboard"
            icon={<LayoutDashboard className="w-3.5 h-3.5" />}
            active={isOnDashboard}
          >
            Dashboard
          </NavLink>
          <NavLink
            href="/conversas"
            icon={<MessageSquare className="w-3.5 h-3.5" />}
            active={isOnConversas}
          >
            Conversas
          </NavLink>
          <NavLink
            href="/templates"
            icon={<FileText className="w-3.5 h-3.5" />}
            active={isOnTemplates}
          >
            Templates
          </NavLink>
          {canManageConfig && (
            <>
              <NavLink
                href="/prompts"
                icon={<Sparkles className="w-3.5 h-3.5" />}
                active={isOnPrompts}
              >
                Prompts
              </NavLink>
              <NavLink
                href="/midia"
                icon={<ImageIcon className="w-3.5 h-3.5" />}
                active={isOnMidia}
              >
                Mídias
              </NavLink>
              <NavLink
                href="/configuracoes"
                icon={<Settings className="w-3.5 h-3.5" />}
                active={isOnConfig}
              >
                Configurações
              </NavLink>
            </>
          )}
        </nav>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <NotificationToggle />

        <Link
          href={PAINEL_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="b2b-btn"
          style={{ padding: '6px 12px', fontSize: 11, gap: 6 }}
        >
          Painel CRM
          <ExternalLink className="w-3 h-3" />
        </Link>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 12,
            borderLeft: '1px solid var(--b2b-border)',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--b2b-bg-3)',
              color: 'var(--b2b-ivory)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {initials}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--b2b-ivory)' }}>
              {displayName}
            </span>
            {role && (
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: 'var(--b2b-text-muted)',
                }}
              >
                {role}
              </span>
            )}
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              title="Sair"
              style={{
                marginLeft: 8,
                padding: 6,
                background: 'transparent',
                border: 'none',
                color: 'var(--b2b-text-muted)',
                cursor: 'pointer',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--b2b-red)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--b2b-text-muted)'
              }}
            >
              <LogOut className="w-4 h-4" />
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
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        fontWeight: 600,
        color: active ? 'var(--b2b-champagne)' : 'var(--b2b-text-muted)',
        transition: 'color 0.15s',
        textDecoration: 'none',
      }}
    >
      {icon}
      {children}
      {active && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 12,
            right: 12,
            bottom: -1,
            height: 2,
            background: 'var(--b2b-champagne)',
          }}
        />
      )}
    </Link>
  )
}
