'use client'

/**
 * PromptSidebarItem · molecula · linha clicavel da sidebar de prompts.
 *
 * Compoe atoms: <DotIndicator>, <DiffBadge>.
 * Estado active: bg primary/10, border-left primary.
 */

import { DotIndicator } from '@/components/atoms/DotIndicator'

export function PromptSidebarItem({
  label,
  hasOverride,
  overrideLength,
  defaultLength,
  active,
  onClick,
}: {
  label: string
  hasOverride: boolean
  overrideLength: number
  defaultLength: number
  active: boolean
  onClick: () => void
}) {
  // Calcula delta % pra cor do dot · so usado pra title agora
  const deltaPct =
    hasOverride && defaultLength > 0
      ? Math.round((Math.abs(overrideLength - defaultLength) / defaultLength) * 100)
      : 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full text-left px-3 py-2 rounded-md transition-colors flex items-center gap-2.5 ${
        active
          ? 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--foreground))]'
          : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/40 hover:text-[hsl(var(--foreground))]'
      }`}
      title={hasOverride ? `Override · ${deltaPct}% diff vs default` : 'Padrão (filesystem)'}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[hsl(var(--primary))]"
        />
      )}
      <DotIndicator state={hasOverride ? 'override' : 'default'} size="xs" />
      <span className="text-xs leading-snug flex-1 truncate">{label}</span>
    </button>
  )
}
