'use client'

/**
 * Global error boundary · captura erros que afetam o root layout.
 * Renderiza HTML+body proprio (Next.js 16 requer pra global-error).
 */

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app:global] error:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      name: error.name,
    })
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0F0D0A',
          color: '#F5F0E8',
          fontFamily: 'system-ui, sans-serif',
          padding: 32,
        }}
      >
        <div
          style={{
            maxWidth: 720,
            padding: 32,
            background: '#1A1713',
            border: '1px solid rgba(201,169,110,0.15)',
            borderRadius: 8,
          }}
        >
          <p
            style={{
              fontSize: 10,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: '#C9A96E',
              marginBottom: 12,
            }}
          >
            Erro fatal · Lara
          </p>
          <h1
            style={{
              fontFamily: 'Cormorant Garamond, serif',
              fontWeight: 300,
              fontSize: 26,
              lineHeight: 1.1,
              marginBottom: 16,
            }}
          >
            Falha crítica no layout.
          </h1>
          <pre
            style={{
              padding: 14,
              background: '#211D17',
              border: '1px solid rgba(201,169,110,0.15)',
              borderRadius: 6,
              fontSize: 11,
              fontFamily: 'ui-monospace, monospace',
              color: '#B5A894',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
            }}
          >
{`name:    ${error.name}
message: ${error.message}
digest:  ${error.digest ?? '(none)'}
stack:
${(error.stack || '(empty)').slice(0, 2000)}`}
          </pre>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: '9px 18px',
              background: '#C9A96E',
              color: '#0F0D0A',
              border: '1px solid #C9A96E',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  )
}
