/**
 * PresenceAvatars · stack horizontal de avatares dos atendentes online
 * (excluindo voce mesmo). Usado na sidebar (header de Conversas).
 *
 * P-12 multi-atendente · Fase 3 (presença) · doc do projeto.
 */

'use client'

import type { PresenceUser } from '../hooks/usePresence'

interface PresenceAvatarsProps {
  /** Online users (incluindo voce) · filtra `me` internamente */
  online: PresenceUser[]
  me: string | null
  /** Max avatares antes de virar "+N" · default 3 */
  max?: number
}

function avatarBg(userId: string): string {
  // Hash bobo do user_id pra cor consistente · 5 hues douradas/cinza
  const palette = [
    'rgba(201,169,110,0.14)',
    'rgba(167,139,250,0.14)',
    'rgba(96,165,250,0.14)',
    'rgba(110,231,183,0.14)',
    'rgba(252,211,77,0.14)',
  ]
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  return palette[hash % palette.length]
}

export function PresenceAvatars({ online, me, max = 3 }: PresenceAvatarsProps) {
  const others = online.filter((u) => u.user_id !== me)
  if (others.length === 0) return null

  const visible = others.slice(0, max)
  const overflow = others.length - visible.length

  return (
    <div
      className="flex items-center gap-0"
      title={others.map((u) => u.full_name).join(' · ')}
    >
      {visible.map((u, idx) => {
        const initial = (u.full_name || '?').trim().charAt(0).toUpperCase()
        return (
          <div
            key={u.user_id}
            className="relative shrink-0"
            style={{ marginLeft: idx === 0 ? 0 : -6 }}
          >
            {u.avatar_url ? (
              <img
                src={u.avatar_url}
                alt={u.full_name}
                className="w-5 h-5 rounded-full object-cover ring-2 ring-[hsl(var(--chat-panel-bg))]"
              />
            ) : (
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-[hsl(var(--chat-panel-bg))]"
                style={{
                  background: avatarBg(u.user_id),
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <span className="font-display italic leading-none text-[hsl(var(--primary))] text-[10px]">
                  {initial}
                </span>
              </div>
            )}
            {/* Dot verde de presença */}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))] ring-1 ring-[hsl(var(--chat-panel-bg))]"
              aria-hidden="true"
            />
          </div>
        )
      })}
      {overflow > 0 && (
        <div
          className="ml-[-6px] w-5 h-5 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center ring-2 ring-[hsl(var(--chat-panel-bg))] shrink-0"
          title={`+${overflow} online`}
        >
          <span className="font-meta text-[8.5px] tracking-[0.05em] text-[hsl(var(--muted-foreground))]">
            +{overflow}
          </span>
        </div>
      )}
    </div>
  )
}
