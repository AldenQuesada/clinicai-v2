'use client'

import { useEffect, useMemo, useState } from 'react'
import { Tag, X, Plus, Loader2, Minus, Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { FlipbookWithStats } from '@/lib/supabase/flipbooks'

type Mode = 'add' | 'remove'

interface Props {
  open: boolean
  onClose: () => void
  selectedBooks: FlipbookWithStats[]
  onApplied: () => void
}

/**
 * Modal pra editar tags de múltiplos flipbooks. Mostra tags existentes
 * (chips clicáveis pra toggle de inclusão), input pra novas tags, e 2
 * ações: "Adicionar a todos" / "Remover de todos".
 */
export function BulkTagsModal({ open, onClose, selectedBooks, onApplied }: Props) {
  const [draft, setDraft] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<Mode>('add')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Reset estado ao abrir
  useEffect(() => {
    if (open) {
      setDraft([])
      setInput('')
      setMode('add')
      setSaving(false)
      setErr(null)
    }
  }, [open])

  // Esc fecha
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Tags existentes nos selecionados (sugestões)
  const existing = useMemo(() => {
    const set = new Set<string>()
    for (const b of selectedBooks) {
      for (const t of b.tags ?? []) set.add(t)
    }
    return Array.from(set).sort()
  }, [selectedBooks])

  function commitInput() {
    const parts = input
      .split(/[,;\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    if (parts.length === 0) return
    setDraft((prev) => Array.from(new Set([...prev, ...parts])))
    setInput('')
  }

  function toggleExisting(tag: string) {
    setDraft((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  function removeDraft(tag: string) {
    setDraft((prev) => prev.filter((t) => t !== tag))
  }

  async function apply() {
    if (draft.length === 0) { setErr('Adiciona pelo menos uma tag'); return }
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch('/api/flipbooks/bulk-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedBooks.map((b) => b.id),
          mode,
          tags: draft,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `falha ${res.status}`)
      }
      onApplied()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'falha')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-bg-elevated border border-border-strong rounded-lg w-full max-w-md shadow-2xl">
        <div className="flex items-start justify-between p-4 border-b border-border">
          <div>
            <div className="font-meta text-gold text-[10px] flex items-center gap-1.5">
              <Tag className="w-3 h-3" /> Tags em massa
            </div>
            <h3 className="font-display italic text-text text-xl mt-0.5">
              {selectedBooks.length} livro{selectedBooks.length === 1 ? '' : 's'}
            </h3>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="text-text-muted hover:text-text p-1 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Modo */}
          <div className="flex gap-1 p-0.5 bg-bg-panel rounded">
            <ModeBtn active={mode === 'add'} onClick={() => setMode('add')} Icon={Plus} label="Adicionar" />
            <ModeBtn active={mode === 'remove'} onClick={() => setMode('remove')} Icon={Minus} label="Remover" />
          </div>

          {/* Input nova tag */}
          <div>
            <label className="font-meta text-text-dim text-[10px] uppercase tracking-wider block mb-1.5">
              Nova tag
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitInput() } }}
                placeholder="ex: diabetes, ebook, lançamento"
                className="flex-1 bg-bg-panel border border-border rounded px-3 py-1.5 text-sm text-text outline-none focus:border-gold/60"
              />
              <button
                onClick={commitInput}
                disabled={!input.trim()}
                className="bg-gold/15 border border-gold/40 text-gold rounded px-3 py-1.5 text-xs font-meta hover:bg-gold/25 transition disabled:opacity-40"
              >
                Adicionar
              </button>
            </div>
            <p className="text-text-dim text-[10px] mt-1.5 font-meta">Separa por vírgula pra adicionar várias.</p>
          </div>

          {/* Existentes */}
          {existing.length > 0 && (
            <div>
              <label className="font-meta text-text-dim text-[10px] uppercase tracking-wider block mb-1.5">
                Já usadas nos selecionados
              </label>
              <div className="flex flex-wrap gap-1.5">
                {existing.map((tag) => {
                  const picked = draft.includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleExisting(tag)}
                      className={cn(
                        'px-2 py-0.5 rounded-full border text-[11px] font-meta transition flex items-center gap-1',
                        picked
                          ? 'bg-gold/15 border-gold/50 text-gold'
                          : 'border-border text-text-muted hover:border-gold/30 hover:text-text',
                      )}
                    >
                      {picked && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Selecionadas pra aplicar */}
          {draft.length > 0 && (
            <div>
              <label className="font-meta text-text-dim text-[10px] uppercase tracking-wider block mb-1.5">
                Aplicar ({draft.length})
              </label>
              <div className="flex flex-wrap gap-1.5">
                {draft.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-full bg-gold/15 border border-gold/50 text-gold text-[11px] font-meta flex items-center gap-1"
                  >
                    {tag}
                    <button onClick={() => removeDraft(tag)} aria-label={`Remover ${tag}`} className="hover:text-gold-light">
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {err && <div className="text-red-400 text-xs font-meta">{err}</div>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={saving}
            className="border border-border text-text-muted font-meta py-2 px-4 rounded text-xs hover:border-gold/40 transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={apply}
            disabled={saving || draft.length === 0}
            className="bg-gold text-bg font-meta py-2 px-4 rounded text-xs hover:bg-gold-light transition flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : mode === 'add' ? <Plus className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {mode === 'add' ? 'Adicionar a todos' : 'Remover de todos'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeBtn({
  active, onClick, Icon, label,
}: { active: boolean; onClick: () => void; Icon: typeof Plus; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-xs font-meta transition',
        active ? 'bg-bg-elevated text-gold shadow' : 'text-text-muted hover:text-text',
      )}
    >
      <Icon className="w-3 h-3" strokeWidth={1.5} />
      {label}
    </button>
  )
}
