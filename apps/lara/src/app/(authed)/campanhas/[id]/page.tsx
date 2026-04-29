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
import { PageContainer } from '@/components/page/PageContainer'
import { PageHero } from '@/components/page/PageHero'
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

  // Lede com status + scheduled_at (italic via PageHero)
  const statusTxt = broadcast.status || ''
  const scheduledTxt = broadcast.scheduled_at
    ? new Date(broadcast.scheduled_at).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : ''
  const ledeBits = [statusTxt && `status: ${statusTxt}`, scheduledTxt && `agendado: ${scheduledTxt}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <PageContainer variant="narrow">
      <PageHero
        kicker="Campanha · detalhes"
        title={<><em>{broadcast.name || 'sem nome'}</em></>}
        lede={ledeBits || undefined}
        actions={
          <Link
            href="/campanhas"
            className="b2b-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft className="w-3 h-3" />
            Voltar
          </Link>
        }
      />

      <BroadcastDetailClient broadcast={broadcast} stats={stats} />
    </PageContainer>
  )
}
