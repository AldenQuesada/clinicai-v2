'use client'

/**
 * Global error boundary · ULTIMA linha de defesa.
 * Captura erros do RootLayout (que error.tsx normal nao cobre porque error.tsx
 * eh wrapped pelo proprio RootLayout). Renderiza shell html/body proprio.
 *
 * Quando estavel · DELETAR.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#0F0D0A',
          color: '#F5F0E8',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 760,
            width: '100%',
            border: '1px solid rgba(239,68,68,0.4)',
            background: 'rgba(239,68,68,0.08)',
            borderRadius: 8,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <h2 style={{ color: '#FCA5A5', fontSize: 18, fontWeight: 700, margin: 0 }}>
            ⚠ Erro global · Mira
          </h2>
          <p style={{ fontSize: 14, margin: 0 }}>
            Crash no RootLayout ou abaixo. Este boundary é o ultimo recurso.
          </p>
          <div
            style={{
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.3)',
              padding: '8px 12px',
              borderRadius: 6,
              fontFamily: 'ui-monospace, monospace',
              fontSize: 12,
            }}
          >
            <div style={{ color: '#9CA3AF' }}>digest:</div>
            <div style={{ color: '#FCD34D', wordBreak: 'break-all' }}>
              {error.digest || '— (sem digest)'}
            </div>
            {error.message && (
              <>
                <div style={{ color: '#9CA3AF', marginTop: 8 }}>message (dev only):</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{error.message}</div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={reset}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              borderRadius: 6,
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 1,
              background: '#C9A96E',
              color: '#1A1814',
              border: 'none',
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
