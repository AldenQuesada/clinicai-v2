'use client'

/**
 * MediaEditDrawer · modal de edicao de foto · CLONE 1:1 do
 * PartnershipModalShell.tsx + .b2b-modal-hdr/.b2b-modal-body da Mira.
 *
 * Estrutura (espelho exato):
 *   <div class="b2b-overlay">
 *     <div class="b2b-modal" style="maxWidth:720">
 *       <header class="b2b-modal-hdr"><h2>...</h2><button class="b2b-close">×</button></header>
 *       <div class="b2b-modal-body">
 *         <form>
 *           [b2b-form-sec, b2b-grid-2, b2b-field, b2b-input, b2b-form-actions]
 *         </form>
 *       </div>
 *     </div>
 *   </div>
 *
 * Esc fecha · click no overlay fecha · autofocus no caption.
 */

import { useEffect, useRef } from 'react'
import { updateMediaAction } from '@/app/midia/actions'

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
  'geral',
  'olheiras',
  'sulcos',
  'flacidez',
  'contorno',
  'papada',
  'textura',
  'rugas',
  'rejuvenescimento',
  'fullface',
  'firmeza',
  'manchas',
  'mandibula',
  'perfil',
  'bigode_chines',
]

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
      aria-label="Editar mídia"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="b2b-modal" style={{ maxWidth: 720 }}>
        <header className="b2b-modal-hdr">
          <h2>Editar mídia</h2>
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

        <div className="b2b-modal-body">
          {/* Preview da imagem · grid 2 cols (img + filename) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '180px 1fr',
              gap: 16,
              marginBottom: 20,
              alignItems: 'start',
            }}
          >
            <div
              style={{
                aspectRatio: '4 / 5',
                background: 'var(--b2b-bg-2)',
                border: '1px solid var(--b2b-border)',
                borderRadius: 6,
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
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: 'var(--b2b-text-muted)',
                  marginBottom: 6,
                }}
              >
                Arquivo
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--b2b-text-dim)',
                  fontFamily: 'ui-monospace, monospace',
                  wordBreak: 'break-all',
                }}
              >
                {media.filename}
              </div>
            </div>
          </div>

          <form action={updateMediaAction.bind(null, media.id)} onSubmit={() => onClose()}>
            <div className="b2b-form-sec">Identificação</div>
            <div className="b2b-field">
              <label className="b2b-field-lbl" htmlFor="caption">
                Caption
              </label>
              <input
                ref={captionRef}
                id="caption"
                name="caption"
                className="b2b-input"
                defaultValue={media.caption ?? ''}
                placeholder='ex: "Miriam Poppi, 52 anos · Resultado real Dra. Mirian de Paula"'
              />
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--b2b-text-muted)',
                  marginTop: 4,
                }}
              >
                Vai como legenda da foto pro paciente · padrão: nome + idade + assinatura.
              </div>
            </div>

            <div className="b2b-form-sec">Categorização</div>
            <div className="b2b-grid-2">
              <div className="b2b-field">
                <label className="b2b-field-lbl" htmlFor="funnel">
                  Funnel
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
                <label className="b2b-field-lbl" htmlFor="phase">
                  Fase (opcional)
                </label>
                <input
                  id="phase"
                  name="phase"
                  className="b2b-input"
                  defaultValue={media.phase ?? ''}
                />
              </div>
            </div>

            <div className="b2b-field">
              <label className="b2b-field-lbl" htmlFor="queixas">
                Queixas
              </label>
              <input
                id="queixas"
                name="queixas"
                className="b2b-input"
                defaultValue={media.queixas.join(', ')}
                placeholder="olheiras, sulcos, flacidez..."
              />
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--b2b-text-muted)',
                  marginTop: 4,
                }}
              >
                Separadas por vírgula · só entram tags válidas: {VALID_QUEIXAS.join(', ')}.
              </div>
            </div>

            <div className="b2b-grid-2">
              <div className="b2b-field">
                <label className="b2b-field-lbl" htmlFor="sort_order">
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

            <div className="b2b-form-actions">
              <button type="button" onClick={onClose} className="b2b-btn">
                Cancelar
              </button>
              <button type="submit" className="b2b-btn b2b-btn-primary">
                Salvar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
