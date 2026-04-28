/**
 * SectionHeader · molecula · cabecalho de secao no padrao brandbook.
 *
 * Spec brandbook (secao 12.1):
 *   - Eyebrow: Montserrat 600, 10-11px, UPPERCASE, letter-spacing 2.5-4px, gold
 *   - Section title: Cormorant 300, line-height 1.08, sem italic
 *   - Anti-padrao: emoji em copy institucional (secao 22)
 *
 * NAO renderiza emoji · NAO usa font-cursive-italic em titulo inteiro.
 * Italic so na palavra-ancora opcional via prop italicAnchor.
 */

export function SectionHeader({
  eyebrow,
  title,
  italicAnchor,
  description,
  meta,
}: {
  eyebrow?: string
  title: string
  italicAnchor?: string
  description?: string
  meta?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-6 pb-5 mb-6 border-b border-[hsl(var(--chat-border))]">
      <div className="flex-1 min-w-0 space-y-2.5">
        {eyebrow && (
          <p className="font-display-uppercase text-[10px] tracking-[0.25em] text-[hsl(var(--primary))]/80">
            {eyebrow}
          </p>
        )}
        <h2 className="font-[family-name:var(--font-cursive)] text-3xl font-light text-[hsl(var(--foreground))] leading-[1.08] tracking-[-0.01em]">
          {title}
          {italicAnchor && (
            <>
              {' '}
              <em className="not-italic font-[family-name:var(--font-cursive)] italic font-light text-[hsl(var(--primary))]">
                {italicAnchor}
              </em>
            </>
          )}
        </h2>
        {description && (
          <p className="text-[13px] text-[hsl(var(--muted-foreground))] leading-relaxed max-w-2xl">
            {description}
          </p>
        )}
      </div>
      {meta && <div className="shrink-0 mt-1">{meta}</div>}
    </div>
  )
}
