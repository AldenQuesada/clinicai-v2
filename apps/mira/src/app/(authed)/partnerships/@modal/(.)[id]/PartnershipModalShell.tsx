'use client'

/**
 * PartnershipModalShell · wrapper client do intercepting modal.
 *
 * Renderiza overlay full-screen sobre /partnerships list. Click outside
 * + ESC fecham (router.back · volta pra lista preservando estado).
 *
 * Botao Expandir leva pra /partnerships/[id] full page (URL direta · share).
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Maximize2, X } from 'lucide-react'

export function PartnershipModalShell({
  partnershipId,
  children,
}: {
  partnershipId: string
  children: React.ReactNode
}) {
  const router = useRouter()

  // ESC fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [router])

  return (
    <div
      className="b2b-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) router.back()
      }}
      style={{ alignItems: 'flex-start', paddingTop: 32 }}
    >
      <div
        className="b2b-modal"
        style={{
          maxWidth: 1200,
          width: 'calc(100vw - 40px)',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
        }}
      >
        {/* Top bar do modal · X fecha + Expandir leva pra full page */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--b2b-bg-1)',
            borderBottom: '1px solid var(--b2b-border)',
            padding: '10px 16px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <Link
            href={`/partnerships/${partnershipId}`}
            className="b2b-btn"
            style={{ padding: '4px 10px', fontSize: 11 }}
            title="Abrir como pagina (URL compartilhavel)"
          >
            <Maximize2 className="w-3 h-3 inline mr-1" /> Expandir
          </Link>
          <button
            type="button"
            onClick={() => router.back()}
            className="b2b-btn"
            style={{ padding: '4px 10px', fontSize: 11 }}
            title="Fechar (ESC)"
          >
            <X className="w-3 h-3 inline mr-1" /> Fechar
          </button>
        </div>

        <div style={{ padding: '20px 28px 32px' }}>{children}</div>
      </div>
    </div>
  )
}
