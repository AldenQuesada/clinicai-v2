'use client'

/**
 * MesaFilters · client component · BLOCO 3.2B.
 *
 * URL searchParams como fonte da verdade (padrão V2 · igual ao Kanban 3.1 e
 * Dashboard). Sem localStorage · sem state global.
 *
 * Filtros:
 *   - q (busca por nome OU telefone · ilike no repository)
 *   - bucket (all + 7 buckets canônicos)
 *   - temperature (hot/warm/cold/all)
 *   - source (texto livre · maps em ORIGEM_OPTIONS · vazio = todos)
 *   - professionalId (texto livre · UUID · futuro: dropdown)
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { MESA_BUCKETS, MESA_BUCKET_LABELS, type MesaBucket } from '@clinicai/repositories'

const BUCKET_OPTIONS: Array<{ value: MesaBucket | 'all'; label: string }> = [
  { value: 'all', label: 'Todos' },
  ...MESA_BUCKETS.map((b) => ({ value: b, label: MESA_BUCKET_LABELS[b] })),
]

const TEMPERATURE_OPTIONS: Array<{ value: 'hot' | 'warm' | 'cold' | 'all'; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'hot', label: '🔥 Hot' },
  { value: 'warm', label: '⚡ Warm' },
  { value: 'cold', label: '❄ Cold' },
]

const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'manual', label: 'Manual' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'lara', label: 'Lara IA' },
  { value: 'api', label: 'API/Webhook' },
  { value: 'import', label: 'Importação' },
  { value: 'landing_page', label: 'Landing Page' },
  { value: 'b2b', label: 'B2B' },
]

interface Props {
  currentQuery: string
  currentBucket: MesaBucket | 'all'
  currentTemperature: 'hot' | 'warm' | 'cold' | 'all'
  currentSource: string
  currentProfessionalId: string
}

export function MesaFilters({
  currentQuery,
  currentBucket,
  currentTemperature,
  currentSource,
  currentProfessionalId,
}: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [queryDraft, setQueryDraft] = useState(currentQuery)

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === '' || value === 'all') params.delete(key)
    else params.set(key, value)
    router.push(`/crm/mesa-operacional?${params.toString()}`)
  }

  function applySearch() {
    setParam('q', queryDraft.trim() || null)
  }

  function clearAll() {
    setQueryDraft('')
    router.push('/crm/mesa-operacional')
  }

  const hasAnyFilter =
    currentQuery ||
    currentBucket !== 'all' ||
    currentTemperature !== 'all' ||
    currentSource ||
    currentProfessionalId

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="mesa-search"
          className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]"
        >
          Busca
        </label>
        <div className="flex items-center gap-1">
          <input
            id="mesa-search"
            type="search"
            placeholder="Nome ou telefone"
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch()
            }}
            className="w-48 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
          />
          <button
            type="button"
            onClick={applySearch}
            className="rounded-md border border-[var(--primary)] bg-[var(--primary)] px-2 py-1 text-[10px] font-display-uppercase tracking-widest text-[var(--primary-foreground)]"
          >
            Buscar
          </button>
        </div>
      </div>

      <FilterPicker
        label="Bucket"
        value={currentBucket}
        options={BUCKET_OPTIONS}
        onChange={(v) => setParam('bucket', v)}
      />

      <FilterPicker
        label="Temperatura"
        value={currentTemperature}
        options={TEMPERATURE_OPTIONS}
        onChange={(v) => setParam('temperature', v)}
      />

      <FilterPicker
        label="Origem"
        value={currentSource}
        options={SOURCE_OPTIONS}
        onChange={(v) => setParam('source', v || null)}
      />

      <div className="flex flex-col gap-1">
        <label
          htmlFor="mesa-prof"
          className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]"
        >
          Profissional (UUID)
        </label>
        <input
          id="mesa-prof"
          type="text"
          placeholder="opcional"
          value={currentProfessionalId}
          onChange={(e) => setParam('professionalId', e.target.value || null)}
          className="w-48 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
        />
      </div>

      {hasAnyFilter ? (
        <button
          type="button"
          onClick={clearAll}
          className="ml-auto rounded-md border border-[var(--border)] px-2 py-1 text-[10px] font-display-uppercase tracking-widest text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40"
        >
          Limpar filtros
        </button>
      ) : null}
    </div>
  )
}

function FilterPicker<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
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
