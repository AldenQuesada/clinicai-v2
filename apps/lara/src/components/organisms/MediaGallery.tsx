'use client'

/**
 * MediaGallery · organismo · espelha vocabulario Mira (b2b-* / luxury-card).
 *
 * Layout:
 *   - Filtros editoriais com .b2b-tab e .b2b-chip (padrao Mira)
 *   - Grid de cards · 3 cols · imagens 4:5 · cada card .luxury-card
 *   - Caption italic Cormorant · meta em b2b-text-dim
 */

import { useMemo, useState } from 'react'
import { ImageOff, Plus } from 'lucide-react'
import { MediaCard } from '@/components/molecules/MediaCard'
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
      {/* Filtros · padrao Mira (b2b-tab + b2b-chip) */}
      <div className="mb-6">
        <MediaFilters
          funnel={funnelFilter}
          onFunnelChange={setFunnelFilter}
          selectedQueixas={queixaFilter}
          onQueixasChange={setQueixaFilter}
          availableQueixas={availableQueixas}
          counts={counts}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="b2b-empty">
          {items.length === 0
            ? 'O banco está vazio. Use "Nova foto" para subir a primeira imagem.'
            : 'Nenhuma imagem bate com os filtros atuais.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <MediaCard
              key={m.id}
              media={m}
              canManage={canManage}
              onEdit={setEditingId}
              onToggleActive={toggleMediaActiveAction}
            />
          ))}
        </div>
      )}

      {/* Floating upload trigger · estilo Mira (não sticky bottom-right exagerado) */}
      {canManage && (
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="fixed bottom-6 right-6 b2b-btn b2b-btn-primary shadow-lg"
          aria-label="Nova foto"
        >
          <Plus className="w-3.5 h-3.5" />
          Nova foto
        </button>
      )}

      <MediaEditDrawer media={editingItem} onClose={() => setEditingId(null)} />
      <MediaUploadDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  )
}
