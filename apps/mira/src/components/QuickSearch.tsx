'use client'

/**
 * QuickSearch · command palette estilo CTRL+K (Mac: CMD+K).
 *
 * Mirror estrutural do `b2b-search.ui.js` antigo, em React. Combate a
 * obesidade mental dando teclado-first: 1 atalho global pra ir em qualquer
 * lugar sem clicar no menu.
 *
 * Itens:
 *   1. Acoes diretas (sempre visiveis · "+ Voucher", "+ Parceria",
 *      "Templates", "Saude", etc)
 *   2. Parcerias (lista pre-fetchada server-side · nome/slug/contato)
 *
 * Filtro: substring case-insensitive normalizando acentos (NFD). Max 30
 * resultados pra render rapido.
 *
 * Keyboard:
 *   - CMD/CTRL + K · abre/fecha
 *   - ESC · fecha
 *   - up/down · navega
 *   - ENTER · confirma (navega)
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight, Plus, Users, FileText, Activity, Settings } from 'lucide-react'

export interface QuickPartner {
  id: string
  name: string
  slug?: string | null
  status?: string | null
  pillar?: string | null
}

interface ActionItem {
  kind: 'action'
  key: string
  label: string
  hint?: string
  href: string
  icon: React.ReactNode
}

interface PartnerItem {
  kind: 'partner'
  key: string
  label: string
  hint?: string
  href: string
  status?: string | null
}

type Item = ActionItem | PartnerItem

const ACTIONS: Omit<ActionItem, 'kind'>[] = [
  { key: 'new-voucher', label: 'Emitir voucher', hint: 'rapido', href: '/vouchers/novo', icon: <Plus className="w-3.5 h-3.5" /> },
  { key: 'new-bulk', label: 'Lote de vouchers', hint: 'preview dedup', href: '/vouchers/bulk', icon: <Plus className="w-3.5 h-3.5" /> },
  { key: 'partnerships', label: 'Pulse de parcerias', hint: 'Semana', href: '/partnerships', icon: <Users className="w-3.5 h-3.5" /> },
  { key: 'templates', label: 'Templates WA', hint: 'Estudio', href: '/templates', icon: <FileText className="w-3.5 h-3.5" /> },
  { key: 'health', label: 'Saúde do sistema', hint: 'Hoje', href: '/configuracoes?tab=overview', icon: <Activity className="w-3.5 h-3.5" /> },
  { key: 'config', label: 'Configurações', hint: 'Estudio', href: '/configuracoes?tab=overview', icon: <Settings className="w-3.5 h-3.5" /> },
]

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function QuickSearch({ partners }: { partners: QuickPartner[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()

  // Atalho global + custom event do SearchHint
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase()
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && k === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (open && e.key === 'Escape') {
        setOpen(false)
      }
    }
    function onOpenEvent() {
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mira:open-quicksearch', onOpenEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mira:open-quicksearch', onOpenEvent)
    }
  }, [open])

  // Foca input quando abre · reseta cursor/query
  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const q = normalize(query)
    const actionItems: Item[] = ACTIONS.map((a) => ({ kind: 'action' as const, ...a }))
    const partnerItems: Item[] = partners.map((p) => ({
      kind: 'partner' as const,
      key: `p-${p.id}`,
      label: p.name,
      hint: [p.slug, p.pillar].filter(Boolean).join(' · ') || undefined,
      href: `/partnerships/${p.id}`,
      status: p.status,
    }))

    const all = [...actionItems, ...partnerItems]
    if (!q) return all.slice(0, 30)

    return all
      .filter((i) => normalize(i.label).includes(q) || (i.hint && normalize(i.hint).includes(q)))
      .slice(0, 30)
  }, [query, partners])

  // Garante cursor dentro do range quando items muda
  useEffect(() => {
    if (cursor >= items.length) setCursor(Math.max(0, items.length - 1))
  }, [items.length, cursor])

  function onKeyDownInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(items.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[cursor]
      if (item) {
        setOpen(false)
        router.push(item.href)
      }
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false)
      }}
    >
      <div className="w-full max-w-[560px] rounded-lg border border-[#C9A96E]/30 bg-[#0F0D0A] shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
          <Search className="w-4 h-4 text-[#9CA3AF]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setCursor(0)
            }}
            onKeyDown={onKeyDownInput}
            placeholder="Buscar parceiras ou ações…"
            className="flex-1 bg-transparent text-[#F5F0E8] text-sm placeholder:text-[#6B7280] focus:outline-none"
          />
          <span className="font-mono text-[10px] uppercase tracking-[1px] text-[#6B7280] border border-white/10 rounded px-1.5 py-0.5">
            ESC
          </span>
        </div>

        {/* Lista */}
        <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-[#6B7280]">
              Nada encontrado · digite outro termo
            </div>
          ) : (
            <ul>
              {items.map((it, i) => (
                <li key={it.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => {
                      setOpen(false)
                      router.push(it.href)
                    }}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2 text-[12.5px] transition-colors ${
                      i === cursor
                        ? 'bg-[#C9A96E]/12 text-[#F5F0E8]'
                        : 'text-[#9CA3AF] hover:bg-white/5'
                    }`}
                  >
                    <ItemIcon item={it} />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.hint && (
                      <span className="text-[10px] uppercase tracking-[1px] text-[#6B7280] shrink-0">
                        {it.hint}
                      </span>
                    )}
                    {it.kind === 'partner' && it.status && (
                      <span className={`text-[9px] uppercase tracking-[1px] px-1.5 py-0.5 rounded shrink-0 ${statusClass(it.status)}`}>
                        {it.status}
                      </span>
                    )}
                    <ArrowRight className="w-3 h-3 text-[#6B7280] shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-white/10 flex items-center gap-3 text-[10px] uppercase tracking-[1px] text-[#6B7280]">
          <span>↑↓ navegar</span>
          <span>ENTER abrir</span>
          <span className="ml-auto">{items.length} resultado{items.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  )
}

function ItemIcon({ item }: { item: Item }) {
  if (item.kind === 'action') return <span className="text-[#C9A96E]">{item.icon}</span>
  return (
    <span className="w-4 h-4 rounded-full border border-[#C9A96E]/30 bg-[#C9A96E]/10 shrink-0" />
  )
}

function statusClass(s: string): string {
  switch (s) {
    case 'active':
      return 'bg-[#10B981]/15 text-[#10B981]'
    case 'paused':
      return 'bg-[#F59E0B]/15 text-[#F59E0B]'
    case 'closed':
      return 'bg-[#EF4444]/15 text-[#FCA5A5]'
    default:
      return 'bg-white/8 text-[#9CA3AF]'
  }
}
