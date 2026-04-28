'use client'

/**
 * MediaCard · molecula · cartao de foto · estilo Mira (.luxury-card).
 *
 * - Card .luxury-card · bg b2b-bg-1, border b2b-border, hover border-strong
 * - Imagem aspect 4:5 (retrato natural pra antes/depois)
 * - Caption Cormorant italic + meta uppercase tracking
 * - Hover overlay simples com .b2b-btn pra acoes
 */

import { useState, useTransition } from 'react'
import { Eye, EyeOff, Pencil, Image as ImageIcon } from 'lucide-react'

export interface MediaCardData {
  id: string
  filename: string
  url: string
  funnel: string | null
  queixas: string[]
  caption: string | null
  is_active: boolean
}

function parseCaption(raw: string | null): { primary: string; secondary: string | null } {
  if (!raw) return { primary: 'Sem caption', secondary: null }
  const parts = raw.split(/\s*·\s*/)
  if (parts.length >= 2) return { primary: parts[0], secondary: parts.slice(1).join(' · ') }
  return { primary: parts[0], secondary: null }
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

  const cap = parseCaption(media.caption)

  return (
    <article
      className={`luxury-card overflow-hidden cursor-pointer group ${
        media.is_active ? '' : 'opacity-50'
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
      {/* Imagem · aspect 4:5 retrato */}
      <div className="relative aspect-[4/5] bg-[var(--b2b-bg-2)] overflow-hidden">
        {imgError ? (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--b2b-text-muted)]">
            <ImageIcon className="w-8 h-8 opacity-50" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.url}
            alt={cap.primary}
            loading="lazy"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        )}

        {/* Status pill no canto · padrao Mira (.b2b-pill) */}
        <div className="absolute top-3 right-3">
          <span
            className={`b2b-pill ${
              media.is_active ? 'b2b-pill-tier' : ''
            }`}
            style={{ backdropFilter: 'blur(6px)' }}
          >
            {media.is_active ? 'em uso' : 'arquivada'}
          </span>
        </div>

        {/* Hover overlay com acoes · b2b-btn */}
        {canManage && (
          <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleEdit}
              className="b2b-btn b2b-btn-primary"
              style={{ padding: '6px 12px', fontSize: '11px' }}
            >
              <Pencil className="w-3 h-3" />
              Editar
            </button>
            <button
              type="button"
              onClick={handleToggle}
              disabled={pending}
              className="b2b-btn"
              style={{ padding: '6px 10px', fontSize: '11px' }}
              title={media.is_active ? 'Arquivar' : 'Reativar'}
            >
              {media.is_active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>

      {/* Footer · caption Cormorant + meta */}
      <div className="p-4">
        <p className="font-display text-[20px] leading-tight text-[var(--b2b-ivory)] italic font-normal">
          {cap.primary}
        </p>
        {cap.secondary && (
          <p className="text-[11px] text-[var(--b2b-text-muted)] uppercase tracking-[1.5px] mt-1.5">
            {cap.secondary}
          </p>
        )}
        {media.queixas.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {media.queixas.slice(0, 4).map((q) => (
              <span key={q} className="b2b-pill">
                {q}
              </span>
            ))}
            {media.queixas.length > 4 && (
              <span className="b2b-pill">+{media.queixas.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
