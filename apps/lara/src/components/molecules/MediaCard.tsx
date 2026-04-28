'use client'

/**
 * MediaCard · molecula · cartao de foto antes/depois.
 *
 * Layout: imagem 4:5 cobre 70% · footer com caption + funnel + queixas + status.
 * Hover: overlay com acoes (Editar, Toggle ativo).
 *
 * Click no card abre drawer de edit (caller passa onSelect).
 */

import { useState, useTransition } from 'react'
import { Eye, EyeOff, Pencil, Image as ImageIcon } from 'lucide-react'
import { DotIndicator } from '@/components/atoms/DotIndicator'
import { FunnelChip } from '@/components/atoms/FunnelChip'

export interface MediaCardData {
  id: string
  filename: string
  url: string
  funnel: string | null
  queixas: string[]
  caption: string | null
  is_active: boolean
}

export function MediaCard({
  media,
  canManage,
  onEdit,
  onToggleActive,
}: {
  media: MediaCardData
  canManage: boolean
  onEdit: (id: string) => void
  onToggleActive: (id: string, isActive: boolean) => Promise<void>
}) {
  const [pending, startTransition] = useTransition()
  const [imgError, setImgError] = useState(false)

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    startTransition(async () => {
      await onToggleActive(media.id, !media.is_active)
    })
  }

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit(media.id)
  }

  return (
    <article
      className={`group relative rounded-[8px] border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] overflow-hidden transition-all duration-[350ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:border-[hsl(var(--primary))]/40 hover:shadow-luxury-md hover:-translate-y-0.5 cursor-pointer ${
        media.is_active ? '' : 'opacity-60'
      }`}
      onClick={() => onEdit(media.id)}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit(media.id)
        }
      }}
    >
      {/* Imagem · aspect 4:5 (retrato natural pra antes/depois) */}
      <div className="relative aspect-[4/5] bg-[hsl(var(--muted))] overflow-hidden">
        {imgError ? (
          <div className="absolute inset-0 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
            <ImageIcon className="w-8 h-8" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.url}
            alt={media.caption || media.filename}
            loading="lazy"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        )}

        {/* Top-right · status dot · pequeno eyebrow chip · pill OK aqui (brandbook .mode-pill) */}
        <div className="absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] bg-black/45 backdrop-blur-sm border border-white/10">
          <DotIndicator state={media.is_active ? 'active' : 'inactive'} size="xs" />
          <span className="font-display-uppercase text-[9px] tracking-[0.25em] text-white/90">
            {media.is_active ? 'ativa' : 'inativa'}
          </span>
        </div>

        {/* Hover overlay · acoes */}
        {canManage && (
          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleEdit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[2px] font-display-uppercase text-[10px] tracking-[0.18em] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] border border-[hsl(var(--primary))] hover:bg-[#DFC5A0] hover:border-[#DFC5A0] transition-all duration-[350ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            >
              <Pencil className="w-3 h-3" />
              Editar
            </button>
            <button
              type="button"
              onClick={handleToggle}
              disabled={pending}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-[2px] font-display-uppercase text-[10px] tracking-[0.18em] bg-white/10 backdrop-blur-sm text-white border border-white/20 hover:bg-white/20 disabled:opacity-50 transition-all duration-[350ms] ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              title={media.is_active ? 'Desativar' : 'Ativar'}
            >
              {media.is_active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>

      {/* Footer · caption + meta */}
      <div className="p-3 space-y-2">
        <p className="text-sm text-[hsl(var(--foreground))] leading-snug line-clamp-2 min-h-[2.5rem]">
          {media.caption || (
            <span className="italic text-[hsl(var(--muted-foreground))]">sem caption</span>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <FunnelChip funnel={media.funnel} />
          {media.queixas.slice(0, 3).map((q) => (
            <span
              key={q}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-display-uppercase bg-[hsl(var(--accent))]/10 text-[hsl(var(--accent))]"
            >
              {q}
            </span>
          ))}
          {media.queixas.length > 3 && (
            <span className="text-[9px] text-[hsl(var(--muted-foreground))]">
              +{media.queixas.length - 3}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
