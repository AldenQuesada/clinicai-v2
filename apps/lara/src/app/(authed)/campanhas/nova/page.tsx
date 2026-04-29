/**
 * /campanhas/nova · Server Component.
 *
 * Pagina de criacao de broadcast. Suporta clone via ?clone=<id> que pre-preenche
 * o form com dados de um broadcast existente (reaproveitar mensagem/filtros).
 * Espelho do "bc-hist-clone-btn" do clinic-dashboard (broadcast-events.ui.js
 * linhas 745–778).
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { can } from '@/lib/permissions'
import type { BroadcastDTO } from '@clinicai/repositories'
import { PageContainer } from '@/components/page/PageContainer'
import { PageHero } from '@/components/page/PageHero'
import { BroadcastFormClient } from './BroadcastFormClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clone?: string }>
}

function broadcastToInitial(b: BroadcastDTO, isClone: boolean) {
  const tf = b.target_filter ?? {}
  return {
    name: isClone ? `${b.name} (cópia)` : b.name,
    content: b.content,
    media_url: b.media_url ?? '',
    media_caption: b.media_caption ?? '',
    media_position: b.media_position,
    filter_phase: tf.phase ?? '',
    filter_temperature: tf.temperature ?? '',
    filter_funnel: tf.funnel ?? '',
    filter_source_type: tf.source_type ?? '',
    target_queixa: tf.queixa ?? '',
    batch_size: b.batch_size,
    batch_interval_min: b.batch_interval_min,
    schedule_mode: 'now' as const,
    scheduled_at: '',
    selected_leads: [] as Array<{ id: string; nome: string; phone: string }>,
  }
}

export default async function NovaCampanhaPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const cloneId = sp.clone

  const { ctx, repos } = await loadServerReposContext()
  if (!can(ctx.role, 'notifications:broadcast')) {
    redirect('/dashboard')
  }

  let initialState: ReturnType<typeof broadcastToInitial> | undefined
  if (cloneId) {
    const list = await repos.broadcasts.list()
    if (list.ok && list.data) {
      const b = list.data.find((x) => x.id === cloneId)
      if (b) {
        initialState = broadcastToInitial(b, true)
      }
    }
  }

  return (
    <PageContainer variant="narrow">
      <PageHero
        kicker="Nova campanha"
        title={<>Editor de <em>disparo</em></>}
        lede="Compor mensagem, escolher segmento e agendar envio."
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

      <BroadcastFormClient initialState={initialState} editingId={null} />
    </PageContainer>
  )
}
