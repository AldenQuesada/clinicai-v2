'use client'

/**
 * Error boundary do segment /prompts · revela stack trace de Server
 * Component crash que em prod fica opaco (digest only).
 *
 * Console.error logs aparecem no DevTools do user · também no console
 * server-side renderizado pelo Next.js stream.
 */

import { useEffect } from 'react'

export default function PromptsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[/prompts] error:', {
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
        background: 'var(--b2b-bg-0)',
      }}
    >
      <div className="luxury-card" style={{ padding: 32, maxWidth: 720 }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>
          Erro · /prompts
        </p>
        <h1
          className="font-display"
          style={{ fontSize: 26, color: 'var(--b2b-ivory)', lineHeight: 1.1 }}
        >
          A página caiu carregando.
        </h1>
        <pre
          style={{
            marginTop: 16,
            padding: 14,
            background: 'var(--b2b-bg-2)',
            border: '1px solid var(--b2b-border)',
            borderRadius: 6,
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
            color: 'var(--b2b-text-dim)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
{`name:    ${error.name}
message: ${error.message}
digest:  ${error.digest ?? '(none)'}
stack:
${(error.stack || '(empty)').slice(0, 2000)}`}
        </pre>
        <button onClick={reset} className="b2b-btn b2b-btn-primary" style={{ marginTop: 16 }}>
          Tentar de novo
        </button>
      </div>
    </main>
  )
}
