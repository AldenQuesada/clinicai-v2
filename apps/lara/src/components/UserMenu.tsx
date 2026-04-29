'use client'

/**
 * UserMenu · avatar + dropdown (Meu Perfil · Alterar Senha · Configurações · Sair).
 *
 * Clone do clinic-dashboard (linhas 234-239 de index.html). Click no
 * avatar abre dropdown alinhado a direita. Click fora fecha.
 *
 * Modais (MyProfileModal, ChangePasswordModal) entram no Commit 2.
 * Por agora "Meu Perfil" e "Alterar Senha" abrem placeholders ·
 * Configurações link direto · Sair via form action.
 */

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { User, Lock, Settings, LogOut, ChevronDown } from 'lucide-react'
import { logoutAction } from '@/app/login/actions'
import { ROLE_LABELS, type StaffRole } from '@/lib/permissions'
import { MyProfileModal } from './user-menu/MyProfileModal'
import { ChangePasswordModal } from './user-menu/ChangePasswordModal'

export interface UserMenuProfile {
  id: string
  displayName: string
  email: string
  firstName: string
  lastName: string
  initials: string
  role: StaffRole | null
}

export function UserMenu({ user }: { user: UserMenuProfile }) {
  const [open, setOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open])

  return (
    <>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 6px 4px 4px',
            background: open ? 'rgba(201,169,110,0.06)' : 'transparent',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            color: 'var(--b2b-ivory)',
            fontFamily: 'inherit',
            transition: 'background 0.15s',
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
            {user.initials}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1, textAlign: 'left' }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--b2b-ivory)' }}>
              {user.displayName}
            </span>
            {user.role && (
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  color: 'var(--b2b-text-muted)',
                }}
              >
                {ROLE_LABELS[user.role]}
              </span>
            )}
          </div>
          <ChevronDown
            className="w-3 h-3"
            style={{
              color: 'var(--b2b-text-muted)',
              transition: 'transform 0.15s',
              transform: open ? 'rotate(180deg)' : 'rotate(0)',
            }}
          />
        </button>

        {open && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              right: 0,
              minWidth: 240,
              background: 'var(--b2b-bg-1)',
              border: '1px solid var(--b2b-border)',
              borderRadius: 8,
              boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
              padding: 4,
              zIndex: 1100,
            }}
          >
            {/* Header · nome + email + role */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--b2b-border)' }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--b2b-ivory)',
                  marginBottom: 2,
                }}
              >
                {user.displayName}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--b2b-text-muted)',
                  wordBreak: 'break-all',
                }}
              >
                {user.email}
              </div>
              {user.role && (
                <span
                  className="b2b-pill"
                  style={{
                    background: 'rgba(201,169,110,0.15)',
                    color: 'var(--b2b-champagne)',
                    marginTop: 6,
                  }}
                >
                  {ROLE_LABELS[user.role]}
                </span>
              )}
            </div>

            <MenuItem
              icon={<User className="w-3.5 h-3.5" />}
              iconBg="rgba(201,169,110,0.15)"
              iconColor="var(--b2b-champagne)"
              label="Meu Perfil"
              onClick={() => {
                setOpen(false)
                setProfileOpen(true)
              }}
            />
            <MenuItem
              icon={<Lock className="w-3.5 h-3.5" />}
              iconBg="rgba(96,165,250,0.15)"
              iconColor="#60A5FA"
              label="Alterar Senha"
              onClick={() => {
                setOpen(false)
                setPasswordOpen(true)
              }}
            />
            <MenuItemLink
              icon={<Settings className="w-3.5 h-3.5" />}
              iconBg="rgba(167,139,250,0.15)"
              iconColor="#A78BFA"
              label="Configurações"
              href="/configuracoes"
              onClick={() => setOpen(false)}
            />

            <div style={{ borderTop: '1px solid var(--b2b-border)', margin: '4px 0' }} />

            <form action={logoutAction}>
              <button
                type="submit"
                role="menuitem"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 12,
                  color: 'var(--b2b-red)',
                  borderRadius: 4,
                  transition: 'background 0.15s',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = 'rgba(217,122,122,0.10)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    background: 'rgba(217,122,122,0.15)',
                    color: 'var(--b2b-red)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <LogOut className="w-3.5 h-3.5" />
                </span>
                Sair
              </button>
            </form>
          </div>
        )}
      </div>

      {profileOpen && (
        <MyProfileModal user={user} onClose={() => setProfileOpen(false)} />
      )}
      {passwordOpen && <ChangePasswordModal onClose={() => setPasswordOpen(false)} />}
    </>
  )
}

function MenuItem({
  icon,
  iconBg,
  iconColor,
  label,
  onClick,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 10px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 12,
        color: 'var(--b2b-ivory)',
        borderRadius: 4,
        transition: 'background 0.15s',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          background: iconBg,
          color: iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </span>
      {label}
    </button>
  )
}

function MenuItemLink({
  icon,
  iconBg,
  iconColor,
  label,
  href,
  onClick,
}: {
  icon: React.ReactNode
  iconBg: string
  iconColor: string
  label: string
  href: string
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 10px',
        background: 'transparent',
        textDecoration: 'none',
        fontFamily: 'inherit',
        fontSize: 12,
        color: 'var(--b2b-ivory)',
        borderRadius: 4,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 4,
          background: iconBg,
          color: iconColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </span>
      {label}
    </Link>
  )
}
