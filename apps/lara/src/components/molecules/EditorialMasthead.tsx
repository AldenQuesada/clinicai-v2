/**
 * EditorialMasthead · molecula · cabecalho de pagina estilo capa de revista.
 *
 * Layout:
 *   - eyebrow Montserrat 4em uppercase tracking gold
 *   - titulo principal Cormorant 300 5xl-7xl com palavra-ancora italic
 *   - sub-deck Cormorant italic light · linha unica grande como bajada de capa
 *   - dotted divider gold · separa do corpo da pagina
 *   - meta inline (contadores) com pipes editoriais
 *
 * Aplicado em /midia, /prompts, /configuracoes pra dar identidade unica.
 * Substitui os "page header" admin-pattern anteriores.
 */

export function EditorialMasthead({
  eyebrow,
  title,
  italicAnchor,
  deck,
  meta,
}: {
  eyebrow: string
  title: string
  italicAnchor?: string
  deck?: string
  meta?: { label: string; value: string | number; tone?: 'primary' | 'foreground' }[]
}) {
  return (
    <header className="mb-16 lg:mb-20">
      <div className="reveal" style={{ ['--reveal-delay' as string]: '0ms' }}>
        <p className="font-display-uppercase text-[10px] tracking-[0.5em] text-[hsl(var(--primary))]/85 mb-6">
          {eyebrow}
        </p>
      </div>

      <div className="reveal" style={{ ['--reveal-delay' as string]: '120ms' }}>
        <h1 className="font-[family-name:var(--font-cursive)] text-5xl md:text-6xl lg:text-7xl font-light leading-[0.92] tracking-[-0.025em] text-[hsl(var(--foreground))]">
          {title}
          {italicAnchor && (
            <>
              <br className="hidden md:block" />{' '}
              <em className="font-[family-name:var(--font-cursive)] italic font-light text-[hsl(var(--primary))]">
                {italicAnchor}
              </em>
            </>
          )}
        </h1>
      </div>

      {deck && (
        <div className="reveal" style={{ ['--reveal-delay' as string]: '240ms' }}>
          <p className="font-[family-name:var(--font-cursive)] italic text-xl md:text-2xl font-light leading-[1.4] text-[hsl(var(--muted-foreground))] mt-6 max-w-2xl">
            {deck}
          </p>
        </div>
      )}

      <div className="reveal mt-8 pt-6" style={{ ['--reveal-delay' as string]: '360ms' }}>
        <div
          className="border-t border-dotted h-px mb-5"
          style={{ borderColor: 'rgba(201, 169, 110, 0.35)' }}
        />
        {meta && meta.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 text-[11px] font-display-uppercase tracking-[0.25em]">
            {meta.map((m, i) => (
              <span key={i} className="text-[hsl(var(--muted-foreground))]">
                <span
                  className={`mr-2 tabular-nums ${
                    m.tone === 'primary'
                      ? 'text-[hsl(var(--primary))]'
                      : 'text-[hsl(var(--foreground))]'
                  }`}
                >
                  {m.value}
                </span>
                {m.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}
