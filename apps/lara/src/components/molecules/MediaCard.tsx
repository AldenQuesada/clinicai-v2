'use client'

/**
 * MediaCard · cartão de foto · DNA design v2
 * (Cormorant regular pra captions · Montserrat 8.5px tracking 0.18em pra
 *  metadata · linhas finas border-white/[0.06] · champagne em destaques).
 *
 * - Imagem 1:1 object-contain · não corta rosto
 * - Caption Cormorant regular (não italic forçado, evita "fake oblique")
 * - Pills queixas em font-meta uppercase · status em badge minimal
 * - Hover: actions Editar/Toggle aparecem com fade
 */

import { useState, useTransition } from 'react'
import { Eye, EyeOff, Pencil, Image as ImageIcon } from 'lucide-react'

export interface MediaCardData {
  id: string
  filename: string
  url: string
  funnel: string | null
  category?: string
  queixas: string[]
  caption: string | null
  is_active: boolean
}

const META: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif',
  fontSize: 8.5,
  fontWeight: 500,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
}

function parseCaption(raw: string | null): { primary: string; secondary: string | null } {
  if (!raw) return { primary: 'Sem legenda', secondary: null }
  const parts = raw.split(/\s*·\s*/)
  if (parts.length >= 2) return { primary: parts[0], secondary: parts.slice(1).join(' · ') }
  return { primary: parts[0], secondary: null }
}

const CATEGORY_LABEL: Record<string, string> = {
  before_after: '',
  consulta: 'Consulta',
  anovator: 'Anovator',
  biometria: 'Biometria',
  clinica: 'Clínica',
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
  const categoryLabel = media.category ? CATEGORY_LABEL[media.category] : ''

  return (
    <article
      className={`group cursor-pointer transition-opacity ${media.is_active ? '' : 'opacity-50'}`}
      onClick={() => onEdit(media.id)}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onEdit(media.id)
        }
      }}
      style={{
        background: 'rgba(255, 255, 255, 0.015)',
        border: '1px solid rgba(245, 240, 232, 0.06)',
        borderRadius: 4,
        overflow: 'hidden',
        transition: 'border-color 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(201, 169, 110, 0.3)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(245, 240, 232, 0.06)'
      }}
    >
      {/* Imagem · aspect 1:1 object-contain */}
      <div
        className="relative overflow-hidden"
        style={{ aspectRatio: '1 / 1', background: 'rgba(255, 255, 255, 0.025)' }}
      >
        {imgError ? (
          <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'rgba(245, 240, 232, 0.3)' }}>
            <ImageIcon className="w-8 h-8 opacity-50" />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.url}
            alt={cap.primary}
            loading="lazy"
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.02]"
            style={{ objectFit: 'contain', objectPosition: 'center' }}
          />
        )}

        {/* Badge categoria (canto top-left) · só pra institucionais */}
        {categoryLabel && (
          <div
            className="absolute top-2 left-2"
            style={{
              ...META,
              fontSize: 8,
              padding: '3px 7px',
              borderRadius: 2,
              color: '#C9A96E',
              background: 'rgba(26, 24, 20, 0.85)',
              border: '1px solid rgba(201, 169, 110, 0.3)',
              backdropFilter: 'blur(6px)',
            }}
          >
            {categoryLabel}
          </div>
        )}

        {/* Status · canto top-right */}
        <div className="absolute top-2 right-2">
          <span
            style={{
              ...META,
              fontSize: 8,
              padding: '3px 7px',
              borderRadius: 2,
              color: media.is_active ? '#6EE7B7' : 'rgba(245, 240, 232, 0.5)',
              background: media.is_active
                ? 'rgba(16, 185, 129, 0.12)'
                : 'rgba(26, 24, 20, 0.85)',
              border: media.is_active
                ? '1px solid rgba(16, 185, 129, 0.3)'
                : '1px solid rgba(245, 240, 232, 0.1)',
              backdropFilter: 'blur(6px)',
            }}
          >
            {media.is_active ? 'em uso' : 'arquivada'}
          </span>
        </div>

        {/* Hover actions */}
        {canManage && (
          <div
            className="absolute inset-x-0 bottom-0 p-2.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-1.5"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
            }}
          >
            <button
              type="button"
              onClick={handleEdit}
              style={{
                ...META,
                fontSize: 9,
                background: '#C9A96E',
                color: '#1A1814',
                border: '1px solid #C9A96E',
                padding: '5px 10px',
                borderRadius: 3,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Pencil className="w-3 h-3" strokeWidth={2} />
              Editar
            </button>
            <button
              type="button"
              onClick={handleToggle}
              disabled={pending}
              title={media.is_active ? 'Arquivar' : 'Reativar'}
              style={{
                background: 'transparent',
                color: 'rgba(245, 240, 232, 0.85)',
                border: '1px solid rgba(245, 240, 232, 0.2)',
                padding: '5px 8px',
                borderRadius: 3,
                cursor: pending ? 'not-allowed' : 'pointer',
                opacity: pending ? 0.5 : 1,
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {media.is_active ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          </div>
        )}
      </div>

      {/* Footer · caption + meta */}
      <div style={{ padding: '10px 12px 12px' }}>
        <p
          className="font-display"
          style={{
            fontSize: 14,
            lineHeight: 1.25,
            color: 'rgba(245, 240, 232, 0.92)',
            fontWeight: 400,
            margin: 0,
          }}
        >
          {cap.primary}
        </p>
        {cap.secondary && (
          <p
            style={{
              ...META,
              fontSize: 8.5,
              color: 'rgba(245, 240, 232, 0.4)',
              marginTop: 4,
              margin: '4px 0 0',
            }}
          >
            {cap.secondary}
          </p>
        )}
        {media.queixas.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {media.queixas.slice(0, 3).map((q) => (
              <span
                key={q}
                style={{
                  ...META,
                  fontSize: 8,
                  padding: '2px 6px',
                  borderRadius: 2,
                  background: 'rgba(255, 255, 255, 0.025)',
                  color: 'rgba(245, 240, 232, 0.6)',
                  border: '1px solid rgba(245, 240, 232, 0.06)',
                }}
              >
                {q}
              </span>
            ))}
            {media.queixas.length > 3 && (
              <span
                style={{
                  ...META,
                  fontSize: 8,
                  padding: '2px 6px',
                  borderRadius: 2,
                  background: 'rgba(255, 255, 255, 0.025)',
                  color: 'rgba(245, 240, 232, 0.5)',
                  border: '1px solid rgba(245, 240, 232, 0.06)',
                }}
              >
                +{media.queixas.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
