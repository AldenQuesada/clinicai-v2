/**
 * SectionHeader · molecula · cabecalho de secao com emoji + titulo + descricao.
 *
 * Padrao de marca:
 *   - emoji grande a esquerda
 *   - titulo em font-display-uppercase tracking-widest
 *   - descricao em muted-foreground
 *   - divider sutil abaixo
 */

export function SectionHeader({
  emoji,
  title,
  description,
  meta,
}: {
  emoji: string
  title: string
  description?: string
  meta?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-4 pb-4 mb-5 border-b border-[hsl(var(--chat-border))]">
      <span className="text-2xl select-none leading-none mt-0.5">{emoji}</span>
      <div className="flex-1 min-w-0">
        <h2 className="font-display-uppercase text-sm tracking-widest text-[hsl(var(--foreground))]">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1.5 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      {meta && <div className="shrink-0">{meta}</div>}
    </div>
  )
}
