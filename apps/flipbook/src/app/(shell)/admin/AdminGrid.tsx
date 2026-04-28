'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Pencil, List, LayoutGrid, SquareDashed, Search,
  Plus, ChevronDown, Trash2, X, Loader2,
  Link as LinkIcon, Tag, Copy, Check,
} from 'lucide-react'
import type { FlipbookWithStats } from '@/lib/supabase/flipbooks'
import { AdminBookCard } from './AdminBookCard'
import { BulkTagsModal } from './BulkTagsModal'
import { BookPreviewPanel } from './BookPreviewPanel'
import { cn } from '@/lib/utils/cn'

type ViewMode = 'grid' | 'list'
type StatusFilter = 'all' | 'published' | 'draft' | 'archived'

interface Props {
  books: FlipbookWithStats[]
}

const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'Todos',
  published: 'Publicados',
  draft: 'Rascunhos',
  archived: 'Arquivados',
}

/**
 * Grid da Vitrine · Heyzine-style.
 * Toolbar com 5 tools (edit-mode, list, grid, multi-select, search) +
 * filtro de status + status text + botão "+ New flipbook".
 */
export function AdminGrid({ books }: Props) {
  const router = useRouter()
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')
  const [editMode, setEditMode] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDuplicating, setBulkDuplicating] = useState(false)
  const [bulkCopied, setBulkCopied] = useState(false)
  const [tagsModalOpen, setTagsModalOpen] = useState(false)
  const [previewBook, setPreviewBook] = useState<FlipbookWithStats | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [, startTransition] = useTransition()

  const filtered = useMemo(() => {
    return books.filter((b) => {
      if (filterStatus !== 'all' && b.status !== filterStatus) return false
      if (searchQuery && !b.title.toLowerCase().includes(searchQuery.toLowerCase())) return false
      return true
    })
  }, [books, filterStatus, searchQuery])

  const counts = useMemo(() => ({
    total: books.length,
    published: books.filter(b => b.status === 'published').length,
    draft: books.filter(b => b.status === 'draft').length,
    archived: books.filter(b => b.status === 'archived').length,
  }), [books])

  function toggleSelectMode() {
    if (selectMode) {
      setSelectedIds(new Set())
    }
    setSelectMode(!selectMode)
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  async function bulkDelete() {
    setBulkDeleting(true)
    const ids = Array.from(selectedIds)
    await Promise.all(ids.map((id) => fetch(`/api/flipbooks/${id}`, { method: 'DELETE' })))
    setBulkDeleting(false)
    setConfirmBulkDelete(false)
    setSelectMode(false)
    setSelectedIds(new Set())
    startTransition(() => router.refresh())
  }

  async function bulkCopyLinks() {
    const links = books
      .filter((b) => selectedIds.has(b.id))
      .map((b) => `${window.location.origin}/${b.slug}`)
      .join('\n')
    try {
      await navigator.clipboard.writeText(links)
      setBulkCopied(true)
      setTimeout(() => setBulkCopied(false), 1500)
    } catch { /* noop */ }
  }

  async function bulkDuplicate() {
    setBulkDuplicating(true)
    const ids = Array.from(selectedIds)
    await Promise.all(ids.map((id) => fetch(`/api/flipbooks/${id}/duplicate`, { method: 'POST' })))
    setBulkDuplicating(false)
    setSelectMode(false)
    setSelectedIds(new Set())
    startTransition(() => router.refresh())
  }

  // Esc deselecciona e sai do select mode (mas não fecha se modal de tags
  // estiver aberto — modal tem seu próprio handler de Esc)
  useEffect(() => {
    if (!selectMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirmBulkDelete && !tagsModalOpen) {
        setSelectedIds(new Set())
        setSelectMode(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectMode, confirmBulkDelete, tagsModalOpen])

  function onTagsApplied() {
    setSelectMode(false)
    setSelectedIds(new Set())
    startTransition(() => router.refresh())
  }

  return (
    <div className="px-4 lg:px-6 py-5">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap pb-4 border-b border-border">
        {/* 5 tools esquerda */}
        <div className="flex items-center gap-0.5 mr-2">
          <ToolBtn Icon={Pencil} title="Modo edição" active={editMode} onClick={() => setEditMode(v => !v)} />
          <ToolBtn Icon={List} title="Lista" active={viewMode === 'list'} onClick={() => setViewMode('list')} />
          <ToolBtn Icon={LayoutGrid} title="Grid" active={viewMode === 'grid'} onClick={() => setViewMode('grid')} />
          <ToolBtn Icon={SquareDashed} title="Selecionar múltiplos" active={selectMode} onClick={toggleSelectMode} />
          <ToolBtn Icon={Search} title="Buscar" active={searchOpen} onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQuery('') }} />
        </div>

        {/* Search input expansível */}
        {searchOpen && (
          <input
            autoFocus
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por título…"
            className="bg-bg-elevated border border-border rounded px-3 py-1.5 text-sm text-text outline-none focus:border-gold/60 w-56"
          />
        )}

        {/* Filtro status */}
        <FilterDropdown value={filterStatus} onChange={setFilterStatus} counts={counts} />

        <div className="flex-1" />

        {/* Status text */}
        <div className="font-meta text-text-muted text-xs hidden md:block">
          {counts.published} {counts.published === 1 ? 'livro publicado' : 'livros publicados'}
          {counts.draft > 0 && ` · ${counts.draft} rascunho${counts.draft === 1 ? '' : 's'}`}
        </div>

        {/* + New flipbook */}
        <Link
          href="/admin/new"
          className="font-meta bg-gold text-bg px-3.5 py-2 rounded hover:bg-gold-light transition flex items-center gap-1.5 text-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          New flipbook
        </Link>
      </div>

      {/* Bulk action bar · floating bottom-center estilo Heyzine */}
      {selectMode && selectedIds.size > 0 && !confirmBulkDelete && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9990] bg-bg-elevated border border-border-strong rounded-lg shadow-2xl px-4 py-3 flex flex-col gap-2 min-w-[480px] max-w-[calc(100vw-32px)]">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-meta text-gold flex items-center gap-1.5">
              <Check className="w-3 h-3" strokeWidth={2.5} />
              {selectedIds.size} selecionado{selectedIds.size === 1 ? '' : 's'}
            </span>
            <span className="text-text-dim font-meta text-[10px]">
              Esc pra desfazer
            </span>
            <div className="flex-1" />
            <button
              onClick={() => { setSelectedIds(new Set()); setSelectMode(false) }}
              aria-label="Fechar seleção"
              className="text-text-muted hover:text-text p-0.5 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <BulkBtn
              Icon={bulkCopied ? Check : LinkIcon}
              label={bulkCopied ? 'Copiado!' : 'Copy links'}
              onClick={bulkCopyLinks}
            />
            <BulkBtn
              Icon={Tag}
              label="Edit tags"
              onClick={() => setTagsModalOpen(true)}
            />
            <BulkBtn
              Icon={Copy}
              label="Duplicate"
              loading={bulkDuplicating}
              disabled={bulkDuplicating}
              onClick={bulkDuplicate}
            />
            <BulkBtn
              Icon={Trash2}
              label="Delete"
              danger
              onClick={() => setConfirmBulkDelete(true)}
            />
          </div>
        </div>
      )}

      {confirmBulkDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-bg-elevated border border-border-strong rounded-lg p-6 max-w-md w-full">
            <h4 className="font-display italic text-text text-2xl mb-2">Apagar {selectedIds.size} livros?</h4>
            <p className="text-text-muted text-sm mb-6">
              Esses livros serão removidos permanentemente, junto com leituras registradas. Não dá pra desfazer.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                disabled={bulkDeleting}
                className="border border-border text-text-muted font-meta py-2 px-4 rounded hover:border-gold/40 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={bulkDelete}
                disabled={bulkDeleting}
                className="bg-red-500/90 hover:bg-red-500 text-white font-meta py-2 px-4 rounded transition flex items-center gap-2 disabled:opacity-50"
              >
                {bulkDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Apagar todos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split layout · vitrine encolhe quando preview ativo */}
      <div className="flex gap-4 mt-5">
        {/* Vitrine (esquerda) */}
        <div className={cn('min-w-0', previewBook ? 'flex-1 lg:flex-[1_1_50%]' : 'flex-1')}>
          {filtered.length === 0 ? (
            <EmptyState
              searchActive={!!searchQuery}
              filterActive={filterStatus !== 'all'}
              onClearFilters={() => { setSearchQuery(''); setSearchOpen(false); setFilterStatus('all') }}
            />
          ) : (
            <div className={cn(
              viewMode === 'grid'
                ? cn(
                    'grid gap-3 md:gap-4',
                    previewBook
                      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4'
                      : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10',
                  )
                : 'flex flex-col gap-2',
            )}>
              {filtered.map((book) => (
                <AdminBookCard
                  key={book.id}
                  book={book}
                  viewMode={viewMode}
                  editMode={editMode}
                  selectMode={selectMode}
                  selected={selectedIds.has(book.id)}
                  onSelectToggle={() => toggleSelect(book.id)}
                  onPreview={() => setPreviewBook(book)}
                  highlightedActive={previewBook?.id === book.id}
                />
              ))}
            </div>
          )}
        </div>

        {/* Painel de preview (direita · sticky · só em desktop) */}
        {previewBook && (
          <div className="hidden lg:block lg:flex-[1_1_50%] min-w-0 sticky top-4 self-start h-[calc(100vh-6rem)] rounded-lg overflow-hidden border border-border-strong shadow-2xl">
            <BookPreviewPanel
              book={previewBook}
              onClose={() => setPreviewBook(null)}
            />
          </div>
        )}
      </div>

      {/* Mobile · preview vira modal full-screen (split não cabe em telas pequenas) */}
      {previewBook && (
        <div className="lg:hidden fixed inset-0 z-[9990] bg-bg">
          <BookPreviewPanel
            book={previewBook}
            onClose={() => setPreviewBook(null)}
          />
        </div>
      )}

      <BulkTagsModal
        open={tagsModalOpen}
        onClose={() => setTagsModalOpen(false)}
        selectedBooks={books.filter((b) => selectedIds.has(b.id))}
        onApplied={onTagsApplied}
      />
    </div>
  )
}

