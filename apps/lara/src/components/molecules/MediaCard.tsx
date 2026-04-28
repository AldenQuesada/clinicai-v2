'use client'

/**
 * MediaCard · molecula · cartao editorial · suporta spans assimetricos.
 *
 * Layout (asymmetric grid):
 *   - default 1x1 (size='sm')
 *   - 2x1 horizontal (size='wide')
 *   - 1x2 vertical (size='tall')
 *   - 2x2 hero (size='hero')
 *
 * Caption em estilo magazine (italic Cormorant + dash + uppercase),
 * NAO mais empilhado retangular admin.
 */

import { useState, useTransition } from 'react'
import { Eye, EyeOff, Pencil, Image as ImageIcon } from 'lucide-react'
import { MagazineCaption } from '@/components/atoms/MagazineCaption'

export interface MediaCardData {
  id: string
  filename: string
  url: string
  funnel: string | null
  queixas: string[]
  caption: string | null
  is_active: boolean
}

export type MediaCardSize = 'sm' | 'wide' | 'tall' | 'hero'

const SIZE_CLASSES: Record<MediaCardSize, string> = {
  sm: 'col-span-1 row-span-1',
  wide: 'col-span-2 row-span-1',
  tall: 'col-span-1 row-span-2',
  hero: 'col-span-2 row-span-2',
}

const ASPECT_CLASSES: Record<MediaCardSize, string> = {
  sm: 'aspect-[4/5]',
  wide: 'aspect-[16/9]',
  tall: 'aspect-[3/5]',
  hero: 'aspect-square',
}

function parseCaption(raw: string | null): { primary: string; secondary: string | null } {
  if (!raw) return { primary: 'Sem caption', secondary: null }
  // Pattern: "Miriam Poppi, 52 anos · Resultado real Dra. Mirian de Paula"
  const parts = raw.split(/\s*·\s*/)
  if (parts.length >= 2) {
    return { primary: parts[0], secondary: parts.slice(1).join(' · ') }
  }
  // Pattern: "Miriam Poppi, 52 anos"
  return { primary: parts[0], secondary: null }
}

export function MediaCard({
  media,
  canManage,
  size = 'sm',
  revealDelay = 0,
  onEdit,
  onToggleActive,
}: {
  media: MediaCardData
  canManage: boolean
  size?: MediaCardSize
  revealDelay?: number
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
    <figure
      className={`reveal group relative ${SIZE_CLASSES[size]} ${
        media.is_active ? '' : 'opacity-50'
      }`}
      style={{ ['--reveal-delay' as string]: `${revealDelay}ms` }}
    >
      <article
        onClick={() => onEdit(media.id)}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onEdit(media.id)
          }
        }}
        className="relative cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-4 focus-visible:ring-offset-transparent"
      >
        {/* Imagem · sem border-radius cliche · borda sutil dotted */}
        <div
          className={`relative ${ASPECT_CLASSES[size]} bg-[hsl(var(--muted))] overflow-hidden transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)]`}
        >
          {imgError ? (
            <div className="absolute inset-0 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
              <ImageIcon className="w-10 h-10 opacity-50" />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.url}
              alt={cap.primary}
              loading="lazy"
              onError={() => setImgError(true)}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-[1.04]"
            />
          )}

          {/* Linha gold no canto inferior esquerdo · signature do hover */}
          <span
            className="absolute left-0 bottom-0 h-px bg-[hsl(var(--primary))] origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
            style={{ width: '40%' }}
            aria-hidden
          />

          {/* Status no canto superior direito · italic Cormorant pequeno */}
          <div className="absolute top-3 right-3">
            <span
              className={`font-[family-name:var(--font-cursive)] italic text-[11px] font-light tracking-wide ${
                media.is_active ? 'text-[hsl(var(--primary))]' : 'text-white/60'
              }`}
              style={{ textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}
            >
              {media.is_active ? 'em uso' : 'arquivada'}
            </span>
          </div>

          {/* Hover overlay · acoes em italic minimalista */}
          {canManage && (
            <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-[#0F0D0A]/85 via-[#0F0D0A]/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 flex items-end justify-between gap-3">
              <button
                type="button"
                onClick={handleEdit}
                className="font-[family-name:var(--font-cursive)] italic text-base text-[hsl(var(--primary))] hover:underline underline-offset-4 decoration-1"
              >
                <Pencil className="inline w-3 h-3 mr-1.5 -translate-y-px" aria-hidden />
                editar
              </button>
              <button
                type="button"
                onClick={handleToggle}
                disabled={pending}
                className="font-[family-name:var(--font-cursive)] italic text-base text-white/80 hover:text-[hsl(var(--primary))] disabled:opacity-50"
                title={media.is_active ? 'Arquivar' : 'Reativar'}
              >
                {media.is_active ? (
                  <>
                    <EyeOff className="inline w-3 h-3 mr-1.5 -translate-y-px" aria-hidden />
                    arquivar
                  </>
                ) : (
                  <>
                    <Eye className="inline w-3 h-3 mr-1.5 -translate-y-px" aria-hidden />
                    reativar
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Caption magazine · italic + dash · fora da imagem */}
        <div className="pt-4 pb-2">
          <MagazineCaption primary={cap.primary} secondary={cap.secondary ?? undefined} />
          {media.queixas.length > 0 && (
            <p className="mt-2 font-display-uppercase text-[9px] tracking-[0.3em] text-[hsl(var(--muted-foreground))]/70">
              {media.queixas.slice(0, 4).join(' · ')}
              {media.queixas.length > 4 ? ` · +${media.queixas.length - 4}` : ''}
            </p>
          )}
        </div>
      </article>
    </figure>
  )
}
