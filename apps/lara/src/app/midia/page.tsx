/**
 * Banco de mídias da Lara · Server Component.
 * Brandbook-aligned 2026-04-28 · sem emoji, sem cursive-italic full title.
 */

import { redirect } from 'next/navigation'
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

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-12 lg:py-16">
        {/* ─── Page header · brandbook spec ────────────────────── */}
        <header className="mb-12 lg:mb-14">
          <p className="font-display-uppercase text-[10px] tracking-[0.4em] text-[hsl(var(--primary))]/80 mb-4">
            Painel · Lara
          </p>
          <h1 className="font-[family-name:var(--font-cursive)] text-5xl lg:text-6xl font-light leading-[0.95] tracking-[-0.02em] text-[hsl(var(--foreground))]">
            Banco de{' '}
            <em className="font-[family-name:var(--font-cursive)] italic font-light text-[hsl(var(--primary))]">
              imagens
            </em>
          </h1>
          <p className="text-[14px] text-[hsl(var(--muted-foreground))] mt-5 leading-[1.7] max-w-xl">
            Resultados antes/depois enviados pela Lara. Caption ideal traz nome, idade e
            assinatura — Lara escolhe a foto pela tag que ela mesma escreve.
          </p>
          <div className="mt-6 flex items-center gap-6 text-[11px] font-display-uppercase tracking-[0.2em]">
            <span className="text-[hsl(var(--muted-foreground))]">
              <span className="text-[hsl(var(--foreground))] tabular-nums">{media.length}</span>{' '}
              no banco
            </span>
            <span className="w-px h-4 bg-[hsl(var(--chat-border))]" />
            <span className="text-[hsl(var(--muted-foreground))]">
              <span className="text-[hsl(var(--primary))] tabular-nums">{activeCount}</span> ativas
            </span>
          </div>
        </header>

        <MediaGallery items={media} canManage={canManage} />
      </div>
    </main>
  )
}
