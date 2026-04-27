'use client'

import Link from 'next/link'
import { useState, useTransition, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import {
  Eye, EyeOff, Archive, MoreHorizontal, Pencil, Copy, Trash2, Loader2,
  Settings, ExternalLink, Share2, Check, Image as ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const STATUS_BADGE: Record<Flipbook['status'], { label: string; cls: string; Icon: typeof Eye }> = {
  draft:     { label: 'Rascunho',  cls: 'text-text-dim bg-bg-panel/80',            Icon: EyeOff },
  published: { label: 'Publicado', cls: 'text-gold bg-gold/15',                    Icon: Eye },
  archived:  { label: 'Arquivado', cls: 'text-text-muted bg-bg-panel/80',          Icon: Archive },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function AdminBookCard({ book }: { book: Flipbook }) {
  const router = useRouter()
  const status = STATUS_BADGE[book.status]
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })

  useEffect(() => { setMounted(true) }, [])

  function openMenu() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setMenuPos({
        top: r.bottom + 4,
        right: window.innerWidth - r.right,
      })
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

  return (
    <div className="group relative">
      <div className="bg-bg-elevated border border-border rounded-lg overflow-hidden hover:border-border-strong transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]">
        {/* Cover */}
        <Link
          href={`/${book.slug}`}
          className="block aspect-[2/3] relative overflow-hidden bg-bg-panel"
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

          {/* Status badge */}
          <div className={cn('absolute top-3 left-3 px-2 py-1 rounded font-meta text-[9px] flex items-center gap-1.5 backdrop-blur', status.cls)}>
            <status.Icon className="w-2.5 h-2.5" />
            {status.label}
          </div>

          {/* Eye icon (preview hint) */}
          <div className="absolute bottom-3 right-3 w-7 h-7 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-text opacity-0 group-hover:opacity-100 transition">
            <Eye className="w-3.5 h-3.5" />
          </div>
        </Link>

        {/* Footer · titulo + data + menu */}
        <div className="px-4 py-3 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-text text-sm font-medium leading-tight truncate" title={book.title}>{book.title}</div>
            <div className="text-text-dim text-[11px] mt-1">
              {formatDate(book.published_at ?? book.updated_at)}
              {book.page_count && <> · {book.page_count} pgs</>}
            </div>
          </div>

          <div className="shrink-0">
            <button
              ref={triggerRef}
              onClick={() => menuOpen ? setMenuOpen(false) : openMenu()}
              aria-label="Ações"
              className={cn(
                'p-1.5 -m-1 rounded hover:bg-bg-panel text-text-muted hover:text-gold transition',
                menuOpen && 'bg-bg-panel text-gold',
              )}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {mounted && menuOpen && !confirmDelete && createPortal(
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => setMenuOpen(false)} />
                <div
                  className="fixed w-52 bg-bg-elevated border border-border-strong rounded shadow-2xl z-[9999] py-1.5"
                  style={{ top: menuPos.top, right: menuPos.right }}
                >
                  <MenuItem Icon={Settings}     label="Editor"          onClick={() => router.push(`/admin/${book.slug}/edit`)} />
                  <MenuItem Icon={ExternalLink} label="Preview"         onClick={() => { window.open(`/${book.slug}`, '_blank'); setMenuOpen(false) }} />
                  <MenuItem Icon={Share2}       label="Compartilhar"    onClick={shareNative} />
                  <MenuItem Icon={copied ? Check : Copy} label={copied ? 'Copiado!' : 'Copiar link'} onClick={copyLink} />
                  <div className="border-t border-border my-1" />
                  <MenuItem Icon={ImageIcon} label="Regenerar capa" onClick={regenCover} disabled={pending} />
                  <MenuItem Icon={Pencil} label="Editar metadata" onClick={() => router.push(`/admin/${book.slug}/edit#meta`)} />
                  <MenuItem Icon={Copy}   label="Duplicar" onClick={duplicateBook} disabled={pending} />
                  <div className="border-t border-border my-1" />
                  <MenuItem Icon={Trash2} label="Apagar" danger onClick={() => setConfirmDelete(true)} />
                </div>
              </>,
              document.body,
            )}

            {confirmDelete && mounted && createPortal(
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
            )}
          </div>
        </div>
      </div>
    </div>
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
        'w-full text-left px-3.5 py-2 text-sm flex items-center gap-2.5 transition disabled:opacity-50',
        danger ? 'text-red-400 hover:bg-red-500/10' : 'text-text-muted hover:text-text hover:bg-bg-panel',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}
