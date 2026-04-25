import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Login · Mira · Clinica AI',
}

/**
 * Layout standalone · sem AppHeader · mira/login renderiza tela cheia
 * (mirror Lara).
 */
export default function LoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
