/**
 * Banco de mídias da Lara · Server Component.
 *
 * UX redesign 2026-04-28 (design-squad spec): grid de cards 4:5 com filtros
 * de funnel + queixas, edit em drawer right-side, upload em drawer right-side.
 *
 * Lara consome via RPC wa_get_media (lib/webhook/media-dispatch.ts).
 */

import { redirect } from 'next/navigation'
import { Image as ImageIcon, AlertTriangle } from 'lucide-react'
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
  const overrideCount = activeCount  // semantica: ativas = "no banco em uso"

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 py-8 lg:py-10">
        {/* ─── Page header ──────────────────────────────────────────── */}
        <header className="mb-8 flex items-start gap-4">
          <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] shadow-luxury-sm">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-light leading-tight">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">
                Banco de mídias
              </span>
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-2 leading-relaxed">
              Fotos antes/depois enviadas pela Lara ·{' '}
              <span className="text-[hsl(var(--foreground))] tabular-nums">{media.length}</span> no
              banco ·{' '}
              <span className="text-[hsl(var(--primary))] tabular-nums">{overrideCount}</span>{' '}
              ativas
            </p>
          </div>
        </header>

        {/* Helper · como Lara escolhe foto */}
        <div className="rounded-card border border-[hsl(var(--warning))]/20 bg-[hsl(var(--warning))]/5 px-4 py-3 mb-8 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
          <div className="text-xs text-[hsl(var(--foreground))] leading-relaxed">
            Lara escolhe foto pela tag <code className="px-1 rounded bg-[hsl(var(--muted))] text-[hsl(var(--accent))] font-mono text-[11px]">[FOTO:queixa]</code> que ela mesma escreve. Caption ideal:{' '}
            <em>nome + idade + assinatura</em> (ex: <q>Miriam Poppi, 52 anos · Resultado real Dra. Mirian de Paula</q>).
          </div>
        </div>

        <MediaGallery items={media} canManage={canManage} />
      </div>
    </main>
  )
}
