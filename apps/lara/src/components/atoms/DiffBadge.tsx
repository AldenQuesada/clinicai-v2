/**
 * DiffBadge · atomo · indica magnitude de diferenca entre override e default.
 *
 * Calcula porcentagem de mudanca de chars · cor escala:
 *   0       · sem override (oculto)
 *   1-10%   · muted     (mudanca pequena)
 *   10-30%  · accent    (mudanca media)
 *   30%+    · primary   (mudanca grande)
 */

export function DiffBadge({
  overrideLength,
  defaultLength,
}: {
  overrideLength: number
  defaultLength: number
}) {
  if (overrideLength === 0) return null

  const delta = overrideLength - defaultLength
  const sign = delta >= 0 ? '+' : ''
  const pct = defaultLength > 0
    ? Math.round((Math.abs(delta) / defaultLength) * 100)
    : 100

  const colorClass =
    pct >= 30
      ? 'text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
      : pct >= 10
        ? 'text-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10'
        : 'text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]'

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono tabular-nums tracking-tight ${colorClass}`}
      title={`${sign}${delta} chars vs default (${pct}%)`}
    >
      {sign}
      {delta}
    </span>
  )
}
