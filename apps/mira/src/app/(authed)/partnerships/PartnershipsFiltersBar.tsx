'use client'

/**
 * PartnershipsFiltersBar · Filtros pillar + search por nome.
 *
 * Visual: input/select estilo `.b2b-input` do clinic-dashboard (dark, border
 * champagne sutil). Layout horizontal alinhado com `.b2b-list-head`.
 *
 * Comportamento:
 *   - search atualiza ?q= debounced 300ms
 *   - pillar select atualiza ?pillar= (ou remove)
 *   - URL canonica mantida pra deep-link/share
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

// Pilares canônicos espelhados de `js/b2b/b2b.service.js` (PILLARS).
const PILLARS = [
  { value: 'imagem',        label: 'Imagem' },
  { value: 'evento',        label: 'Evento' },
  { value: 'institucional', label: 'Institucional' },
  { value: 'fitness',       label: 'Fitness' },
  { value: 'alimentacao',   label: 'Alimentação' },
  { value: 'saude',         label: 'Saúde' },
  { value: 'status',        label: 'Status' },
  { value: 'rede',          label: 'Rede' },
  { value: 'outros',        label: 'Outros' },
]

interface Props {
  initialQuery: string
  initialPillar: string
}

export function PartnershipsFiltersBar({ initialQuery, initialPillar }: Props) {
  const router = useRouter()
  const sp = useSearchParams()
  const [, startTransition] = useTransition()

  const [q, setQ] = useState(initialQuery)
  const [pillar, setPillar] = useState(initialPillar)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync com mudanças externas de URL (ex.: tab change que dropa q/pillar).
  useEffect(() => {
    setQ(initialQuery)
    setPillar(initialPillar)
  }, [initialQuery, initialPillar])

  function pushParams(next: { q?: string; pillar?: string }) {
    const params = new URLSearchParams(sp.toString())
    const newQ = next.q ?? q
    const newPillar = next.pillar ?? pillar
    if (newQ) params.set('q', newQ)
    else params.delete('q')
    if (newPillar) params.set('pillar', newPillar)
    else params.delete('pillar')
    startTransition(() => {
      router.push(`/partnerships?${params.toString()}`)
    })
  }

  function onSearchChange(v: string) {
    setQ(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      pushParams({ q: v })
    }, 300)
  }

  function onPillarChange(v: string) {
    setPillar(v)
    pushParams({ pillar: v })
  }

  function clearAll() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setQ('')
    setPillar('')
    pushParams({ q: '', pillar: '' })
  }

  const hasActive = q.length > 0 || pillar.length > 0

  return (
    <div className="b2b-filters-bar">
      <input
        type="search"
        className="b2b-filter-input"
        placeholder="Buscar por nome…"
        value={q}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label="Buscar parcerias por nome"
      />
      <select
        className="b2b-filter-select"
        value={pillar}
        onChange={(e) => onPillarChange(e.target.value)}
        aria-label="Filtrar por pilar"
      >
        <option value="">Todos os pilares</option>
        {PILLARS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      {hasActive && (
        <button type="button" className="b2b-filter-clear" onClick={clearAll}>
          Limpar
        </button>
      )}
      <style jsx>{`
        .b2b-filters-bar {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .b2b-filter-input,
        .b2b-filter-select {
          background: var(--b2b-bg-2);
          color: var(--b2b-ivory);
          border: 1px solid var(--b2b-border);
          border-radius: 6px;
          padding: 9px 12px;
          font-size: 12px;
          font-family: inherit;
          color-scheme: dark;
          letter-spacing: 0.3px;
        }
        .b2b-filter-input:focus,
        .b2b-filter-select:focus {
          outline: none;
          border-color: var(--b2b-champagne);
        }
        .b2b-filter-input {
          min-width: 220px;
          flex: 1 1 220px;
          max-width: 360px;
        }
        .b2b-filter-input::placeholder {
          color: var(--b2b-text-muted);
        }
        .b2b-filter-select {
          cursor: pointer;
          padding-right: 28px;
        }
        .b2b-filter-clear {
          background: transparent;
          border: 1px solid var(--b2b-border);
          color: var(--b2b-text-muted);
          font-size: 11px;
          letter-spacing: 0.3px;
          padding: 8px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-family: inherit;
          transition: color 0.15s, border-color 0.15s;
        }
        .b2b-filter-clear:hover {
          color: var(--b2b-champagne);
          border-color: var(--b2b-champagne);
        }
      `}</style>
    </div>
  )
}
