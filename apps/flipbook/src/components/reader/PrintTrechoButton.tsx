'use client'

import { useState } from 'react'
import { Printer, Loader2 } from 'lucide-react'
import { setupPdfWorker } from '@/lib/pdf/worker'

interface Props {
  pdfUrl: string
  pageNumber: number
  /** Título do livro pra header da janela de impressão. */
  title: string
  /** Render scale · 2.0 = 192dpi visível no print, 3.0 = 288dpi (mais peso). */
  scale?: number
  className?: string
  variant?: 'icon' | 'inline'
}

/**
 * Botão "Imprimir página atual" · isolado, plug-and-play.
 *
 * Click abre popup com a página renderizada em alta resolução via pdfjs e
 * dispara window.print() automaticamente. O leitor pode salvar como PDF
 * (impressora virtual) ou imprimir físico.
 *
 * Funciona apenas pra format='pdf' · EPUB tem print nativo do navegador.
 *
 * Plug no Reader (quando agente terminar):
 *   {format === 'pdf' && (controls.print !== false) && (
 *     <PrintTrechoButton pdfUrl={pdfUrl} pageNumber={currentPage} title={title} />
 *   )}
 */
export function PrintTrechoButton({
  pdfUrl, pageNumber, title, scale = 2.0,
  className, variant = 'icon',
}: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function doPrint() {
    if (busy) return
    setBusy(true); setError(null)
    try {
      setupPdfWorker()
      // Import dinâmico pra não bundlar pdfjs em rotas não-leitor
      const pdfjsLib = await import('pdfjs-dist')
      const doc = await pdfjsLib.getDocument({
        url: pdfUrl,
        cMapUrl: '/pdfjs/cmaps/',
        cMapPacked: true,
      }).promise

      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas 2d indisponível')

      await page.render({ canvasContext: ctx, viewport }).promise

      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      try { doc.destroy() } catch {}

      // Popup com @media print
      const win = window.open('', '_blank', 'noopener,noreferrer')
      if (!win) {
        setError('Popup bloqueado pelo navegador · libere e tente de novo')
        setBusy(false)
        return
      }

      const safeTitle = title.replace(/[<>&"']/g, (c) =>
        ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!),
      )

      win.document.open()
      win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${safeTitle} · pág ${pageNumber}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; font-family: Georgia, serif; }
  .meta { padding: 12px 18px; border-bottom: 1px solid #eee; font-size: 12px; color: #666; }
  .meta strong { color: #111; }
  .stage { display: flex; justify-content: center; padding: 24px; }
  img { max-width: 100%; height: auto; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
  @media print {
    .meta { display: none; }
    .stage { padding: 0; }
    img { box-shadow: none; max-width: 100%; max-height: 100vh; }
    @page { margin: 12mm; }
  }
</style>
</head>
<body>
  <div class="meta"><strong>${safeTitle}</strong> · página ${pageNumber}</div>
  <div class="stage"><img src="${dataUrl}" alt="Página ${pageNumber}"></div>
  <script>
    window.addEventListener('load', () => { setTimeout(() => window.print(), 250); });
  </script>
</body>
</html>`)
      win.document.close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'falha ao gerar')
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'inline') {
    return (
      <button
        onClick={doPrint}
        disabled={busy}
        className={className ?? 'font-meta text-xs text-text-muted hover:text-gold transition flex items-center gap-1.5 px-3 py-1.5 border border-border rounded hover:border-gold/40 disabled:opacity-50'}
        title="Imprimir página atual (ou salvar como PDF)"
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />}
        Imprimir
        {error && <span className="text-red-400 text-[9px] ml-1">⚠</span>}
      </button>
    )
  }

  return (
    <button
      onClick={doPrint}
      disabled={busy}
      aria-label="Imprimir página atual"
      title={error ?? `Imprimir página ${pageNumber} (ou salvar como PDF)`}
      className={className ?? 'p-2 rounded hover:bg-gold/10 text-text-muted hover:text-gold transition disabled:opacity-50'}
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Printer className="w-5 h-5" />}
    </button>
  )
}
