'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X, Loader2, ChevronRight } from 'lucide-react'
import type { EpubHandle, EpubMatch } from './EpubCanvas'

interface Props {
  /** Ref do EpubCanvas. Pode ser EpubHandle (busca disponível) ou genérico
   * (sem .search → painel mostra "indisponível"). */
  epubRef: React.RefObject<EpubHandle | null>
  onClose: () => void
  /** Após click num match · canvas navega via displayCfi e painel fecha. */
  onJump?: () => void
}

/**
 * Painel de busca full-text em EPUB · espelha layout do SearchPanel do PDF
 * mas usa book.spine + item.find() do epub.js (via EpubHandle.search).
 *
 * Plug no Reader: condicionar render por `format === 'epub'`. Quando o
 * agente Reader voltar e wirear, basta importar e adicionar:
 *   {searchOpen && format === 'epub' && (
 *     <EpubSearchPanel epubRef={canvasRef as RefObject<EpubHandle>}
 *       onClose={() => setSearchOpen(false)} />
 *   )}
 */
export function EpubSearchPanel({ epubRef, onClose, onJump }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EpubMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function runSearch() {
    const q = query.trim()
    if (q.length < 2) return
    const fn = epubRef.current?.search
    if (!fn) {
      setResults([])
      setSearched(true)
      return
    }
    setLoading(true)
    try {
      const matches = await fn(q, { maxResults: 50 })
      setResults(matches)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') runSearch()
    if (e.key === 'Escape') onClose()
  }

  function jumpTo(m: EpubMatch) {
    epubRef.current?.displayCfi?.(m.cfi)
    if (onJump) onJump()
    else onClose()
  }

  const hasSearch = !!epubRef.current?.search

  return (
    <div
      data-scroll-region
      className="absolute top-16 right-4 z-30 w-[360px] max-w-[calc(100%-32px)] bg-bg-elevated/95 backdrop-blur-xl border border-border-strong rounded-md shadow-2xl flex flex-col max-h-[70vh]"
    >
      <header className="px-3 py-2.5 border-b border-border flex items-center gap-2 shrink-0">
        <Search className="w-3.5 h-3.5 text-gold-dark" strokeWidth={2} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar texto…"
          className="flex-1 bg-transparent border-0 outline-none text-text text-sm font-display placeholder:text-text-dim"
        />
        {loading && <Loader2 className="w-3 h-3 animate-spin text-gold-dark" />}
        <button
          onClick={onClose}
          className="p-1 rounded text-text-dim hover:text-gold transition shrink-0"
          title="Fechar (Esc)"
        >
          <X className="w-3 h-3" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {!hasSearch ? (
          <div className="p-4 text-text-dim text-xs italic text-center">
            Busca não disponível · canvas EPUB não inicializou
          </div>
        ) : !searched ? (
          <div className="p-4 text-text-dim text-[10px] uppercase tracking-wider text-center font-meta">
            Digite pelo menos 2 letras e Enter
          </div>
        ) : results.length === 0 ? (
          <div className="p-4 text-text-dim text-xs italic text-center">
            Nenhum resultado pra &ldquo;{query}&rdquo;
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {results.map((m, i) => (
              <li key={`${m.cfi}-${i}`}>
                <button
                  type="button"
                  onClick={() => jumpTo(m)}
                  className="w-full text-left px-3 py-2.5 hover:bg-gold/5 transition group flex items-start gap-2"
                >
                  <ChevronRight className="w-3 h-3 text-gold-dark mt-1 shrink-0 group-hover:text-gold transition" strokeWidth={2} />
                  <div className="flex-1 min-w-0">
                    <div className="font-meta text-[9px] uppercase tracking-wider text-gold-dark truncate">
                      {m.spineLabel}
                    </div>
                    <div className="text-text text-xs leading-relaxed mt-0.5 line-clamp-2">
                      {m.excerpt}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="px-3 py-2 border-t border-border shrink-0">
        <div className="font-meta text-[9px] text-text-dim uppercase tracking-wider text-center">
          {searched && hasSearch ? `${results.length} resultado${results.length !== 1 ? 's' : ''}` : 'EPUB · busca full-text'}
        </div>
      </footer>
    </div>
  )
}
