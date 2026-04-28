/**
 * Banco de mídias · Server Component editorial.
 *
 * Brandbook v2.0 + frontend-design skill (Anthropic):
 *   - Atmosfera com noise + gradient mesh subtle (wraps em .editorial-atmosphere)
 *   - Masthead estilo capa de revista (Cormorant 5xl + italic anchor + deck italic)
 *   - Grid assimetrico magazine-style (hero/wide/tall/sm spans)
 *   - Stagger reveal 1.1s · brandbook §14
 *   - Signature gold line vertical na borda esquerda (no body via globals.css)
 */

import { redirect } from 'next/navigation'
import { loadServerReposContext } from '@/lib/repos'
import { MediaGallery, type GalleryMediaItem } from '@/components/organisms/MediaGallery'
import { EditorialMasthead } from '@/components/molecules/EditorialMasthead'
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
  const { ctx, repos } = await loadServerReposContext()
  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)
  const dtos = await repos.mediaBank.listAll(ctx.clinic_id)
  return { media: dtos.map(toView), canManage }
}

export default async function MediaPage() {
  const { media, canManage } = await loadMedia()

  if (!canManage) {
    redirect('/dashboard')
  }

  const activeCount = media.filter((m) => m.is_active).length

  return (
    <main className="editorial-atmosphere flex-1 overflow-y-auto custom-scrollbar">
      <div className="relative z-10 max-w-7xl mx-auto px-8 lg:px-16 py-16 lg:py-24">
        <EditorialMasthead
          eyebrow="Banco de imagens · Lara"
          title="Resultados"
          italicAnchor="da clínica"
          deck="Fotos antes-depois enviadas pela Lara durante as conversas. Caption com nome, idade e assinatura · Lara escolhe pela tag que ela mesma escreve."
          meta={[
            { label: 'imagens', value: media.length, tone: 'foreground' },
            { label: 'em uso', value: activeCount, tone: 'primary' },
            {
              label: 'arquivadas',
              value: media.length - activeCount,
              tone: 'foreground',
            },
          ]}
        />

        <MediaGallery items={media} canManage={canManage} />
      </div>
    </main>
  )
}
