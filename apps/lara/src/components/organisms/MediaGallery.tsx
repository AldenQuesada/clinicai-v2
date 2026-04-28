'use client'

/**
 * MediaGallery · organismo · gallery editorial assimetrica.
 *
 * Layout:
 *   - Grid 4 colunas em xl, 3 cols em lg, 2 cols em md, 1 col em sm
 *   - Pattern de spans: hero (2x2), tall (1x2), wide (2x1), sm (1x1)
 *   - Padrao ritmico repete a cada 6 cards · 1 hero + 1 tall + 4 sm
 *
 * Filtros editoriais (chips substituem tabs admin), upload + edit drawers
 * mantidos.
 */

import { useMemo, useState } from 'react'
import { Plus, ImageOff } from 'lucide-react'
import { MediaCard, type MediaCardSize } from '@/components/molecules/MediaCard'
import { MediaFilters, type FunnelFilter } from '@/components/molecules/MediaFilters'
import { MediaEditDrawer, type MediaEditData } from '@/components/organisms/MediaEditDrawer'
import { MediaUploadDrawer } from '@/components/organisms/MediaUploadDrawer'
import { toggleMediaActiveAction } from '@/app/midia/actions'

export interface GalleryMediaItem {
  id: string
  filename: string
  url: string
  funnel: string | null
  queixas: string[]
  caption: string | null
  phase: string | null
  sort_order: number
  is_active: boolean
}

/**
 * Padrao ritmico editorial · cada bloco de 6 imagens segue:
 *   [hero=2x2] [sm] [sm]
 *              [sm] [sm]
 *   [tall=1x2] [wide=2x1] [sm]
 *              [sm]       [sm]
 *
 * Resultado: ritmo visual variado em vez de grid uniforme tedioso.
 */
function pickSize(idx: number): MediaCardSize {
  const mod = idx % 7
  if (mod === 0) return 'hero' // primeira de cada bloco
  if (mod === 5) return 'wide' // 6a posicao
  if (mod === 6) return 'tall' // 7a posicao
  return 'sm'
}

export function MediaGallery({
  items,
  canManage,
}: {
  items: GalleryMediaItem[]
  canManage: boolean
}) {
  const [funnelFilter, setFunnelFilter] = useState<FunnelFilter>('all')
  const [queixaFilter, setQueixaFilter] = useState<string[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  const counts = useMemo<Record<FunnelFilter, number>>(
    () => ({
      all: items.length,
      fullface: items.filter((m) => m.funnel === 'fullface').length,
      olheiras: items.filter((m) => m.funnel === 'olheiras').length,
      none: items.filter((m) => m.funnel !== 'fullface' && m.funnel !== 'olheiras').length,
    }),
    [items],
  )

  const availableQueixas = useMemo(() => {
    const set = new Set<string>()
    items.forEach((m) => m.queixas.forEach((q) => set.add(q)))
    return Array.from(set)
  }, [items])

  const filtered = useMemo(() => {
    return items.filter((m) => {
      if (funnelFilter === 'fullface' && m.funnel !== 'fullface') return false
      if (funnelFilter === 'olheiras' && m.funnel !== 'olheiras') return false
      if (
        funnelFilter === 'none' &&
        (m.funnel === 'fullface' || m.funnel === 'olheiras')
      ) {
        return false
      }
      if (queixaFilter.length > 0) {
        const hasAll = queixaFilter.every((q) => m.queixas.includes(q))
        if (!hasAll) return false
      }
      return true
    })
  }, [items, funnelFilter, queixaFilter])

  const editingItem = useMemo<MediaEditData | null>(() => {
    if (!editingId) return null
    return items.find((m) => m.id === editingId) ?? null
  }, [editingId, items])

  return (
    <>
      {/* Toolbar editorial · filtros + nova foto · separados por dotted divider */}
      <div
        className="reveal flex items-end justify-between gap-6 mb-12 pb-6 flex-wrap border-b border-dotted"
        style={{
          ['--reveal-delay' as string]: '480ms',
          borderColor: 'rgba(201, 169, 110, 0.25)',
        }}
      >
        <MediaFilters
          funnel={funnelFilter}
          onFunnelChange={setFunnelFilter}
          selectedQueixas={queixaFilter}
          onQueixasChange={setQueixaFilter}
          availableQueixas={availableQueixas}
          counts={counts}
        />

        {canManage && (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="group inline-flex items-center gap-2 font-[family-name:var(--font-cursive)] italic text-xl font-light text-[hsl(var(--primary))] hover:opacity-80 transition-opacity"
          >
            <Plus className="w-4 h-4 -translate-y-px transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:rotate-90" />
            <span className="border-b border-dotted border-[hsl(var(--primary))]/60 pb-px">
              nova foto
            </span>
          </button>
        )}
      </div>

      {/* Grid editorial assimetrico */}
      {filtered.length === 0 ? (
        <div className="reveal text-center py-32" style={{ ['--reveal-delay' as string]: '600ms' }}>
          <ImageOff className="w-8 h-8 mx-auto text-[hsl(var(--muted-foreground))]/40 mb-4" />
          <p className="font-[family-name:var(--font-cursive)] italic text-2xl font-light text-[hsl(var(--muted-foreground))]">
            {items.length === 0
              ? 'O banco está em branco.'
              : 'Nenhuma imagem para esses filtros.'}
          </p>
        </div>
      ) : (
        <div
          className="grid gap-x-6 gap-y-12 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          style={{ gridAutoRows: '180px' }}
        >
          {filtered.map((m, idx) => (
            <MediaCard
              key={m.id}
              media={m}
              canManage={canManage}
              size={pickSize(idx)}
              revealDelay={600 + idx * 50}
              onEdit={setEditingId}
              onToggleActive={toggleMediaActiveAction}
            />
          ))}
        </div>
      )}

      <MediaEditDrawer media={editingItem} onClose={() => setEditingId(null)} />
      <MediaUploadDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  )
}
