'use client'

/**
 * Error boundary do partnership detail (page + modal).
 *
 * Pedido Alden 2026-04-26: stack trace opaco (digest only) era impossivel
 * de debugar. Agora mostra mensagem amigavel + digest copiavel.
 */
import { useEffect } from 'react'

export default function PartnershipDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Loga full error no console do browser · dev tools mostra stack
    console.error('[partnership-detail-error]', error)
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
        Erro · detalhe da parceria
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
        Algo quebrou ao carregar este detalhe
      </h2>
      <p
        style={{
          fontSize: 13,
          color: '#9CA3AF',
          lineHeight: 1.6,
          margin: '0 0 16px',
        }}
      >
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
        <button
          type="button"
          onClick={reset}
          className="b2b-btn b2b-btn-primary"
        >
          Tentar de novo
        </button>
        <a href="/partnerships" className="b2b-btn">
          Voltar pra lista
        </a>
      </div>
    </div>
  )
}
