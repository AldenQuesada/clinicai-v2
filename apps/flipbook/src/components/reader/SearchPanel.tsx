'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Loader2, ChevronRight } from 'lucide-react'
import { pdfjs } from 'react-pdf'

interface Match {
  page: number
  snippet: string
  before: string
  match: string
  after: string
}

interface Props {
  pdfUrl: string
  onClose: () => void
  onJump: (page: number) => void
}

/**
 * Painel de busca de texto no PDF · indexa todas as páginas via
 * `pdf.getPage(n).getTextContent()` em background, mostra resultados com
 * snippet contextual e jump direto pra página.
 */
export function SearchPanel({ pdfUrl, onClose, onJump }: Props) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Match[]>([])
  const [indexing, setIndexing] = useState(true)
  const [progress, setProgress] = useState(0)
  const indexRef = useRef<{ page: number; text: string }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Index todas as páginas em background
  useEffect(() => {
    let cancelled = false
    setIndexing(true)
    setProgress(0)
    indexRef.current = []

    ;(async () => {
      try {
        const doc = await pdfjs.getDocument({ url: pdfUrl }).promise
        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return
          const page = await doc.getPage(n)
          const tc = await page.getTextContent()
          // Junta strings dos items com espaço · normaliza whitespace
          const text = (tc.items as Array<{ str?: string }>)
            .map((it) => it.str ?? '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
          indexRef.current.push({ page: n, text })
          setProgress(Math.floor((n / doc.numPages) * 100))
        }
        if (!cancelled) setIndexing(false)
      } catch {
        if (!cancelled) setIndexing(false)
      }
    })()

    return () => { cancelled = true }
  }, [pdfUrl])

  // Auto-focus
  useEffect(() => { inputRef.current?.focus() }, [])

  // Esc fecha
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Search live
  const filtered = useMemo<Match[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const results: Match[] = []
    for (const { page, text } of indexRef.current) {
      const lower = text.toLowerCase()
      let idx = lower.indexOf(q)
      while (idx !== -1 && results.length < 200) {
        const start = Math.max(0, idx - 40)
        const end = Math.min(text.length, idx + q.length + 40)
        results.push({
          page,
          snippet: text.slice(start, end),
          before: text.slice(start, idx),
          match: text.slice(idx, idx + q.length),
          after: text.slice(idx + q.length, end),
        })
        idx = lower.indexOf(q, idx + q.length)
      }
      if (results.length >= 200) break
    }
    return results
  }, [query])

  useEffect(() => { setMatches(filtered) }, [filtered])

  return (
    <div data-scroll-region className="absolute top-16 right-4 z-30 w-[360px] max-w-[calc(100vw-32px)] max-h-[70vh] bg-bg-elevated/95 backdrop-blur-md border border-border-strong rounded-lg shadow-2xl flex flex-col">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Search className="w-4 h-4 text-gold shrink-0" strokeWidth={1.5} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar no livro…"
          className="flex-1 bg-transparent border-none outline-none text-sm text-text placeholder:text-text-dim"
        />
        <button onClick={onClose} aria-label="Fechar" className="text-text-muted hover:text-text p-1 transition">
          <X className="w-4 h-4" />
        </button>
      </div>

      {indexing && (
        <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-text-muted text-[10px] font-meta">
          <Loader2 className="w-3 h-3 animate-spin text-gold" />
          Indexando páginas… {progress}%
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {query.trim().length >= 2 ? (
          matches.length === 0 ? (
            <div className="p-6 text-center text-text-dim font-meta text-xs">
              {indexing ? 'Continuando a indexar…' : 'Nenhum resultado.'}
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {matches.map((m, i) => (
                <li key={`${m.page}-${i}`}>
                  <button
                    onClick={() => onJump(m.page)}
                    className="w-full text-left px-3 py-2 hover:bg-gold/5 transition group"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-meta text-gold text-[10px] uppercase tracking-wider">página {m.page}</span>
                      <ChevronRight className="w-3 h-3 text-text-dim opacity-0 group-hover:opacity-100 transition ml-auto" />
                    </div>
                    <p className="text-text-muted text-xs leading-relaxed">
                      …{m.before}<mark className="bg-gold/30 text-gold-light px-0.5 rounded-sm">{m.match}</mark>{m.after}…
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="p-6 text-center text-text-dim font-meta text-[11px]">
            Digite pelo menos 2 caracteres
          </div>
        )}
      </div>

      {matches.length > 0 && (
        <div className="px-3 py-2 border-t border-border font-meta text-text-dim text-[10px] uppercase tracking-wider">
          {matches.length} resultado{matches.length === 1 ? '' : 's'}
          {matches.length === 200 && ' (limitado)'}
        </div>
      )}
    </div>
  )
}