function BulkBtn({
  Icon, label, onClick, danger, loading, soon, disabled,
}: {
  Icon: typeof Pencil
  label: string
  onClick: () => void
  danger?: boolean
  loading?: boolean
  soon?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || soon}
      title={soon ? 'Em breve' : label}
      className={cn(
        'flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-[11px] font-meta transition relative',
        soon && 'border-border text-text-dim cursor-not-allowed opacity-60',
        !soon && danger && 'border-red-500/30 text-red-400 hover:border-red-500/50 hover:bg-red-500/5',
        !soon && !danger && 'border-border text-text-muted hover:border-gold/50 hover:text-gold hover:bg-gold/5',
        disabled && !soon && 'opacity-50 cursor-not-allowed',
      )}
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" strokeWidth={1.5} />}
      <span>{label}</span>
      {soon && <span className="absolute -top-1.5 -right-1 text-[8px] bg-gold/20 text-gold-light border border-gold/40 px-1 py-px rounded font-meta">SOON</span>}
    </button>
  )
}

function ToolBtn({
  Icon, title, active, onClick,
}: { Icon: typeof Pencil; title: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={cn(
        'p-2 rounded transition',
        active
          ? 'bg-gold/15 text-gold'
          : 'text-text-muted hover:text-text hover:bg-bg-panel',
      )}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
    </button>
  )
}

