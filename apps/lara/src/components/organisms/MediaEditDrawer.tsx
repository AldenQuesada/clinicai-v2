'use client'

/**
 * MediaEditDrawer · modal edicao · DNA design v2 (Cormorant + Montserrat
 * 8.5px tracking 0.18em + linhas finas + champagne italic).
 * useActionState pra capturar erro do server action inline (era throw silencioso).
 * Queixas como CHIPS CLICAVEIS (era input texto livre · queixas invalidas
 * eram descartadas silenciosamente pelo parseQueixas).
 */

import { useEffect, useRef, useState, useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { updateMediaAction, type UpdateResult } from '@/app/(authed)/midia/actions'

export interface MediaEditData {
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

const CATEGORY_OPTIONS = [
  { value: 'before_after', label: 'Antes / Depois' },
  { value: 'consulta', label: 'Consulta' },
  { value: 'anovator', label: 'Anovator A5' },
  { value: 'biometria', label: 'Biometria facial' },
  { value: 'clinica', label: 'Clínica · ambiente' },
] as const

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
  const router = useRouter()

  // Queixas como state local · controlled · chips clicaveis.
  // Inicializa com queixas atuais da media (filtra pra so manter validas).
  const [selectedQueixas, setSelectedQueixas] = useState<string[]>(
    media ? media.queixas.filter((q) => (VALID_QUEIXAS as readonly string[]).includes(q)) : [],
  )

  // useActionState pra capturar erro inline (antes era throw silencioso).
  // ID vem via hidden input 'media_id' (era bind · causava instabilidade).
  const [state, formAction, isPending] = useActionState<UpdateResult | null, FormData>(
    updateMediaAction,
    null,
  )

  useEffect(() => {
    if (state?.ok) {
      // 2026-04-30 · revalidatePath no server invalida cache mas o client com
      // os items na prop fica stale · router.refresh() forca re-fetch da page.
      router.refresh()
      onClose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ok])

  // Foco inicial no caption · sem .select() (que pintava texto azul ao
  // abrir e confundia user achando que tinha erro). Roda so na 1a vez
  // (mudanca de media.id) · evita refoco stuck durante pending state.
  useEffect(() => {
    if (media && captionRef.current) {
      captionRef.current.focus()
    }
  }, [media?.id])

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
      <div className="b2b-modal" style={{ maxWidth: 920, width: '100%' }}>
        <header
          className="b2b-modal-hdr"
          style={{
            borderBottom: '1px solid rgba(245, 240, 232, 0.06)',
            padding: '18px 28px 14px',
          }}
        >
          <h2
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 24,
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

        {/* Body sem scroll · 2 colunas (preview esq + form dir) */}
        <div
          className="b2b-modal-body"
          style={{
            padding: '20px 28px 22px',
            overflow: 'hidden', // sobrescreve overflow-y:auto do .b2b-modal-body
          }}
        >
          <form action={formAction}>
            <input type="hidden" name="media_id" value={media.id} />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '220px 1fr',
                gap: 24,
                alignItems: 'start',
              }}
            >
              {/* ── COLUNA ESQUERDA · preview + filename ──────────── */}
              <div>
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
                <div style={{ ...META_LABEL, marginTop: 12, marginBottom: 4 }}>Arquivo</div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: 'rgba(245, 240, 232, 0.5)',
                    fontFamily: 'ui-monospace, monospace',
                    wordBreak: 'break-all',
                    letterSpacing: '0.02em',
                    lineHeight: 1.4,
                  }}
                >
                  {media.filename}
                </div>
              </div>

              {/* ── COLUNA DIREITA · form ──────────────────────── */}
              <div>
                {/* Identificação */}
                <div className="b2b-field" style={{ marginBottom: 14 }}>
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
                  <div style={{ ...META_HINT, marginTop: 4 }}>
                    Vai como caption no WhatsApp · padrão: nome + idade
                  </div>
                </div>

                {/* Categorização · grid 2 cols compactado */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  <div className="b2b-field" style={{ margin: 0 }}>
                    <label style={META_LABEL} htmlFor="category">
                      Categoria
                    </label>
                    <select
                      id="category"
                      name="category"
                      className="b2b-input"
                      defaultValue={media.category ?? 'before_after'}
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="b2b-field" style={{ margin: 0 }}>
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
                  <div className="b2b-field" style={{ margin: 0 }}>
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

                {/* Erro do server action */}
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
                      marginBottom: 14,
                    }}
                  >
                    <span style={{ fontWeight: 600, marginRight: 6 }}>FALHOU</span>
                    {state.error}
                  </div>
                )}

            <div className="b2b-field">
              <label style={META_LABEL} htmlFor="queixas-chips">
                Queixas
              </label>
              {/* Chips clicaveis · sem digitacao livre · evita queixa "perdida"
                  que o parseQueixas server-side descartaria silenciosamente. */}
              <input type="hidden" name="queixas" value={selectedQueixas.join(',')} />
              <div
                id="queixas-chips"
                style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}
              >
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
              <div style={{ ...META_HINT, marginTop: 6 }}>
                Clique pra marcar/desmarcar · {selectedQueixas.length} selecionada{selectedQueixas.length === 1 ? '' : 's'}
              </div>
            </div>

            {/* Ordem · campo pequeno no final da coluna direita */}
            <div className="b2b-field" style={{ marginTop: 12, maxWidth: 140 }}>
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
              </div>
            </div>

            {/* ── Actions full-width fora do grid 2-col ───── */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 18,
                paddingTop: 14,
                borderTop: '1px solid rgba(245, 240, 232, 0.06)',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={onClose}
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
                disabled={isPending}
                style={{
                  fontFamily: 'Montserrat, sans-serif',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  background: isPending ? 'rgba(201, 169, 110, 0.4)' : '#C9A96E',
                  border: '1px solid #C9A96E',
                  color: '#1A1814',
                  padding: '9px 22px',
                  borderRadius: 4,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {isPending ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
