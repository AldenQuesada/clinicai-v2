/**
 * Root layout · Mira.
 *
 * Mira = WhatsApp B2B + admin assistant. UI mínima nessa P0 (só placeholder
 * dashboard). Toda a logica vive em /api/webhook/evolution.
 *
 * Re-skin compartilhado · usa tokens da marca via @clinicai/ui (importado em
 * globals.css).
 */

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mira · Clinica AI · Mirian de Paula',
  description: 'Assistente Mira · WhatsApp B2B (parceiras) e admin (agenda/financeiro)',
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