function FilterDropdown({
  value, onChange, counts,
}: {
  value: StatusFilter
  onChange: (v: StatusFilter) => void
  counts: { total: number; published: number; draft: number; archived: number }
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border text-text-muted hover:text-text hover:border-border-strong transition text-xs font-meta"
      >
        Show {STATUS_LABEL[value].toLowerCase()}
        <ChevronDown className={cn('w-3 h-3 transition', open && 'rotate-180')} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 left-0 bg-bg-elevated border border-border-strong rounded shadow-xl z-[9999] py-1 min-w-[180px]">
            {(['all', 'published', 'draft', 'archived'] as StatusFilter[]).map((s) => {
              const c = s === 'all' ? counts.total : counts[s]
              return (
                <button
                  key={s}
                  onClick={() => { onChange(s); setOpen(false) }}
                  className={cn(
                    'w-full text-left px-3.5 py-2 text-sm flex items-center justify-between transition',
                    value === s
                      ? 'text-gold bg-gold/5'
                      : 'text-text-muted hover:text-text hover:bg-bg-panel',
                  )}
                >
                  <span>{STATUS_LABEL[s]}</span>
                  <span className="font-meta text-text-dim text-[10px]">{c}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function EmptyState({
  searchActive, filterActive, onClearFilters,
}: { searchActive: boolean; filterActive: boolean; onClearFilters: () => void }) {
  if (searchActive || filterActive) {
    return (
      <div className="text-center py-16">
        <p className="font-display italic text-text-muted text-xl mb-4">Nenhum livro com esses filtros.</p>
        <button onClick={onClearFilters} className="font-meta text-gold border border-gold/30 px-5 py-2.5 rounded hover:bg-gold/10 transition text-xs">
          Limpar filtros
        </button>
      </div>
    )
  }
  return (
    <div className="border border-border rounded-lg p-12 md:p-16 text-center bg-bg-elevated mt-5">
      <p className="font-display italic text-text-muted text-xl mb-6">Biblioteca vazia.</p>
      <Link
        href="/admin/new"
        className="inline-block font-meta text-gold border border-gold/30 px-6 py-3 rounded hover:bg-gold/10 transition"
      >
        Subir primeiro livro
      </Link>
    </div>
  )
}
