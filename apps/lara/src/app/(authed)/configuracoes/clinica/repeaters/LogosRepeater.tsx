'use client'

/**
 * Repeater · Logos / Variacoes.
 * Port de csRenderLogos/Add/Remove/Get/csLogoUpload (clinic-settings.js
 * linhas 401-499). Mantem o resize a 512px max e qualidade 0.85.
 */

import { useRef } from 'react'
import { Plus, X, Upload } from 'lucide-react'
import type { LogoItem } from '../types'

const TIPOS = [
  'Logo Principal',
  'Logo Fundo Branco',
  'Logo Fundo Escuro',
  'Versão Monocromática',
  'Favicon',
  'Outro',
]

const MAX_BYTES = 3 * 1024 * 1024 // 3MB · igual o legacy
const MAX_PX = 512

function emptyLogo(idx: number): LogoItem {
  return { tipo: TIPOS[idx] || 'Outro', data: '' }
}

async function fileToResizedDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width
        let h = img.height
        if (w > MAX_PX || h > MAX_PX) {
          if (w >= h) {
            h = Math.round((h * MAX_PX) / w)
            w = MAX_PX
          } else {
            w = Math.round((w * MAX_PX) / h)
            h = MAX_PX
          }
        }
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png', 0.85))
      }
      img.onerror = () => resolve(null)
      img.src = e.target?.result as string
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export function LogosRepeater({
  value,
  onChange,
  disabled = false,
  onError,
}: {
  value: LogoItem[]
  onChange: (next: LogoItem[]) => void
  disabled?: boolean
  onError?: (msg: string) => void
}) {
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({})

  function update(i: number, field: keyof LogoItem, val: string) {
    const next = value.slice()
    next[i] = { ...next[i], [field]: val }
    onChange(next)
  }
  function add() {
    onChange([...value, emptyLogo(value.length)])
  }
  function remove(i: number) {
    const next = value.slice()
    next.splice(i, 1)
    onChange(next)
  }

  async function handleFile(i: number, files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (file.size > MAX_BYTES) {
      onError?.('Arquivo muito grande. Máximo 3MB.')
      const ref = fileRefs.current[i]
      if (ref) ref.value = ''
      return
    }
    const dataUrl = await fileToResizedDataUrl(file)
    if (!dataUrl) {
      onError?.('Falha ao processar imagem.')
      return
    }
    update(i, 'data', dataUrl)
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="b2b-form-sec" style={{ borderBottom: 'none', padding: 0, margin: 0 }}>
          Logos e Variações
        </div>
        <button
          type="button"
          onClick={add}
          disabled={disabled}
          className="b2b-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '5px 12px' }}
        >
          <Plus size={11} /> Adicionar Variação
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)', marginBottom: 12, fontStyle: 'italic' }}>
        Suba as variações do logo da clínica (principal, versão branca, favicon, etc.)
      </div>

      {(!value || value.length === 0) && (
        <div className="b2b-empty">
          Nenhuma variação de logo carregada. Clique em &ldquo;Adicionar Variação&rdquo;.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {value.map((logo, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--b2b-border)',
              borderRadius: 8,
              padding: 14,
              background: 'var(--b2b-bg-1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--b2b-champagne)', letterSpacing: 1, textTransform: 'uppercase' }}>
                {logo.tipo || `Logo #${i + 1}`}
              </span>
              <button
                type="button"
                onClick={() => remove(i)}
                disabled={disabled}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--b2b-border)',
                  color: 'var(--b2b-red)',
                  borderRadius: 4,
                  width: 24,
                  height: 24,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Remover"
              >
                <X size={12} />
              </button>
            </div>

            <div className="b2b-grid-2">
              <div className="b2b-field">
                <label className="b2b-field-lbl">Tipo / Nome</label>
                <select
                  className="b2b-input"
                  value={logo.tipo}
                  onChange={(e) => update(i, 'tipo', e.target.value)}
                  disabled={disabled}
                >
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Arquivo</label>
                <label
                  className="b2b-btn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  <Upload size={12} />
                  <span style={{ fontSize: 11 }}>Selecionar imagem</span>
                  <input
                    ref={(el) => {
                      fileRefs.current[i] = el
                    }}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFile(i, e.target.files)}
                    disabled={disabled}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
              {logo.data && (
                <div style={{ gridColumn: '1 / span 2' }}>
                  <div
                    style={{
                      padding: 10,
                      background: 'var(--b2b-bg-2)',
                      borderRadius: 6,
                      border: '1px dashed var(--b2b-border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logo.data}
                      alt={logo.tipo}
                      style={{ maxHeight: 56, maxWidth: 120, objectFit: 'contain', borderRadius: 4 }}
                    />
                    <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)' }}>{logo.tipo || ''}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
