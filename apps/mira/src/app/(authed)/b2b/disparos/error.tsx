'use client'

/**
 * Error boundary do /b2b/disparos.
 *
 * Tela de fallback runtime pra debugar digest opaco · console.error revela
 * stack trace que o build static nao cata.
 */
import { useEffect } from 'react'

export default function DisparosError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[disparos-error]', error)
  }, [error])

  return (
    <div
      style={{
        padding: '40px 24px',
        maxWidth: 720,
        margin: '40px auto',
        background: 'var(--b2b-bg-1, #1A1713)',
        border: '1px solid rgba(220, 38, 38, 0.3)',
        borderRadius: 8,
        color: '#F5F0E8',
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: '#FCA5A5',
          fontWeight: 600,
          marginBottom: 6,
        }}
      >
        Erro · disparos
      </div>
      <h2
        style={{
          fontFamily: 'Cormorant Garamond, serif',
          fontSize: 28,
          fontWeight: 500,
          margin: '0 0 12px',
          lineHeight: 1.2,
        }}
      >
        Algo quebrou ao carregar a página de disparos
      </h2>
      <p style={{ fontSize: 13, color: '#9CA3AF', lineHeight: 1.6, margin: '0 0 16px' }}>
        {error.message || 'Erro desconhecido · cheque o console (F12).'}
      </p>
      {error.digest ? (
        <div
          style={{
            fontSize: 11,
            color: '#6B7280',
            fontFamily: 'ui-monospace, monospace',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 4,
            marginBottom: 16,
          }}
        >
          digest: {error.digest}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={reset} className="b2b-btn b2b-btn-primary">
          Tentar de novo
        </button>
        <a href="/b2b/disparos" className="b2b-btn">
          Recarregar
        </a>
      </div>
    </div>
  )
}
