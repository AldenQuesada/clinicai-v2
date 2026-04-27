'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { Eye, EyeOff, Archive, MoreHorizontal, Pencil, Copy, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const STATUS_BADGE: Record<Flipbook['status'], { label: string; cls: string; Icon: typeof Eye }> = {
  draft:     { label: 'Rascunho',  cls: 'text-text-dim',   Icon: EyeOff },
  published: { label: 'Publicado', cls: 'text-gold',       Icon: Eye },
  archived:  { label: 'Arquivado', cls: 'text-text-muted', Icon: Archive },
}

export function AdminBookRow({ book }: { book: Flipbook }) {
  const router = useRouter()
  const { Icon, label, cls } = STATUS_BADGE[book.status]
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [editTitle, setEditTitle] = useState(book.title)
  const [editStatus, setEditStatus] = useState<Flipbook['status']>(book.status)

  async function saveEdit() {
    setError(null)
    const res = await fetch(`/api/flipbooks/${book.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle, status: editStatus }),
    })
    if (!res.ok) { setError('Falha ao salvar'); return }
    setEditing(false); setMenuOpen(false)
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

  if (editing) {
    return (
      <div className="px-5 py-4 bg-bg-panel">
        <div className="space-y-3 max-w-2xl">
          <div>
            <label className="font-meta text-text-muted block mb-1">Título</label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-text outline-none focus:border-gold/60"
            />
          </div>
          <div>
            <label className="font-meta text-text-muted block mb-1">Status</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as Flipbook['status'])}
              className="w-full bg-bg border border-border rounded px-3 py-2 text-text outline-none"
            >
              <option value="draft">Rascunho</option>
              <option value="published">Publicado</option>
              <option value="archived">Arquivado</option>
            </select>
          </div>
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              disabled={pending}
              className="bg-gold text-bg font-meta py-2 px-4 rounded hover:bg-gold-light transition disabled:opacity-50"
            >
              {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Salvar'}
            </button>
            <button
              onClick={() => { setEditing(false); setEditTitle(book.title); setEditStatus(book.status) }}
              className="border border-border text-text-muted font-meta py-2 px-4 rounded hover:border-gold/40 transition"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4 group">
      <div className="min-w-0 flex-1">
        <Link href={`/${book.slug}`} className="font-display text-text text-lg hover:text-gold transition">
          {book.title}
        </Link>
        <div className="text-xs text-text-dim mt-1 flex items-center gap-2 flex-wrap">
          <span>{book.format.toUpperCase()}</span>
          <span>·</span>
          <span>{book.language.toUpperCase()}</span>
          <span>·</span>
          <span>{book.page_count ?? '—'} pgs</span>
          {book.amazon_asin && (
            <>
              <span>·</span>
              <span className="text-gold-dark">ASIN {book.amazon_asin}</span>
            </>
          )}
        </div>
      </div>

      <div className={`flex items-center gap-2 font-meta ${cls}`}>
        <Icon className="w-3 h-3" />
        {label}
      </div>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Ações"
          className={cn(
            'p-2 rounded hover:bg-bg-panel text-text-muted hover:text-gold transition',
            menuOpen && 'bg-bg-panel text-gold',
          )}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {menuOpen && !confirmDelete && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-44 bg-bg-elevated border border-border-strong rounded shadow-2xl z-20 py-1.5">
              <MenuItem Icon={Pencil} label="Editar" onClick={() => setEditing(true)} />
              <MenuItem Icon={Copy}   label="Duplicar" onClick={duplicateBook} disabled={pending} />
              <div className="border-t border-border my-1" />
              <MenuItem Icon={Trash2} label="Apagar" danger onClick={() => setConfirmDelete(true)} />
            </div>
          </>
        )}

        {confirmDelete && (
          <>
            <div className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm" onClick={() => { setConfirmDelete(false); setMenuOpen(false) }} />
            <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
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
          </>
        )}
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
