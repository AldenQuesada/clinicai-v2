/**
 * Root layout · Lara.
 * Carrega tokens da marca via @clinicai/ui (importado no globals.css).
 * Fontes: Inter (sans), Montserrat (display), Cormorant Garamond (cursive).
 *
 * Audit 2026-05-06 · runtime config injection:
 *   NEXT_PUBLIC_SUPABASE_URL/ANON_KEY são lidos do process.env em REQUEST
 *   TIME (server component dinâmico) e injetados em window.__SUPABASE_CONFIG__
 *   via inline <script>. Isso bypassa o build-time embed do Webpack que
 *   exigia ARG NEXT_PUBLIC_* no Dockerfile + Build Args no Easypanel.
 *   browser.ts (createBrowserClient) lê window.__SUPABASE_CONFIG__ first,
 *   process.env como fallback. Ambos são valores PUBLIC by design (anon
 *   key respeita RLS · URL é endpoint público).
 */

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lara · Clinica AI · Mirian de Paula',
  description: 'Painel de conversas WhatsApp · IA conversacional pra atendimento de pacientes',
  robots: 'noindex, nofollow',
}

// Forçar render dinâmico · garante process.env lido em runtime (não build time)
// pra que NEXT_PUBLIC_* injetadas pelo Easypanel cheguem na página.
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Server-side · runtime · process.env vem do container Easypanel
  const supabaseConfigJson = JSON.stringify({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  })

  return (
    <html lang="pt-BR" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Montserrat:wght@400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;1,400;1,500&display=swap"
          rel="stylesheet"
        />
        {/*
          Inline runtime config · escapado via JSON.stringify · CSP atual
          permite 'unsafe-inline' em script-src. Lido por
          packages/supabase/src/browser.ts em createBrowserClient().
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__SUPABASE_CONFIG__=${supabaseConfigJson};`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
