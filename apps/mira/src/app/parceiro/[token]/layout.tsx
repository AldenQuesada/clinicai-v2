import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Painel do Parceiro · Clínica Mirian de Paula',
  robots: 'noindex, nofollow',
}

/**
 * Layout standalone · sem AppHeader · /parceiro/[token] renderiza tela cheia
 * (port do legacy parceiro.html).
 *
 * Tema light luxury (#F8F5F0 / champagne #B8956A / dark text #1A1A2E),
 * diferente do dark da admin · parceira abre no celular.
 */
export default function ParceiroLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
