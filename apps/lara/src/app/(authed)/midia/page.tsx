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
import { PageContainer } from '@/components/page/PageContainer'
import { PageHero } from '@/components/page/PageHero'

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
  return n === 1 ? 'foto' : 'fotos'
}

export default async function MediaPage() {
  const { media, canManage } = await loadMedia()

  if (!canManage) {
    redirect('/dashboard')
  }

  const activeCount = media.filter((m) => m.is_active).length

  return (
    <PageContainer variant="narrow">
      <PageHero
        kicker="Lara"
        title={<>Banco de <em>fotos</em></>}
        lede="Fotos antes/depois que a Lara envia automaticamente nas conversas."
        actions={
          canManage ? (
            <Link href="#upload" className="b2b-btn b2b-btn-primary">
              <Plus className="w-3.5 h-3.5" />
              Nova
            </Link>
          ) : undefined
        }
      />

      {/* Head minimalista · Montserrat 8.5px tracking 0.18em (DNA /conversas) */}
      <div className="b2b-list-head">
        <div
          className="b2b-list-count"
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontSize: '9px',
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'rgba(245, 240, 232, 0.5)',
          }}
        >
          {media.length} {noun(media.length)}
          <span style={{ opacity: 0.4, margin: '0 8px' }}>·</span>
          <span style={{ color: '#C9A96E' }}>{activeCount} em uso</span>
        </div>
      </div>

      <MediaGallery items={media} canManage={canManage} />
    </PageContainer>
  )
}
