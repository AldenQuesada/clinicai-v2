'use client'

/**
 * DashboardFilters · cliente · searchParams como fonte da verdade.
 * Sem localStorage · sem cache cliente · sempre coerente com a URL.
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'

type RangeKey = 'today' | '7d' | '30d' | 'mtd' | 'custom'

interface Professional {
  id: string
  displayName: string
}

interface Props {
  currentRange: RangeKey
  customFrom: string | null
  customTo: string | null
  currentProfessionalId: string | null
  currentOrigem: string | null
  professionals: Professional[]
}

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'mtd', label: 'Mês atual' },
  { value: 'custom', label: 'Custom' },
]

const ORIGEM_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'manual', label: 'Manual' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'lara', label: 'Lara IA' },
  { value: 'api', label: 'API/Webhook' },
  { value: 'import', label: 'Importação' },
]

export function DashboardFilters({
  currentRange,
  customFrom,
  customTo,
  currentProfessionalId,
  currentOrigem,
  professionals,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [from, setFrom] = useState(customFrom ?? '')
  const [to, setTo] = useState(customTo ?? '')

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === '') params.delete(key)
    else params.set(key, value)
    router.push(`/crm/dashboard?${params.toString()}`)
  }

  function applyCustom() {
    if (!from || !to) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('range', 'custom')
    params.set('from', from)
    params.set('to', to)
    router.push(`/crm/dashboard?${params.toString()}`)
  }

  return (
    <div className="mt-4 flex flex-wrap gap-3 text-xs">
      <FilterPicker
        label="Período"
        value={currentRange}
        onChange={(v) => {
          const params = new URLSearchParams(searchParams.toString())
          params.set('range', v)
          if (v !== 'custom') {
            params.delete('from')
            params.delete('to')
          }
          router.push(`/crm/dashboard?${params.toString()}`)
        }}
        options={RANGE_OPTIONS}
      />

      {currentRange === 'custom' && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
          />
          <span className="text-[var(--muted-foreground)]">→</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!from || !to}
            className="rounded-md border border-[var(--primary)] bg-[var(--primary)] px-2 py-1 text-[10px] font-display-uppercase tracking-widest text-[var(--primary-foreground)] disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      )}

      <FilterPicker
        label="Profissional"
        value={currentProfessionalId ?? ''}
        onChange={(v) => setParam('professionalId', v || null)}
        options={[
          { value: '', label: `Todos (${professionals.length})` },
          ...professionals.map((p) => ({ value: p.id, label: p.displayName })),
        ]}
      />

      <FilterPicker
        label="Origem"
        value={currentOrigem ?? ''}
        onChange={(v) => setParam('origem', v || null)}
        options={ORIGEM_OPTIONS}
      />
    </div>
  )
}

function FilterPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
