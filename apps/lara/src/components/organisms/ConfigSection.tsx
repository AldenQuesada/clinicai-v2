/**
 * ConfigSection · organismo · card de secao em /configuracoes.
 * Header emoji+titulo + grid de fields filhos.
 *
 * Cols controla densidade: 1 (full width), 2 (lado a lado), 3 (3-col).
 */

import { SectionHeader } from '@/components/molecules/SectionHeader'

export function ConfigSection({
  emoji,
  title,
  description,
  cols = 2,
  children,
}: {
  emoji: string
  title: string
  description?: string
  cols?: 1 | 2 | 3
  children: React.ReactNode
}) {
  const colClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  }[cols]

  return (
    <section className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-6 shadow-luxury-sm">
      <SectionHeader emoji={emoji} title={title} description={description} />
      <div className={`grid gap-5 ${colClass}`}>{children}</div>
    </section>
  )
}
