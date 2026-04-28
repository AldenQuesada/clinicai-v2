/**
 * ConfigSection · organismo · card de secao em /configuracoes.
 * CLONE do padrao Mira: .luxury-card + .b2b-form-sec header.
 *
 * Cols controla densidade dos fields filhos via .b2b-grid-2 ou b2b-grid-3.
 */

export function ConfigSection({
  eyebrow,
  title,
  description,
  cols = 2,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  cols?: 1 | 2 | 3
  children: React.ReactNode
}) {
  const gridClass = cols === 1 ? '' : cols === 2 ? 'b2b-grid-2' : 'b2b-grid-3'

  return (
    <section className="luxury-card" style={{ padding: '20px 24px 24px' }}>
      <header style={{ marginBottom: 14 }}>
        {eyebrow && <div className="b2b-form-sec" style={{ borderBottom: 'none', padding: '0 0 4px' }}>{eyebrow}</div>}
        <h2 className="b2b-sec-title" style={{ marginBottom: description ? 4 : 0 }}>
          {title}
        </h2>
        {description && (
          <p style={{ fontSize: 12, color: 'var(--b2b-text-dim)', fontStyle: 'italic', marginTop: 4 }}>
            {description}
          </p>
        )}
      </header>
      <div className={gridClass}>{children}</div>
    </section>
  )
}
