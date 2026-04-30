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
import { toggleMediaActiveAction } from '@/app/(authed)/midia/actions'

export interface GalleryMediaItem {
  id: string
  filename: string
  url: string
  funnel: string | null
  category: string
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
      {/* Header bar · botao "+ Nova foto" CHAMPAGNE FUNCIONAL + contagem
          (substitui floating bottom-right e botao do PageHero) */}
      <div
        className="flex items-center justify-between mb-5"
        style={{
          paddingBottom: 14,
          borderBottom: '1px solid rgba(245, 240, 232, 0.06)',
        }}
      >
        <div
          style={{
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 9.5,
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'rgba(245, 240, 232, 0.5)',
          }}
        >
          {items.length} {items.length === 1 ? 'foto' : 'fotos'}
          <span style={{ opacity: 0.4, margin: '0 8px' }}>·</span>
          <span style={{ color: '#C9A96E' }}>{items.filter((m) => m.is_active).length} em uso</span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            style={{
              fontFamily: 'Montserrat, sans-serif',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              background: '#C9A96E',
              color: '#1A1814',
              border: '1px solid #C9A96E',
              padding: '9px 18px',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            aria-label="Nova foto"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Nova foto
          </button>
        )}
      </div>

      {/* Filtros */}
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
        <div
          style={{
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 18,
            fontStyle: 'italic',
            color: 'rgba(245, 240, 232, 0.45)',
            textAlign: 'center',
            padding: '60px 20px',
          }}
        >
          {items.length === 0
            ? 'Nenhuma foto ainda. Clique em "Nova foto" pra subir a primeira.'
            : 'Nenhuma foto bate com esses filtros.'}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
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

      <MediaEditDrawer media={editingItem} onClose={() => setEditingId(null)} />
      <MediaUploadDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  )
}
