/**
 * Banco de mídias · Server Component.
 * Visual: ESPELHO da Mira (mesmo vocabulario .b2b-* / .luxury-card / .eyebrow / .font-display).
 */

import { redirect } from 'next/navigation'
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
    category: m.category,
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

export default async function MediaPage() {
  const { media, canManage } = await loadMedia()

  if (!canManage) {
    redirect('/dashboard')
  }

  return (
    <PageContainer variant="narrow">
      <PageHero
        kicker="Lara"
        title={<>Banco de <em>fotos</em></>}
        lede="Fotos antes/depois e institucionais que a Lara envia automaticamente nas conversas."
      />
      <MediaGallery items={media} canManage={canManage} />
    </PageContainer>
  )
}
