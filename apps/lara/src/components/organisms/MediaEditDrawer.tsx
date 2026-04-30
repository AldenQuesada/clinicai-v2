'use client'

/**
 * MediaEditDrawer · modal edicao · DNA design v2 (Cormorant + Montserrat
 * 8.5px tracking 0.18em + linhas finas + champagne italic).
 */

import { useEffect, useRef } from 'react'
import { updateMediaAction } from '@/app/(authed)/midia/actions'

export interface MediaEditData {
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

const VALID_QUEIXAS = [
  'geral', 'olheiras', 'sulcos', 'flacidez', 'contorno', 'papada',
  'textura', 'rugas', 'rejuvenescimento', 'fullface', 'firmeza',
  'manchas', 'mandibula', 'perfil', 'bigode_chines',
] as const

const META_LABEL: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif',
  fontSize: '8.5px',
  fontWeight: 500,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'rgba(245, 240, 232, 0.55)',
}

const META_HINT: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif',
  fontSize: '9.5px',
  fontWeight: 400,
  letterSpacing: '0.08em',
  color: 'rgba(245, 240, 232, 0.4)',
}

const SECTION_DIVIDER: React.CSSProperties = {
  fontFamily: 'Montserrat, sans-serif',
  fontSize: '8.5px',
  fontWeight: 600,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: '#C9A96E',
  paddingBottom: 6,
  marginBottom: 12,
  borderBottom: '1px solid rgba(245, 240, 232, 0.06)',
  marginTop: 18,
}

export function MediaEditDrawer({
  media,
  onClose,
}: {
  media: MediaEditData | null
  onClose: () => void
}) {
  const captionRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (media && captionRef.current) {
      captionRef.current.focus()
      captionRef.current.select()
    }
  }, [media])

  useEffect(() => {
    if (!media) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [media, onClose])

  if (!media) return null

  return (
    <div
      className="b2b-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Editar foto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="b2b-modal" style={{ maxWidth: 680 }}>
        <header
          className="b2b-modal-hdr"
          style={{
            borderBottom: '1px solid rgba(245, 240, 232, 0.06)',
            padding: '20px 28px 16px',
          }}
        >
          <h2
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 26,
              fontWeight: 400,
              margin: 0,
              letterSpacing: '-0.2px',
            }}
          >
            Editar <em style={{ color: '#C9A96E', fontStyle: 'italic' }}>foto</em>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="b2b-close"
            aria-label="Fechar (ESC)"
            title="Fechar (ESC)"
          >
            ×
          </button>
        </header>

        <div className="b2b-modal-body" style={{ padding: '4px 28px 24px' }}>
          {/* Preview · img + filename */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              gap: 16,
              margin: '20px 0 4px',
              alignItems: 'start',
            }}
          >
            <div
              style={{
                aspectRatio: '4 / 5',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(245, 240, 232, 0.06)',
                borderRadius: 4,
                overflow: 'hidden',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={media.url}
                alt={media.caption || media.filename}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...META_LABEL, marginBottom: 6 }}>Arquivo</div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(245, 240, 232, 0.5)',
                  fontFamily: 'ui-monospace, monospace',
                  wordBreak: 'break-all',
                  letterSpacing: '0.02em',
                }}
              >
                {media.filename}
              </div>
            </div>
          </div>

          <form action={updateMediaAction.bind(null, media.id)} onSubmit={() => onClose()}>
            {/* ── Identificação ──────────────────────────── */}
            <div style={SECTION_DIVIDER}>Identificação</div>
            <div className="b2b-field">
              <label style={META_LABEL} htmlFor="caption">
                Legenda
              </label>
              <input
                ref={captionRef}
                id="caption"
                name="caption"
                className="b2b-input"
                defaultValue={media.caption ?? ''}
                placeholder="ex: Miriam, 52 · resultado real"
              />
              <div style={{ ...META_HINT, marginTop: 6 }}>
                Vai como caption no WhatsApp · padrão: nome + idade
              </div>
            </div>

            {/* ── Categorização ─────────────────────────── */}
            <div style={SECTION_DIVIDER}>Categorização</div>
            <div className="b2b-grid-2">
              <div className="b2b-field">
                <label style={META_LABEL} htmlFor="funnel">
                  Funil
                </label>
                <select
                  id="funnel"
                  name="funnel"
                  className="b2b-input"
                  defaultValue={media.funnel ?? ''}
                >
                  <option value="">—</option>
                  <option value="olheiras">olheiras</option>
                  <option value="fullface">fullface</option>
                </select>
              </div>
              <div className="b2b-field">
                <label style={META_LABEL} htmlFor="phase">
                  Fase
                </label>
                <input
                  id="phase"
                  name="phase"
                  className="b2b-input"
                  defaultValue={media.phase ?? ''}
                  placeholder="—"
                />
              </div>
            </div>

            <div className="b2b-field">
              <label style={META_LABEL} htmlFor="queixas">
                Queixas
              </label>
              <input
                id="queixas"
                name="queixas"
                className="b2b-input"
                defaultValue={media.queixas.join(', ')}
                placeholder="olheiras, sulcos, flacidez..."
              />
              <div style={{ ...META_HINT, marginTop: 6 }}>
                {VALID_QUEIXAS.join(' · ')}
              </div>
            </div>

            <div className="b2b-grid-2">
              <div className="b2b-field">
                <label style={META_LABEL} htmlFor="sort_order">
                  Ordem
                </label>
                <input
                  id="sort_order"
                  name="sort_order"
                  type="number"
                  className="b2b-input"
                  defaultValue={media.sort_order}
                />
              </div>
              <div />
            </div>

            {/* ── Actions ───────────────────────────────── */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 24,
                paddingTop: 16,
                borderTop: '1px solid rgba(245, 240, 232, 0.06)',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  background: 'transparent',
                  border: '1px solid rgba(245, 240, 232, 0.12)',
                  color: 'rgba(245, 240, 232, 0.7)',
                  padding: '9px 18px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  background: '#C9A96E',
                  border: '1px solid #C9A96E',
                  color: '#1A1814',
                  padding: '9px 22px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
