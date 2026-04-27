'use client'

/**
 * NewMenu · dropdown "+ Novo" no AppHeader.
 * Mirror estrutural do `#newDropdown` do clinic-dashboard:
 *   - Trigger: btn-new com plus + "Novo" + chevron
 *   - Menu: dropdown-item-icon items com icone colorido
 *
 * Items P1: Voucher (champagne) + Parceria (sage). Mais items vem dps.
 *
 * Click outside / ESC fecham. Click em item navega + fecha.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronDown, Ticket, Handshake } from 'lucide-react'
import { VoucherCreateModal } from './VoucherCreateModal'

type NewItemAction =
  | { kind: 'link'; href: string }
  | { kind: 'modal'; modalKey: 'voucher' }

interface NewItem {
  action: NewItemAction
  label: string
  hint: string
  icon: React.ReactNode
  color: string
  bg: string
}

const ITEMS: NewItem[] = [
  {
    action: { kind: 'modal', modalKey: 'voucher' },
    label: 'Novo voucher',
    hint: 'Emitir presente pra convidada',
    icon: <Ticket className="w-3.5 h-3.5" />,
    color: '#C9A96E',
    bg: 'rgba(201,169,110,0.15)',
  },
  {
    action: { kind: 'link', href: '/estudio/cadastrar' },
    label: 'Nova parceria',
    hint: 'Cadastrar parceira no programa',
    icon: <Handshake className="w-3.5 h-3.5" />,
    color: '#8A9E88',
    bg: 'rgba(138,158,136,0.18)',
  },
]

export function NewMenu() {
  const [open, setOpen] = useState(false)
  const [modal, setModal] = useState<'voucher' | null>(null)
  const dropRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={dropRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Novo
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-[280px] rounded-lg border border-white/10 bg-[#0F0D0A] shadow-2xl z-30 overflow-hidden">
          <div className="px-3.5 py-2 border-b border-white/10 text-[10px] uppercase tracking-[1.4px] font-bold text-[#9CA3AF]">
            Criar novo
          </div>
          {ITEMS.map((item) => {
            if (item.action.kind === 'link') {
              return (
                <Link
                  key={item.label}
                  href={item.action.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3.5 py-2.5 border-b border-white/5 hover:bg-white/[0.04] transition-colors group"
                >
                  <ItemIcon item={item} />
                  <ItemText item={item} />
                </Link>
              )
            }
            const modalKey = item.action.modalKey
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false)
                  setModal(modalKey)
                }}
                className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 border-b border-white/5 hover:bg-white/[0.04] transition-colors group"
                style={{ background: 'transparent' }}
              >
                <ItemIcon item={item} />
                <ItemText item={item} />
              </button>
            )
          })}
        </div>
      )}

      <VoucherCreateModal
        open={modal === 'voucher'}
        onClose={() => setModal(null)}
      />
    </div>
  )
}

function ItemIcon({ item }: { item: NewItem }) {
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0"
      style={{ background: item.bg, color: item.color }}
    >
      {item.icon}
    </span>
  )
}

function ItemText({ item }: { item: NewItem }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[12.5px] font-bold text-[#F5F0E8] group-hover:text-[#C9A96E] transition-colors">
        {item.label}
      </span>
      <span className="text-[10.5px] text-[#9CA3AF]">{item.hint}</span>
    </div>
  )
}
