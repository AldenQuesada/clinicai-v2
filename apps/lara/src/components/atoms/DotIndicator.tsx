/**
 * DotIndicator · atomo · indicador visual de status (override ativo / default).
 *
 * Usos:
 *   <DotIndicator state="override" />  · sidebar de prompts
 *   <DotIndicator state="default" />   · sidebar de prompts
 *   <DotIndicator state="active" />    · cards de midia
 *   <DotIndicator state="inactive" />  · cards de midia
 */

type DotState = 'override' | 'default' | 'active' | 'inactive'

const STATE_CLASSES: Record<DotState, string> = {
  override: 'bg-[hsl(var(--primary))] shadow-[0_0_8px_oklch(0.78_0.05_75/0.5)]',
  default: 'border border-[hsl(var(--muted-foreground))]/40 bg-transparent',
  active: 'bg-[hsl(var(--success))]',
  inactive: 'border border-[hsl(var(--muted-foreground))]/40 bg-transparent',
}

export function DotIndicator({
  state,
  size = 'sm',
  className = '',
}: {
  state: DotState
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  const sizes = { xs: 'w-1.5 h-1.5', sm: 'w-2 h-2', md: 'w-2.5 h-2.5' }
  return (
    <span
      aria-hidden
      className={`inline-block rounded-full shrink-0 ${sizes[size]} ${STATE_CLASSES[state]} ${className}`}
    />
  )
}
