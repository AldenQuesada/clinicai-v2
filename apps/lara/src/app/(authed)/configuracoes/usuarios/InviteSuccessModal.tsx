'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { ROLE_LABELS } from '@/lib/permissions'
import type { InviteActionResult } from './actions'

export function InviteSuccessModal({
  result,
  onClose,
}: {
  result: InviteActionResult
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!result.joinUrl) return
    try {
      await navigator.clipboard.writeText(result.joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* fallback select */
    }
  }

  return (
    <div className="b2b-overlay" onClick={onClose}>
      <div className="b2b-modal" onClick={(e) => e.stopPropagation()}>
        <div className="b2b-modal-hdr">
          <h2>
            Convite <em style={{ color: 'var(--b2b-champagne)' }}>gerado</em>
          </h2>
          <button type="button" className="b2b-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="b2b-modal-body">
          <p
            style={{
              fontSize: 13,
              color: 'var(--b2b-text-dim)',
              marginBottom: 16,
              lineHeight: 1.6,
            }}
          >
            Link válido por <strong style={{ color: 'var(--b2b-ivory)' }}>48 horas</strong>.
            Envie para <strong style={{ color: 'var(--b2b-ivory)' }}>{result.email}</strong>{' '}
            como{' '}
            <strong style={{ color: 'var(--b2b-champagne)' }}>
              {result.role ? ROLE_LABELS[result.role] : ''}
            </strong>
            .
          </p>

          <div className="b2b-form-sec">Link de acesso</div>

          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'stretch',
              marginBottom: 14,
            }}
          >
            <input
              readOnly
              value={result.joinUrl || ''}
              onClick={(e) => e.currentTarget.select()}
              className="b2b-input"
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
            />
            <button
              type="button"
              onClick={copy}
              className={copied ? 'b2b-btn' : 'b2b-btn b2b-btn-primary'}
              style={{ flexShrink: 0 }}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Copiado
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </>
              )}
            </button>
          </div>

          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(245,158,11,0.08)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 5,
              fontSize: 11,
              color: 'var(--b2b-text-dim)',
              lineHeight: 1.6,
            }}
          >
            Não enviamos email automaticamente · cole o link no WhatsApp ou onde for mais
            prático. A pessoa abre o link, cria conta com a senha que escolher e o acesso é
            ativado.
          </div>
        </div>

        <div className="b2b-form-actions" style={{ padding: '0 24px 20px' }}>
          <button type="button" className="b2b-btn b2b-btn-primary" onClick={onClose}>
            Pronto
          </button>
        </div>
      </div>
    </div>
  )
}
