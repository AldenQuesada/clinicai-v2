'use client'

import Link from 'next/link'
import { useState, useTransition, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { FlipbookWithStats } from '@/lib/supabase/flipbooks'
import {
  MoreVertical, Pencil, Copy, Trash2, Loader2,
  Settings, ExternalLink, Share2, Check, Image as ImageIcon, Layers,
  Eye, EyeOff, Archive, FileText, Link as LinkIcon, Megaphone,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

interface Props {
  book: FlipbookWithStats
  viewMode?: 'grid' | 'list'
  editMode?: boolean
  selectMode?: boolean
  selected?: boolean
  onSelectToggle?: () => void
  /** Click no cover · abre lightbox preview ao invés de navegar */
  onPreview?: () => void
  /** Card mostrado sendo o atualmente em preview (ring dourado) */
  highlightedActive?: boolean
}

export function AdminBookCard({
  book, viewMode = 'grid',
  selectMode = false, selected = false, onSelectToggle, onPreview, highlightedActive = false,
}: Props) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ right: number; top?: number; bottom?: number }>({ right: 0, top: 0 })

  useEffect(() => { setMounted(true) }, [])

  function openMenu() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      const MENU_HEIGHT = 380
      const MARGIN = 16
      const vh = window.innerHeight
      const spaceBelow = vh - r.bottom
      const spaceAbove = r.top
      const right = window.innerWidth - r.right

      if (spaceBelow < MENU_HEIGHT && spaceAbove > spaceBelow) {
        const desiredBottom = vh - r.top + 4
        const maxBottom = vh - MARGIN
        setMenuPos({ right, bottom: Math.min(desiredBottom, maxBottom) })
      } else {
        const desiredTop = r.bottom + 4
        const maxTop = vh - MENU_HEIGHT - MARGIN
        setMenuPos({ right, top: Math.max(MARGIN, Math.min(desiredTop, maxTop)) })
      }
    }
    setMenuOpen(true)
  }

  async function regenCover() {
    setError(null); setMenuOpen(false)
    const res = await fetch(`/api/flipbooks/${book.id}/regenerate-cover`, { method: 'POST' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Falha ao regenerar capa')
      return
    }
    startTransition(() => router.refresh())
  }

  async function regenPreview() {
    setError(null); setMenuOpen(false)
    const res = await fetch(`/api/flipbooks/${book.id}/regenerate-preview`, { method: 'POST' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Falha ao gerar preview')
      return
    }
    startTransition(() => router.refresh())
  }

  async function deleteBook() {
    setError(null)
    const res = await fetch(`/api/flipbooks/${book.id}`, { method: 'DELETE' })
    if (!res.ok) { setError('Falha ao deletar'); return }
    setConfirmDelete(false); setMenuOpen(false)
    startTransition(() => router.refresh())
  }

  async function duplicateBook() {
    setError(null)
    const res = await fetch(`/api/flipbooks/${book.id}/duplicate`, { method: 'POST' })
    if (!res.ok) { setError('Falha ao duplicar'); return }
    setMenuOpen(false)
    startTransition(() => router.refresh())
  }

  async function copyLink() {
    const url = `${window.location.origin}/${book.slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => { setCopied(false); setMenuOpen(false) }, 1500)
    } catch {
      setError('Falha ao copiar')
    }
  }

  async function shareNative() {
    const url = `${window.location.origin}/${book.slug}`
    if (navigator.share) {
      try {
        await navigator.share({ title: book.title, text: book.subtitle ?? book.title, url })
      } catch { /* user cancel */ }
      setMenuOpen(false)
    } else {
      copyLink()
    }
  }

  const Menu = (
    mounted && menuOpen && !confirmDelete && createPortal(
      <>
        <div className="fixed inset-0 z-[9998]" onClick={() => setMenuOpen(false)} />
        <div
          className="fixed w-44 bg-bg-elevated border border-border-strong rounded shadow-2xl z-[9999] py-1 overflow-y-auto"
          style={{
            right: menuPos.right,
            maxHeight: 'calc(100vh - 32px)',
            ...(menuPos.top !== undefined ? { top: menuPos.top } : {}),
            ...(menuPos.bottom !== undefined ? { bottom: menuPos.bottom } : {}),
          }}
        >
          <MenuItem Icon={Settings}     label="Editor"          onClick={() => router.push(`/admin/${book.slug}/edit`)} />
          <MenuItem Icon={Megaphone}    label="Editar Landing"  onClick={() => router.push(`/admin/${book.slug}/landing`)} />
          <MenuItem Icon={ExternalLink} label="Preview"         onClick={() => { window.open(`/${book.slug}`, '_blank'); setMenuOpen(false) }} />
          <MenuItem Icon={Share2}       label="Compartilhar"    onClick={shareNative} />
          <MenuItem Icon={copied ? Check : Copy} label={copied ? 'Copiado!' : 'Copiar link'} onClick={copyLink} />
          <div className="border-t border-border my-0.5" />
          <MenuItem Icon={ImageIcon} label="Regenerar capa" onClick={regenCover} disabled={pending} />
          <MenuItem
            Icon={Layers}
            label={book.preview_count > 0 ? `Regerar preview (${book.preview_count})` : 'Gerar preview p/ home'}
            onClick={regenPreview}
            disabled={pending}
          />
          <MenuItem Icon={Pencil} label="Editar metadata" onClick={() => router.push(`/admin/${book.slug}/edit#meta`)} />
          <MenuItem Icon={Copy}   label="Duplicar" onClick={duplicateBook} disabled={pending} />
          <div className="border-t border-border my-0.5" />
          <MenuItem Icon={Trash2} label="Apagar" danger onClick={() => setConfirmDelete(true)} />
        </div>
      </>,
      document.body,
    )
  )

  const ConfirmDelete = (
    confirmDelete && mounted && createPortal(
      <>
        <div className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm" onClick={() => { setConfirmDelete(false); setMenuOpen(false) }} />
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-bg-elevated border border-border-strong rounded-lg p-6 max-w-md w-full pointer-events-auto">
            <h4 className="font-display italic text-text text-2xl mb-2">Apagar este livro?</h4>
            <p className="text-text-muted text-sm mb-6">
              <strong className="text-text">{book.title}</strong> será removido permanentemente, junto com todas as leituras registradas. Não dá pra desfazer.
            </p>
            {error && <div className="text-red-400 text-sm mb-3">{error}</div>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setConfirmDelete(false); setMenuOpen(false) }}
                disabled={pending}
                className="border border-border text-text-muted font-meta py-2 px-4 rounded hover:border-gold/40 transition"
              >
                Cancelar
              </button>
              <button
                onClick={deleteBook}
                disabled={pending}
                className="bg-red-500/90 hover:bg-red-500 text-white font-meta py-2 px-4 rounded transition flex items-center gap-2 disabled:opacity-50"
              >
                {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Apagar
              </button>
            </div>
          </div>
        </div>
      </>,
      document.body,
    )
  )

  // ───────────── LIST MODE ─────────────
  if (viewMode === 'list') {
    const StatusIcon = book.status === 'published' ? Eye : book.status === 'archived' ? Archive : EyeOff
    const statusLabel = book.status === 'published' ? 'Published' : book.status === 'archived' ? 'Archived' : 'Draft'
    const statusColor = book.status === 'published' ? 'text-gold' : 'text-text-dim'
    return (
      <>
        <div
          className={cn(
            'group bg-bg-elevated border rounded p-2 flex items-center gap-3 transition',
            highlightedActive
              ? 'border-gold ring-1 ring-gold/50 bg-gold/5'
              : selected
                ? 'border-gold/50 ring-1 ring-gold/30'
                : 'border-border hover:border-border-strong',
          )}
        >
          {/* Capa · click abre lightbox preview */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              if (selectMode) onSelectToggle?.()
              else onPreview?.()
            }}
            aria-label={`Pré-visualizar ${book.title}`}
            className="shrink-0 w-12 h-16 rounded overflow-hidden bg-bg-panel hover:ring-1 hover:ring-gold/40 transition cursor-pointer"
            style={{
              backgroundImage: book.cover_url ? `url(${book.cover_url})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {!book.cover_url && (
              <div className="w-full h-full flex items-center justify-center bg-bg-panel">
                <span className="font-display italic text-gold text-sm">
                  {book.language === 'es' ? 'F' : book.language === 'en' ? 'E' : 'F'}
                </span>
              </div>
            )}
          </button>

          {/* Info principal · título + data + tags */}
          <div className="min-w-0 flex-1">
            <div className="text-text text-xs font-medium leading-tight truncate" title={book.title}>{book.title}</div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="text-text-dim text-[10px] font-meta shrink-0">
                {formatDate(book.published_at ?? book.updated_at)}
              </div>
              {book.tags && book.tags.length > 0 && (
                <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                  {book.tags.slice(0, 3).map((t) => (
                    <span key={t} className="px-1.5 py-px rounded-full bg-gold/10 border border-gold/30 text-gold-light text-[9px] font-meta truncate max-w-[80px]">
                      {t}
                    </span>
                  ))}
                  {book.tags.length > 3 && (
                    <span className="text-text-dim text-[9px] font-meta">+{book.tags.length - 3}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Status block · 3 linhas */}
          <div className="hidden md:flex shrink-0 flex-col gap-0.5 w-24 text-[10px]">
            <div className={cn('flex items-center gap-1.5 font-meta', statusColor)}>
              <StatusIcon className="w-3 h-3" strokeWidth={1.5} />
              {statusLabel}
            </div>
            <div className="flex items-center gap-1.5 text-text-dim">
              <Eye className="w-3 h-3" strokeWidth={1.5} />
              {book.view_count > 0 ? formatCount(book.view_count) : <span className="opacity-50">—</span>}
            </div>
            <div className="flex items-center gap-1.5 text-text-dim">
              <FileText className="w-3 h-3" strokeWidth={1.5} />
              {book.page_count ? `${book.page_count} pgs` : '—'}
            </div>
          </div>

          {/* Checkbox sempre visível */}
          <div className="shrink-0">
            <button
              onClick={onSelectToggle}
              className={cn(
                'w-4 h-4 rounded border flex items-center justify-center transition',
                selected
                  ? 'bg-gold border-gold text-bg'
                  : 'border-border hover:border-gold/60',
              )}
              aria-label={selected ? 'Desselecionar' : 'Selecionar'}
            >
              {selected && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
            </button>
          </div>

          {/* 4 botões · grid 2x2 */}
          <div className="hidden lg:grid grid-cols-2 gap-1 shrink-0">
            <ListActionBtn Icon={Settings} label="Settings" onClick={() => router.push(`/admin/${book.slug}/edit`)} />
            <ListActionBtn Icon={Pencil}   label="Editor"   onClick={() => router.push(`/admin/${book.slug}/edit`)} />
            <ListActionBtn Icon={LinkIcon} label={copied ? 'Copied!' : 'Copy link'} onClick={copyLink} />
            <ListActionBtn Icon={Trash2}   label="Delete"   danger onClick={() => setConfirmDelete(true)} />
          </div>

          {/* Mobile · menu fallback */}
          <div className="lg:hidden shrink-0">
            <button
              ref={triggerRef}
              onClick={() => menuOpen ? setMenuOpen(false) : openMenu()}
              aria-label="Ações"
              className={cn(
                'w-8 h-8 rounded flex items-center justify-center text-text-muted hover:text-gold hover:bg-bg-panel transition',
                menuOpen && 'bg-bg-panel text-gold',
              )}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
        {Menu}
        {ConfirmDelete}
      </>
    )
  }

  // ───────────── GRID MODE (default Heyzine-style) ─────────────
  return (
    <>
      <div className="group relative flex flex-col">
        {/* Data ACIMA do card (modelo Heyzine) */}
        <div className="font-meta text-text-dim text-[10px] mb-2 px-1">
          {formatDate(book.published_at ?? book.updated_at)}
        </div>

        <div
          className={cn(
            'relative rounded-lg overflow-hidden transition shadow-[0_4px_20px_rgba(0,0,0,0.4)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.6)] hover:-translate-y-0.5',
            selected && 'ring-2 ring-gold',
            highlightedActive && 'ring-2 ring-gold ring-offset-2 ring-offset-bg',
          )}
        >
          {/* Cover · click abre lightbox preview */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              if (selectMode) onSelectToggle?.()
              else onPreview?.()
            }}
            aria-label={`Pré-visualizar ${book.title}`}
            className="block aspect-[2/3] relative overflow-hidden bg-bg-panel w-full cursor-pointer"
            style={{
              backgroundImage: book.cover_url ? `url(${book.cover_url})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            {!book.cover_url && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="text-center">
                  <div className="font-display italic text-gold text-3xl leading-none mb-2">
                    {book.language === 'es' ? 'El Fin' : book.language === 'en' ? 'The End' : 'O Fim'}
                  </div>
                  <div className="font-meta text-text-muted text-[10px]">{book.author}</div>
                </div>
              </div>
            )}
          </button>

          {/* Select checkbox (canto sup esq quando selectMode) */}
          {selectMode && (
            <button
              onClick={onSelectToggle}
              className={cn(
                'absolute top-2 left-2 w-7 h-7 rounded-full border-2 flex items-center justify-center transition',
                selected
                  ? 'bg-gold border-gold text-bg'
                  : 'bg-bg/70 border-text/40 backdrop-blur hover:border-gold',
              )}
              aria-label={selected ? 'Desselecionar' : 'Selecionar'}
            >
              {selected && <Check className="w-4 h-4" strokeWidth={3} />}
            </button>
          )}

          {/* Botão circular branco bottom-right · consolidando menu (Heyzine-style) */}
          {!selectMode && (
            <button
              ref={triggerRef}
              onClick={(e) => { e.preventDefault(); menuOpen ? setMenuOpen(false) : openMenu() }}
              aria-label="Ações"
              className={cn(
                'absolute bottom-2 right-2 w-9 h-9 rounded-full bg-bg/90 backdrop-blur border border-border-strong flex items-center justify-center text-text-muted hover:text-gold hover:bg-bg transition shadow-lg',
                menuOpen && 'text-gold bg-bg',
              )}
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}

          {/* Hover hint · ver preview */}
          {!selectMode && (
            <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-bg/70 backdrop-blur flex items-center justify-center text-text opacity-0 group-hover:opacity-100 transition pointer-events-none">
              <Eye className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </div>

      {Menu}
      {ConfirmDelete}
    </>
  )
}

function ListActionBtn({
  Icon, label, onClick, danger,
}: { Icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] font-meta transition',
        danger
          ? 'border-border text-text-muted hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/5'
          : 'border-border text-text-muted hover:border-gold/40 hover:text-gold hover:bg-gold/5',
      )}
    >
      <Icon className="w-2.5 h-2.5" strokeWidth={1.5} />
      <span>{label}</span>
    </button>
  )
}

function MenuItem({
  Icon, label, onClick, danger, disabled,
}: { Icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition disabled:opacity-50',
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-text-muted hover:text-text hover:bg-bg-panel',
      )}
    >
      <Icon className="w-3 h-3" strokeWidth={1.5} />
      {label}
    </button>
  )
}
