/**
 * /campanhas/[id] · Server Component.
 *
 * Detalhes do broadcast: mensagem, midia, stats, datas, leads alvo.
 * Espelho do _renderBroadcastDetail (broadcast.ui.js linhas 621–727).
 */

import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { can } from '@/lib/permissions'
import { BroadcastDetailClient } from './BroadcastDetailClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function BroadcastDetailPage({ params }: PageProps) {
  const { id } = await params

  const { ctx, repos } = await loadServerReposContext()
  if (!can(ctx.role, 'notifications:broadcast')) {
    redirect('/dashboard')
  }

  const [listRes, statsRes] = await Promise.all([
    repos.broadcasts.list(),
    repos.broadcasts.stats(id),
  ])

  const broadcast =
    listRes.ok && listRes.data ? listRes.data.find((x) => x.id === id) : null
  if (!broadcast) {
    notFound()
  }

  const stats = statsRes.ok ? statsRes.data : null

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div className="mb-6">
          <Link
            href="/campanhas"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: 'var(--b2b-text-muted)',
              textDecoration: 'none',
              marginBottom: 12,
            }}
          >
            <ArrowLeft className="w-3 h-3" />
            Voltar para campanhas
          </Link>
          <p className="eyebrow mb-3">Painel · Lara</p>
        </div>

        <BroadcastDetailClient broadcast={broadcast} stats={stats} />
      </div>
    </main>
  )
}
