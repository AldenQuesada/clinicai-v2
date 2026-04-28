/**
 * FunnelChip · atomo · chip que identifica funnel (olheiras / fullface / sem).
 * Usado em cards de midia + sidebar.
 */

type Funnel = 'olheiras' | 'fullface' | string | null

const LABELS: Record<string, string> = {
  olheiras: 'olheiras',
  fullface: 'full face',
}

export function FunnelChip({ funnel }: { funnel: Funnel }) {
  if (!funnel) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[9px] uppercase tracking-widest font-display-uppercase bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
        sem funnel
      </span>
    )
  }

  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-pill text-[9px] uppercase tracking-widest font-display-uppercase bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]">
      {LABELS[funnel] ?? funnel}
    </span>
  )
}
