import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Assinatura Digital · Clínica Mirian de Paula',
  robots: 'noindex, nofollow',
}

/**
 * Layout standalone · sem AppHeader nem auth · /assinatura/[token].
 *
 * Pagina publica · paciente/parceira chega via link enviado no WhatsApp.
 * Tema luxury dark (champagne gold #C9A96E + dark navy #1A1A2E + Cormorant
 * Garamond), espelho da admin · garante coerencia visual mas mobile-first.
 *
 * Lei 14.063/2020 · assinatura eletronica simples (canvas + IP + UA).
 */
export default function AssinaturaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
