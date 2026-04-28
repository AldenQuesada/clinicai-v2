/**
 * QueixaTag · atomo · tag de queixa (olheiras, sulcos, flacidez, etc).
 * Versao removable usada em filtros · versao plain em cards.
 */

import { X } from 'lucide-react'

export function QueixaTag({
  label,
  selected = false,
  onRemove,
  onClick,
}: {
  label: string
  selected?: boolean
  onRemove?: () => void
  onClick?: () => void
}) {
  const base =
    'inline-flex items-center gap-1 px-2 py-1 rounded-pill text-[10px] uppercase tracking-wider font-display-uppercase transition-colors'

  const stateClass = selected
    ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
    : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]/10 hover:text-[hsl(var(--accent))]'

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${base} ${stateClass} cursor-pointer`}>
        {label}
      </button>
    )
  }

  return (
    <span className={`${base} ${stateClass}`}>
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${label}`}
          className="ml-0.5 -mr-0.5 hover:text-[hsl(var(--danger))]"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  )
}
