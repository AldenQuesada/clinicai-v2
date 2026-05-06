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

  // Fecha · audit 2026-05-05: trocado push('/partnerships') por router.back().
  // Em parallel route + intercepting (.)[id] o `back()` é o idiomatic pra dismiss
  // o slot @modal · push pra mesma rota base às vezes não dismiss o modal slot
  // no Next.js 16 (Alden reportou X que não fecha). Tabs continuam usando
  // router.replace · não criam history entries · back fecha modal direto.
  function close() {
    router.back()
  }

  // ESC fecha
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="b2b-overlay"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
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
            onClick={(e) => {
              // stopPropagation defensivo · evita que outros listeners de overlay
              // (ex: NewMenu dropdown ainda aberto) interceptem o click e bloqueiem
              // o close (audit 2026-05-05).
              e.stopPropagation()
              close()
            }}
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
