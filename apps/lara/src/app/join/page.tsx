/**
 * /join · landing pra aceitar convite via token.
 *
 * Port do clinic-dashboard/join.html · adaptado pro tema dark luxury Mirian.
 * Server Component shell · JoinClient e onde o trabalho real acontece
 * (signIn / signUp / accept_invitation chamado client-side via Supabase).
 */

import { Suspense } from 'react'
import { JoinClient } from './JoinClient'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Aceitar convite · Lara · Clinica AI',
  robots: 'noindex, nofollow',
}

export default function JoinPage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background:
          'radial-gradient(ellipse at top, rgba(201,169,110,0.06) 0%, var(--b2b-bg-0) 70%)',
      }}
    >
      <Suspense
        fallback={
          <div style={{ color: 'var(--b2b-text-muted)', fontSize: 13 }}>
            Carregando convite...
          </div>
        }
      >
        <JoinClient />
      </Suspense>
    </main>
  )
}
