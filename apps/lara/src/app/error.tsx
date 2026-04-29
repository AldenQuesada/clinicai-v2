'use client'

/**
 * Root error boundary · captura erros de Server Components em qualquer
 * segment que nao tenha error.tsx proprio. Revela stack trace em vez do
 * digest opaco que Next.js 16 mostra em prod.
 */

import { useEffect } from 'react'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app:root] error:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      name: error.name,
    })
  }, [error])

  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        background: 'var(--b2b-bg-0, #0F0D0A)',
      }}
    >
      <div
        style={{
          maxWidth: 720,
          padding: 32,
          background: 'var(--b2b-bg-1, #1A1713)',
          border: '1px solid var(--b2b-border, rgba(201,169,110,0.15))',
          borderRadius: 8,
        }}
      >
        <p
          style={{
            fontSize: 10,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: 'var(--b2b-champagne, #C9A96E)',
            marginBottom: 12,
          }}
        >
          Erro · Lara
        </p>
        <h1
          style={{
            fontFamily: 'Cormorant Garamond, serif',
            fontWeight: 300,
            fontSize: 26,
            color: 'var(--b2b-ivory, #F5F0E8)',
            lineHeight: 1.1,
            marginBottom: 16,
          }}
        >
          A página caiu carregando.
        </h1>
        <pre
          style={{
            padding: 14,
            background: 'var(--b2b-bg-2, #211D17)',
            border: '1px solid var(--b2b-border, rgba(201,169,110,0.15))',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
            color: 'var(--b2b-text-dim, #B5A894)',
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
            background: 'var(--b2b-champagne, #C9A96E)',
            color: 'var(--b2b-bg-0, #0F0D0A)',
            border: '1px solid var(--b2b-champagne, #C9A96E)',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.3,
            cursor: 'pointer',
          }}
        >
          Tentar de novo
        </button>
      </div>
    </main>
  )
}
