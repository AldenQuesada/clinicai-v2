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
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div className="mb-8">
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
          <h1 className="font-display text-[40px] leading-tight text-[var(--b2b-ivory)]">
            Nova <em>campanha</em>
          </h1>
          <p
            className="text-[13px] text-[var(--b2b-text-dim)] italic mt-2 max-w-2xl"
          >
            {cloneId
              ? 'Reaproveite uma campanha anterior · ajuste o necessário e dispare.'
              : 'Crie um disparo manual · escolha segmentação, redija a mensagem e agende ou envie agora.'}
          </p>
        </div>

        <BroadcastFormClient initialState={initialState} editingId={null} />
      </div>
    </main>
  )
}
