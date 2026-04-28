/**
 * HelperText · atomo · texto auxiliar abaixo de inputs.
 * Tom mais sutil que paragraph default · 11px muted-foreground.
 */

export function HelperText({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  tone?: 'muted' | 'warning' | 'danger'
}) {
  const toneClass = {
    muted: 'text-[hsl(var(--muted-foreground))]',
    warning: 'text-[hsl(var(--warning))]',
    danger: 'text-[hsl(var(--danger))]',
  }[tone]

  return <p className={`text-[11px] leading-snug ${toneClass}`}>{children}</p>
}
