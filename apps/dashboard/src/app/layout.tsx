import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ClinicAI · Mirian de Paula',
  description: 'Sistema de gestao da Clinica Mirian de Paula',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Montserrat:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;1,400;1,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
