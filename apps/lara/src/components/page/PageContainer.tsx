/**
 * PageContainer · wrapper canônico de toda página authed da Lara.
 *
 * Substitui `b2b-page-container` (1640px canto-a-canto) pelo padrão
 * narrow "longform" (1100px) ou wide (1320px), padding generoso, gradient sutil.
 *
 * Usar em TODAS as pages após o PageHero.
 *   <main className="...">
 *     <PageContainer>
 *       <PageHero ... />
 *       {conteúdo}
 *     </PageContainer>
 *   </main>
 *
 * Variants:
 *   narrow (1100px) · forms simples, observacao
 *   wide   (1320px) · tabelas densas, forms com sub-nav longo (configuracoes/clinica)
 */

import type { ReactNode } from 'react'

export function PageContainer({
  children,
  variant = 'narrow',
}: {
  children: ReactNode
  /** narrow=1100 (forms simples) · wide=1320 (tabelas + sub-nav longo) */
  variant?: 'narrow' | 'wide'
}) {
  const maxWidth = variant === 'wide' ? 1320 : 1100
  return (
    <main
      className="flex-1 overflow-y-auto custom-scrollbar"
      style={{
        background: 'var(--b2b-bg-0)',
        backgroundImage:
          'radial-gradient(circle at 20% 0%, rgba(201,169,110,0.04), transparent 60%), radial-gradient(circle at 90% 80%, rgba(201,169,110,0.02), transparent 50%)',
      }}
    >
      <div style={{ maxWidth, margin: '0 auto', padding: '40px 28px 72px' }}>
        {children}
      </div>
    </main>
  )
}
