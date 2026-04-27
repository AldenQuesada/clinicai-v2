import { AlertTriangle, ExternalLink } from 'lucide-react'

/**
 * Aviso pra formatos sem renderer (MOBI/AZW3 — Amazon Kindle).
 * Recomenda Calibre como bridge pra EPUB.
 */
export function UnsupportedFormat({ format }: { format: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      <AlertTriangle className="w-10 h-10 text-gold opacity-60 mb-6" />
      <h2 className="font-display italic text-text text-3xl md:text-4xl mb-3">
        Formato <span className="text-gold-light">.{format.toUpperCase()}</span> em construção
      </h2>
      <p className="font-display italic text-text-muted text-base max-w-md mb-2">
        MOBI e AZW3 (Amazon Kindle) precisam de conversão pra EPUB antes de abrir aqui — vem na próxima atualização.
      </p>
      <p className="text-text-dim text-sm mt-6 max-w-md">
        Por enquanto, converta no <a
          href="https://calibre-ebook.com"
          target="_blank"
          rel="noreferrer noopener"
          className="text-gold hover:text-gold-light inline-flex items-center gap-1 underline decoration-dotted"
        >
          Calibre <ExternalLink className="w-3 h-3" />
        </a> e suba o .EPUB.
      </p>
    </div>
  )
}
