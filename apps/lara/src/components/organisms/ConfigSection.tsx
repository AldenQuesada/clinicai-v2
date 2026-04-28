/**
 * ConfigSection · organismo · card de secao em /configuracoes.
 *
 * Spec brandbook:
 *   - card border-radius: 8px (--radius-lg, nao 20px do tailwind rounded-card)
 *   - sem emoji em headers institucionais
 *   - eyebrow uppercase + titulo cormorant 300
 *
 * Cols controla densidade dos fields filhos.
 */

import { SectionHeader } from '@/components/molecules/SectionHeader'

export function ConfigSection({
  eyebrow,
  title,
  italicAnchor,
  description,
  cols = 2,
  children,
}: {
  eyebrow: string
  title: string
  italicAnchor?: string
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
    <section className="rounded-[8px] border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-7 lg:p-8">
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        italicAnchor={italicAnchor}
        description={description}
      />
      <div className={`grid gap-6 ${colClass}`}>{children}</div>
    </section>
  )
}
