/**
 * PresenceLine · linha minima "X está vendo · Y digitando..." no header
 * do chat (logo abaixo do nome do paciente).
 *
 * P-12 multi-atendente · Fase 3 (presença) + Fase 4 (typing).
 *
 * Aparece só quando ha outros atendentes vendo a conversa (>0 viewers
 * filtrando o `me`). Pulsa em champagne quando alguem digita.
 */

'use client'

import type { PresenceUser } from '../hooks/usePresence'

interface PresenceLineProps {
  online: PresenceUser[]
  me: string | null
}

function joinNames(names: string[], max = 2): string {
  if (names.length === 0) return ''
  if (names.length <= max) return names.join(' · ')
  const first = names.slice(0, max)
  const rest = names.length - max
  return `${first.join(' · ')} +${rest}`
}

export function PresenceLine({ online, me }: PresenceLineProps) {
  const others = online.filter((u) => u.user_id !== me)
  if (others.length === 0) return null

  const typing = others.filter((u) => u.typing === true)
  const viewers = others // todos contam como vendo

  const viewerNames = viewers.map((u) => (u.full_name || '').trim().split(/\s+/)[0] || u.full_name)
  const typingNames = typing.map((u) => (u.full_name || '').trim().split(/\s+/)[0] || u.full_name)

  return (
    <span className="font-meta uppercase text-[8.5px] tracking-[0.16em] text-[hsl(var(--muted-foreground))] opacity-80 inline-flex items-center gap-2 mt-0.5 truncate">
      <span className="inline-block w-1 h-1 rounded-full bg-[hsl(var(--success))]" />
      <span className="truncate">
        {joinNames(viewerNames)} <span className="opacity-60 normal-case font-display italic">vendo</span>
      </span>
      {typing.length > 0 && (
        <>
          <span className="opacity-40">·</span>
          <span className="inline-flex items-center gap-1.5 text-[hsl(var(--primary))]">
            <span className="truncate">
              {joinNames(typingNames)} <span className="opacity-70 normal-case font-display italic">digitando</span>
            </span>
            <span className="inline-flex gap-[2px]">
              <span className="w-[3px] h-[3px] rounded-full bg-[hsl(var(--primary))] animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-[3px] h-[3px] rounded-full bg-[hsl(var(--primary))] animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-[3px] h-[3px] rounded-full bg-[hsl(var(--primary))] animate-pulse" style={{ animationDelay: '300ms' }} />
            </span>
          </span>
        </>
      )}
    </span>
  )
}
