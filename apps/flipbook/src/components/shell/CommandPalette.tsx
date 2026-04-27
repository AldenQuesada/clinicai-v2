'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, BookOpen, Upload, BarChart3, Settings, LogOut, ArrowRight } from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { createBrowserClient } from '@/lib/supabase/browser'

interface Action {
  id: string
  label: string
  hint?: string
  Icon: typeof Search
  run: () => void | Promise<void>
  category: 'Navegação' | 'Ações' | 'Livros'
}

interface Props {
  open: boolean
  onClose: () => void
  isAdmin: boolean
}

export function CommandPalette({ open, onClose, isAdmin }: Props) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [query, setQuery] = useState('')
  const [books, setBooks] = useState<Flipbook[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setQuery(''); return }
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    supabase
      .from('flipbooks')
      .select('*')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled && data) setBooks(data as Flipbook[])
      })
    return () => { cancelled = true }
  }, [open, supabase])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (open && e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const actions: Action[] = [
    { id: 'go-catalog',  category: 'Navegação', label: 'Ir para Catálogo',     Icon: BookOpen,    run: () => { router.push('/'); onClose() } },
    ...(isAdmin ? [
      { id: 'go-admin',  category: 'Navegação' as const, label: 'Ir para Admin',         Icon: Upload,      run: () => { router.push('/admin'); onClose() } },
      { id: 'go-stats',  category: 'Navegação' as const, label: 'Ir para Estatísticas',  Icon: BarChart3,   run: () => { router.push('/stats'); onClose() } },
      { id: 'upload',    category: 'Ações' as const,     label: 'Subir novo livro',      Icon: Upload, hint: 'admin', run: () => { router.push('/admin#upload'); onClose() } },
      { id: 'go-settings', category: 'Navegação' as const, label: 'Configurações',       Icon: Settings,    run: () => { router.push('/settings'); onClose() } },
    ] : []),
    { id: 'logout',     category: 'Ações',     label: 'Sair',                   Icon: LogOut,      run: async () => {
      await supabase.auth.signOut()
      router.push('/login')
      onClose()
    } },
  ]

  const q = query.trim().toLowerCase()
  const filteredActions = q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions
  const filteredBooks = q ? books.filter((b) => `${b.title} ${b.subtitle ?? ''}`.toLowerCase().includes(q)) : books.slice(0, 5)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-bg-elevated border border-border-strong rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <Search className="w-4 h-4 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar livro ou ação…"
            className="flex-1 bg-transparent outline-none text-text placeholder:text-text-dim text-sm"
          />
          <kbd className="font-meta text-[9px] text-text-dim bg-bg-panel border border-border px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {filteredBooks.length > 0 && (
            <Section title="Livros">
              {filteredBooks.map((book) => (
                <Item
                  key={book.id}
                  Icon={BookOpen}
                  label={book.title}
                  hint={book.subtitle ?? book.language?.toUpperCase()}
                  onClick={() => { router.push(`/${book.slug}`); onClose() }}
                />
              ))}
            </Section>
          )}

          {filteredActions.length > 0 && (
            <Section title="Ações & Navegação">
              {filteredActions.map((a) => (
                <Item key={a.id} Icon={a.Icon} label={a.label} hint={a.hint} onClick={() => a.run()} />
              ))}
            </Section>
          )}

          {filteredBooks.length === 0 && filteredActions.length === 0 && (
            <div className="px-5 py-12 text-center text-text-muted text-sm">
              Nada encontrado pra <span className="text-gold">"{query}"</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="font-meta text-text-dim px-5 py-1.5 text-[9px]">{title}</div>
      {children}
    </div>
  )
}

function Item({ Icon, label, hint, onClick }: { Icon: typeof Search; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gold/10 group transition text-left"
    >
      <Icon className="w-4 h-4 text-text-muted group-hover:text-gold transition" strokeWidth={1.5} />
      <span className="flex-1 text-sm text-text truncate">{label}</span>
      {hint && <span className="text-xs text-text-dim">{hint}</span>}
      <ArrowRight className="w-3.5 h-3.5 text-text-dim opacity-0 group-hover:opacity-100 group-hover:text-gold transition" />
    </button>
  )
}
