/**
 * Banco de mídias · Server Component.
 * Visual: ESPELHO da Mira (mesmo vocabulario .b2b-* / .luxury-card / .eyebrow / .font-display).
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { MediaGallery, type GalleryMediaItem } from '@/components/organisms/MediaGallery'
import type { WaMediaBankDTO } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

function toView(m: WaMediaBankDTO): GalleryMediaItem {
  return {
    id: m.id,
    filename: m.filename,
    url: m.url,
    funnel: m.funnel,
    queixas: m.queixas,
    caption: m.caption,
    phase: m.phase,
    sort_order: m.sortOrder,
    is_active: m.isActive,
  }
}

async function loadMedia(): Promise<{ media: GalleryMediaItem[]; canManage: boolean }> {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)
    const dtos = await repos.mediaBank.listAll(ctx.clinic_id)
    return { media: dtos.map(toView), canManage }
  } catch (e) {
    console.error('[/midia] loadMedia failed:', (e as Error).message, (e as Error).stack)
    return { media: [], canManage: false }
  }
}

function noun(n: number) {
  return n === 1 ? 'imagem' : 'imagens'
}

export default async function MediaPage() {
  const { media, canManage } = await loadMedia()

  if (!canManage) {
    redirect('/dashboard')
  }

  const activeCount = media.filter((m) => m.is_active).length

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        {/* Page heading · Cormorant + eyebrow (padrão Mira) */}
        <div className="mb-8">
          <p className="eyebrow mb-3">Painel · Lara</p>
          <h1 className="font-display text-[40px] leading-tight text-[var(--b2b-ivory)]">
            Banco de <em>imagens</em>
          </h1>
          <p className="text-[13px] text-[var(--b2b-text-dim)] italic mt-2 max-w-2xl">
            Resultados antes-depois enviados pela Lara durante as conversas.
            Caption com nome, idade e assinatura — Lara escolhe pela tag que ela mesma escreve.
          </p>
        </div>

        {/* Head: count + actions */}
        <div className="b2b-list-head">
          <div className="b2b-list-count">
            {media.length} {noun(media.length)} ·{' '}
            <span style={{ color: 'var(--b2b-champagne)' }}>{activeCount} em uso</span>
          </div>
          {canManage && (
            <div className="b2b-list-head-acts">
              <Link href="#upload" className="b2b-btn b2b-btn-primary">
                <Plus className="w-3.5 h-3.5" />
                Nova foto
              </Link>
            </div>
          )}
        </div>

        <MediaGallery items={media} canManage={canManage} />
      </div>
    </main>
  )
}
