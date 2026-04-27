'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { ArrowLeft, AlertTriangle, RotateCw } from 'lucide-react'

/**
 * Error boundary do segment /[slug] · captura crash do Reader (PDF corrompido,
 * signed URL expirada, pdfjs falha).
 *
 * Fallback elegante matching brand: nada de tela branca + erro técnico exposto.
 */
export default function ReaderError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[FlipbookReader] crash:', error)
  }, [error])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-bg text-center">
      <AlertTriangle className="w-12 h-12 text-gold mb-6 opacity-60" />
      <h1 className="font-display italic text-text text-4xl md:text-5xl mb-3">Não conseguimos abrir.</h1>
      <p className="font-display italic text-text-muted text-lg max-w-md mb-2">
        Algo travou no carregamento desse livro. Pode ser arquivo corrompido, sessão expirada ou problema de rede.
      </p>
      {error.digest && (
        <p className="font-meta text-text-dim mt-2 mb-8">ref · {error.digest}</p>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mt-8">
        <button
          onClick={reset}
          className="font-meta text-bg bg-gold px-6 py-3 rounded hover:bg-gold-light transition flex items-center gap-2"
        >
          <RotateCw className="w-4 h-4" /> Tentar de novo
        </button>
        <Link
          href="/"
          className="font-meta text-text-muted border border-border px-6 py-3 rounded hover:border-gold/40 hover:text-gold transition flex items-center gap-2 justify-center"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao catálogo
        </Link>
      </div>
    </main>
  )
}
