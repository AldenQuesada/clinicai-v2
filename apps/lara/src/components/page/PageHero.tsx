/**
 * PageHero · cabeçalho canônico de toda página authed da Lara.
 *
 * Padrão visual unificado (mirror flipbook-auditoria · pedido user 2026-04-29):
 *   - kicker uppercase letterspacing 3 gold (eyebrow)
 *   - h1 Cormorant Garamond 300 · clamp(32-44px) · <em> palavra-chave gold
 *   - lede Cormorant italic 16px · text-dim · max-width 620
 *   - actions slot (right-aligned · botões secundários/primary)
 *
 * Usar em TODAS as pages. Substitui os hero ad-hoc com `b2b-page-container`.
 */

import type { ReactNode } from 'react'

export function PageHero({
  kicker,
  title,
  lede,
  actions,
}: {
  /** Texto pequeno uppercase acima do título · ex: "Painel · Configurações" */
  kicker: string
  /**
   * Título principal · use <em>palavra-chave</em> pra destacar em italic gold.
   * Pode ser string simples ou ReactNode com tags inline.
   */
  title: ReactNode
  /** Lede curto explicando a página · italic em Cormorant */
  lede?: ReactNode
  /** Slot direita · botões/links/badges no nível do título */
  actions?: ReactNode
}) {
  return (
    <header
      style={{
        marginBottom: 36,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 20,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="eyebrow" style={{ marginBottom: 10, fontSize: 10, letterSpacing: 3 }}>
          {kicker}
        </p>
        <h1
          className="font-display"
          style={{
            fontSize: 'clamp(32px, 4vw, 44px)',
            lineHeight: 1.05,
            color: 'var(--b2b-ivory)',
            marginBottom: lede ? 12 : 0,
            fontWeight: 300,
          }}
        >
          {title}
        </h1>
        {lede && (
          <p
            className="font-display"
            style={{
              fontSize: 16,
              fontStyle: 'italic',
              color: 'var(--b2b-text-dim)',
              maxWidth: 620,
              lineHeight: 1.5,
            }}
          >
            {lede}
          </p>
        )}
      </div>
      {actions && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 0,
            paddingTop: 4,
          }}
        >
          {actions}
        </div>
      )}
    </header>
  )
}
