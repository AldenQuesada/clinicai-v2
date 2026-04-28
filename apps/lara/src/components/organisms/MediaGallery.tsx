'use client'

/**
 * MediaGallery · organismo · gallery + filters + drawers state.
 *
 * Hold:
 *  - filtro de funnel (single)
 *  - filtros de queixas (multi · AND logic)
 *  - drawer de edit (qual id selecionado)
 *  - drawer de upload (open/close)
 *
 * Componente mestre do /midia que costura MediaCard, MediaFilters,
 * MediaEditDrawer, MediaUploadDrawer.
 */

import { useMemo, useState } from 'react'
import { Plus, ImageOff } from 'lucide-react'
import { MediaCard } from '@/components/molecules/MediaCard'
import { MediaFilters, type FunnelFilter } from '@/components/molecules/MediaFilters'
import { MediaEditDrawer, type MediaEditData } from '@/components/organisms/MediaEditDrawer'
import { MediaUploadDrawer } from '@/components/organisms/MediaUploadDrawer'
import { Button } from '@/components/atoms/Button'
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
    const found = items.find((m) => m.id === editingId)
    return found ?? null
  }, [editingId, items])

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <MediaFilters
          funnel={funnelFilter}
          onFunnelChange={setFunnelFilter}
          selectedQueixas={queixaFilter}
          onQueixasChange={setQueixaFilter}
          availableQueixas={availableQueixas}
          counts={counts}
        />

        {canManage && (
          <Button
            type="button"
            onClick={() => setUploadOpen(true)}
            variant="gold"
            size="md"
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Nova foto
          </Button>
        )}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-[2px] border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] flex items-center justify-center text-[hsl(var(--muted-foreground))]">
            <ImageOff className="w-5 h-5" />
          </div>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {items.length === 0
              ? 'Banco vazio · use "Nova foto" pra subir a primeira'
              : 'Nenhuma foto bate com os filtros atuais'}
          </p>
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

      {/* Drawers */}
      <MediaEditDrawer media={editingItem} onClose={() => setEditingId(null)} />
      <MediaUploadDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  )
}
