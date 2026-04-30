'use client'

/**
 * MediaUploadDrawer · modal upload · CLONE 1:1 do padrao Mira (.b2b-overlay/.b2b-modal).
 * Estrutura igual ao MediaEditDrawer · diferenca: input file + preview blob.
 *
 * 2026-04-30 · refatorado pra usar useActionState (React 19) · captura erro
 * do server action e renderiza inline em vez de fechar o drawer silencioso.
 */

import { useEffect, useState, useActionState } from 'react'
import { uploadMediaAction, type UploadResult } from '@/app/(authed)/midia/actions'

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

export function MediaUploadDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [clientError, setClientError] = useState<string>('')

  // Server action result (erro / sucesso) · React 19 useActionState
  const [state, formAction, isPending] = useActionState<UploadResult | null, FormData>(
    uploadMediaAction,
    null,
  )

  // Quando server action retorna ok=true, fecha o drawer e reseta tudo.
  // Quando retorna ok=false, mantém aberto e mostra erro inline.
  useEffect(() => {
    if (state?.ok) {
      handleClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleClose() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setFileName('')
    setClientError('')
    onClose()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    setClientError('')
    if (!file) {
      setPreviewUrl(null)
      setFileName('')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setClientError('Arquivo maior que 5MB · comprima antes')
      e.target.value = ''
      return
    }
    if (!file.type.match(/^image\/(jpeg|png|webp)$/)) {
      setClientError('Apenas JPG, PNG ou WebP')
      e.target.value = ''
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(file))
    setFileName(file.name)
  }

  if (!open) return null

  return (
    <div
      className="b2b-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Subir nova foto"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div className="b2b-modal" style={{ maxWidth: 720 }}>
        <header className="b2b-modal-hdr">
          <h2>Subir nova foto</h2>
          <button
            type="button"
            onClick={handleClose}
            className="b2b-close"
            aria-label="Fechar (ESC)"
            title="Fechar (ESC)"
          >
            ×
          </button>
        </header>

        <div className="b2b-modal-body">
          <form
            action={formAction}
            encType="multipart/form-data"
          >
            {/* Dropzone · file input invisivel sobre area decorativa */}
            <div className="b2b-form-sec">Arquivo</div>
            <div
              style={{
                position: 'relative',
                border: '1px dashed var(--b2b-border-strong)',
                borderRadius: 6,
                background: previewUrl
                  ? 'rgba(201, 169, 110, 0.04)'
                  : 'var(--b2b-bg-2)',
                marginBottom: 14,
                overflow: 'hidden',
              }}
            >
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png,image/webp"
                required
                onChange={handleFileChange}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  opacity: 0,
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              />
              {previewUrl ? (
                <div
                  style={{
                    aspectRatio: '4 / 5',
                    maxHeight: 320,
                    margin: '0 auto',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>
              ) : (
                <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                  <div
                    style={{
                      fontFamily: 'Cormorant Garamond, serif',
                      fontSize: 22,
                      color: 'var(--b2b-ivory)',
                      marginBottom: 6,
                    }}
                  >
                    Clique ou arraste a imagem aqui
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      color: 'var(--b2b-text-muted)',
                    }}
                  >
                    JPG · PNG · WebP · max 5MB
                  </div>
                </div>
              )}
            </div>
            {fileName && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--b2b-text-dim)',
                  fontFamily: 'ui-monospace, monospace',
                  marginBottom: 10,
                }}
              >
                {fileName}
              </div>
            )}
            {clientError && <div className="b2b-form-err">{clientError}</div>}
            {state && !state.ok && state.error && (
              <div className="b2b-form-err" style={{ marginTop: 8 }}>
                <strong>Falhou ao subir:</strong> {state.error}
              </div>
            )}

            <div className="b2b-form-sec">Identificação</div>
            <div className="b2b-field">
              <label className="b2b-field-lbl" htmlFor="up-caption">
                Caption
              </label>
              <input
                id="up-caption"
                name="caption"
                className="b2b-input"
                placeholder='ex: "Miriam Poppi, 52 anos · Resultado real Dra. Mirian de Paula"'
              />
            </div>

            <div className="b2b-form-sec">Categorização</div>
            <div className="b2b-grid-2">
              <div className="b2b-field">
                <label className="b2b-field-lbl" htmlFor="up-funnel">
                  Funnel <em>*</em>
                </label>
                <select
                  id="up-funnel"
                  name="funnel"
                  required
                  defaultValue=""
                  className="b2b-input"
                >
                  <option value="" disabled>
                    selecionar...
                  </option>
                  <option value="olheiras">olheiras</option>
                  <option value="fullface">fullface</option>
                </select>
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl" htmlFor="up-phase">
                  Fase (opcional)
                </label>
                <input id="up-phase" name="phase" className="b2b-input" />
              </div>
            </div>

            <div className="b2b-field">
              <label className="b2b-field-lbl" htmlFor="up-queixas">
                Queixas
              </label>
              <input
                id="up-queixas"
                name="queixas"
                className="b2b-input"
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
                <label className="b2b-field-lbl" htmlFor="up-sort">
                  Ordem
                </label>
                <input
                  id="up-sort"
                  type="number"
                  name="sort_order"
                  className="b2b-input"
                  defaultValue={0}
                />
              </div>
              <div />
            </div>

            <div className="b2b-form-actions">
              <button type="button" onClick={handleClose} className="b2b-btn" disabled={isPending}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!previewUrl || isPending}
                className="b2b-btn b2b-btn-primary"
              >
                {isPending ? 'Subindo...' : 'Subir foto'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
