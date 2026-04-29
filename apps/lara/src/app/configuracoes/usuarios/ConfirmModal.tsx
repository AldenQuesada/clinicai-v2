'use client'

import { useState } from 'react'

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  onConfirm,
  onClose,
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  onConfirm: () => Promise<void>
  onClose: () => void
}) {
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setSubmitting(true)
    try {
      await onConfirm()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="b2b-overlay" onClick={onClose}>
      <div
        className="b2b-modal"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="b2b-modal-hdr">
          <h2>{title}</h2>
          <button type="button" className="b2b-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="b2b-modal-body">
          <p style={{ fontSize: 13, color: 'var(--b2b-text-dim)', lineHeight: 1.6 }}>
            {message}
          </p>
        </div>

        <div className="b2b-form-actions" style={{ padding: '0 24px 20px' }}>
          <button type="button" className="b2b-btn" onClick={onClose} disabled={submitting}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="b2b-btn"
            style={
              tone === 'danger'
                ? {
                    background: 'rgba(217,122,122,0.18)',
                    color: 'var(--b2b-red)',
                    borderColor: 'rgba(217,122,122,0.5)',
                    fontWeight: 600,
                  }
                : {
                    background: 'var(--b2b-champagne)',
                    color: 'var(--b2b-bg-0)',
                    borderColor: 'var(--b2b-champagne)',
                    fontWeight: 600,
                  }
            }
          >
            {submitting ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
