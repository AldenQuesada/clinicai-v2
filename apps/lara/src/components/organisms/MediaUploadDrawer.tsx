'use client'

/**
 * MediaUploadDrawer · modal upload · DNA design v2 (Cormorant + Montserrat
 * 8.5px tracking 0.18em + linhas finas + champagne italic).
 * Server action via useActionState (React 19) pra capturar erro inline.
 */

import { useEffect, useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadMediaAction, type UploadResult } from '@/app/(authed)/midia/actions'

const VALID_QUEIXAS = [
  'geral', 'olheiras', 'sulcos', 'flacidez', 'contorno', 'papada',
  'textura', 'rugas', 'rejuvenescimento', 'fullface', 'firmeza',
  'manchas', 'mandibula', 'perfil', 'bigode_chines',
] as const

const CATEGORY_OPTIONS = [
  { value: 'before_after', label: 'Antes / Depois' },
  { value: 'consulta', label: 'Consulta' },
  { value: 'anovator', label: 'Anovator A5' },
  { value: 'biometria', label: 'Biometria facial' },
  { value: 'clinica', label: 'Clínica · ambiente' },
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

export function MediaUploadDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [clientError, setClientError] = useState<string>('')
  const [selectedQueixas, setSelectedQueixas] = useState<string[]>([])
  const router = useRouter()

  const [state, formAction, isPending] = useActionState<UploadResult | null, FormData>(
    uploadMediaAction,
    null,
  )

  useEffect(() => {
    if (state?.ok) {
      router.refresh() // forca re-fetch da galeria pra mostrar a foto nova
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
    setSelectedQueixas([])
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
            Nova <em style={{ color: '#C9A96E', fontStyle: 'italic' }}>foto</em>
          </h2>
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

        <div className="b2b-modal-body" style={{ padding: '4px 28px 24px' }}>
          <form action={formAction} encType="multipart/form-data">
            {/* ── Arquivo ──────────────────────────────────── */}
            <div style={{ ...SECTION_DIVIDER, marginTop: 20 }}>Arquivo</div>
            <div
              style={{
                position: 'relative',
                border: '1px dashed rgba(201, 169, 110, 0.35)',
                borderRadius: 4,
                background: previewUrl
                  ? 'rgba(201, 169, 110, 0.04)'
                  : 'rgba(255, 255, 255, 0.015)',
                marginBottom: 12,
                overflow: 'hidden',
                transition: 'background 0.2s ease',
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
                <div style={{ aspectRatio: '4 / 5', maxHeight: 320, margin: '0 auto' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ) : (
                <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                  <div
                    style={{
                      fontFamily: 'Cormorant Garamond, serif',
                      fontSize: 20,
                      fontWeight: 400,
                      color: 'rgba(245, 240, 232, 0.85)',
                      marginBottom: 8,
                      fontStyle: 'italic',
                    }}
                  >
                    Arraste a foto, ou <span style={{ color: '#C9A96E' }}>clique aqui</span>
                  </div>
                  <div style={META_HINT}>
                    JPG · PNG · WebP · até 5MB
                  </div>
                </div>
              )}
            </div>
            {fileName && (
              <div
                style={{
                  fontSize: 10.5,
                  color: 'rgba(245, 240, 232, 0.45)',
                  fontFamily: 'ui-monospace, monospace',
                  marginBottom: 10,
                  letterSpacing: '0.02em',
                }}
              >
                {fileName}
              </div>
            )}
            {clientError && (
              <div
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: 10.5,
                  letterSpacing: '0.06em',
                  color: '#FCA5A5',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '8px 12px',
                  borderRadius: 4,
                  marginBottom: 8,
                }}
              >
                {clientError}
              </div>
            )}
            {state && !state.ok && state.error && (
              <div
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: 10.5,
                  letterSpacing: '0.06em',
                  color: '#FCA5A5',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  padding: '8px 12px',
                  borderRadius: 4,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontWeight: 600, marginRight: 6 }}>FALHOU</span>
                {state.error}
              </div>
            )}

            {/* ── Identificação ──────────────────────────── */}
            <div style={SECTION_DIVIDER}>Identificação</div>
            <div className="b2b-field">
              <label style={META_LABEL} htmlFor="up-caption">
                Legenda
              </label>
              <input
                id="up-caption"
                name="caption"
                className="b2b-input"
                placeholder="ex: Miriam, 52 · resultado real"
              />
            </div>

            {/* ── Categorização ─────────────────────────── */}
            <div style={SECTION_DIVIDER}>Categorização</div>
            <div className="b2b-field">
              <label style={META_LABEL} htmlFor="up-category">
                Categoria <span style={{ color: '#C9A96E' }}>*</span>
              </label>
              <select
                id="up-category"
                name="category"
                required
                defaultValue="before_after"
                className="b2b-input"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <div style={{ ...META_HINT, marginTop: 6 }}>
                Antes/Depois exige escolher funil · outras (consulta, anovator, biometria, clínica) ignoram funil.
              </div>
            </div>
            <div className="b2b-grid-2">
              <div className="b2b-field">
                <label style={META_LABEL} htmlFor="up-funnel">
                  Funil
                </label>
                <select
                  id="up-funnel"
                  name="funnel"
                  defaultValue=""
                  className="b2b-input"
                >
                  <option value="">—</option>
                  <option value="olheiras">olheiras</option>
                  <option value="fullface">fullface</option>
                </select>
              </div>
              <div className="b2b-field">
                <label style={META_LABEL} htmlFor="up-phase">
                  Fase
                </label>
                <input id="up-phase" name="phase" className="b2b-input" placeholder="—" />
              </div>
            </div>

            <div className="b2b-field">
              <label style={META_LABEL} htmlFor="up-queixas">
                Queixas
              </label>
              {/* Chips clicaveis · sem digitacao livre · server filtra apenas
                  tags conhecidas de KNOWN_PHOTO_TAGS · evita queixa perdida. */}
              <input type="hidden" name="queixas" value={selectedQueixas.join(',')} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {VALID_QUEIXAS.map((q) => {
                  const active = selectedQueixas.includes(q)
                  return (
                    <button
                      key={q}
                      type="button"
                      onClick={() =>
                        setSelectedQueixas((prev) =>
                          active ? prev.filter((x) => x !== q) : [...prev, q],
                        )
                      }
                      style={{
                        ...META_LABEL,
                        fontSize: 9,
                        padding: '4px 10px',
                        borderRadius: 2,
                        cursor: 'pointer',
                        background: active ? 'rgba(201, 169, 110, 0.15)' : 'transparent',
                        color: active ? '#C9A96E' : 'rgba(245, 240, 232, 0.5)',
                        border: active
                          ? '1px solid rgba(201, 169, 110, 0.4)'
                          : '1px solid rgba(245, 240, 232, 0.1)',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {q}
                    </button>
                  )
                })}
              </div>
              <div style={{ ...META_HINT, marginTop: 8 }}>
                Clique pra marcar/desmarcar · {selectedQueixas.length} selecionada{selectedQueixas.length === 1 ? '' : 's'}
              </div>
            </div>

            <div className="b2b-grid-2">
              <div className="b2b-field">
                <label style={META_LABEL} htmlFor="up-sort">
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
                onClick={handleClose}
                disabled={isPending}
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
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!previewUrl || isPending}
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  background: !previewUrl || isPending ? 'rgba(201, 169, 110, 0.25)' : '#C9A96E',
                  border: '1px solid #C9A96E',
                  color: '#1A1814',
                  padding: '9px 22px',
                  borderRadius: 4,
                  cursor: !previewUrl || isPending ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {isPending ? 'Subindo…' : 'Subir foto'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
