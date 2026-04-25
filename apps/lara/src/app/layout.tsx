/**
 * Root layout · Lara.
 * Carrega tokens da marca via @clinicai/ui (importado no globals.css).
 * Fontes: Inter (sans), Montserrat (display), Cormorant Garamond (cursive).
 */

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lara · Clinica AI · Mirian de Paula',
  description: 'Painel de conversas WhatsApp · IA conversacional pra atendimento de pacientes',
  robots: 'noindex, nofollow',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Montserrat:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;1,400;1,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
