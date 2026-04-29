'use client'

/**
 * LeadFiltersPanel · sticky topbar de filtros.
 *
 * Estado vive no URL (searchParams) · cada mudanca dispara router.replace
 * com o param atualizado (preserva os outros). Padrao do clinic-dashboard
 * adaptado pra Next.js: URL e a fonte unica + back/forward funciona +
 * compartilhar link mantem o filtro.
 *
 * Search faz debounce 300ms · evita 1 request por tecla.
 */

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

interface FilterState {
  search: string
  funnel: string
  phase: string
  temperature: string
  sourceType: string
  status: string
  noResponseDays: number
}

const FUNNELS = [
  { id: '', label: 'Todos' },
  { id: 'olheiras', label: 'Olheiras' },
  { id: 'fullface', label: 'Full Face' },
  { id: 'procedimentos', label: 'Procedimentos' },
] as const

const PHASES = [
  { id: '', label: 'Todas' },
  { id: 'lead', label: 'Lead' },
  { id: 'agendado', label: 'Agendado' },
  { id: 'reagendado', label: 'Reagendado' },
  { id: 'compareceu', label: 'Compareceu' },
] as const

const TEMPS = [
  { id: '', label: 'Todas' },
  { id: 'hot', label: 'Quente' },
  { id: 'warm', label: 'Morno' },
  { id: 'cold', label: 'Frio' },
] as const

const SOURCES = [
  { id: '', label: 'Todas origens' },
  { id: 'manual', label: 'Manual' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'whatsapp_fullface', label: 'WhatsApp · Full Face' },
  { id: 'landing_page', label: 'Landing page' },
  { id: 'b2b_voucher', label: 'B2B voucher' },
  { id: 'vpi_referral', label: 'VPI referral' },
  { id: 'referral', label: 'Indicação' },
  { id: 'social', label: 'Social' },
  { id: 'import', label: 'Importado' },
] as const

const STATUS = [
  { id: 'active', label: 'Ativos' },
  { id: 'patient', label: 'Pacientes' },
  { id: 'archived', label: 'Perdidos' },
  { id: 'all', label: 'Todos' },
] as const

const NO_RESP_OPTIONS = [
  { id: 0, label: 'Qualquer' },
  { id: 1, label: '+ 1 dia' },
  { id: 3, label: '+ 3 dias' },
  { id: 7, label: '+ 7 dias' },
  { id: 14, label: '+ 14 dias' },
  { id: 30, label: '+ 30 dias' },
] as const

export function LeadFiltersPanel({ initial }: { initial: FilterState }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(initial.search)

  // Sincroniza local search input com URL (back/forward)
  useEffect(() => {
    setSearch(initial.search)
  }, [initial.search])

  const updateParam = useCallback(
    (patch: Record<string, string | number | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '' || v === 0) next.delete(k)
        else next.set(k, String(v))
      }
      // Reseta paginacao quando filtro muda
      next.delete('page')
      router.replace(`${pathname}?${next.toString()}`, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  // Debounce 300ms na busca
  useEffect(() => {
    if (search === initial.search) return
    const t = setTimeout(() => {
      updateParam({ q: search.trim() || null })
    }, 300)
    return () => clearTimeout(t)
  }, [search, initial.search, updateParam])

  const hasFilter =
    Boolean(search) ||
    Boolean(initial.funnel) ||
    Boolean(initial.phase) ||
    Boolean(initial.temperature) ||
    Boolean(initial.sourceType) ||
    initial.noResponseDays > 0 ||
    initial.status !== 'active'

  return (
    <div
      className="luxury-card"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        padding: 14,
        marginBottom: 14,
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Linha 1: search + clear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              top: '50%',
              left: 10,
              transform: 'translateY(-50%)',
              color: 'var(--b2b-text-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Buscar por nome, telefone ou email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="b2b-input"
            style={{ paddingLeft: 32 }}
          />
        </div>
        {hasFilter && (
          <button
            type="button"
            className="b2b-btn"
            onClick={() => {
              setSearch('')
              router.replace(pathname, { scroll: false })
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <X size={12} />
            Limpar filtros
          </button>
        )}
      </div>

      {/* Linha 2: chips funnel/phase/temp/source */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 12,
          alignItems: 'start',
        }}
      >
        <ChipGroup
          label="Status"
          options={STATUS}
          value={initial.status}
          onChange={(v) => updateParam({ status: v === 'active' ? null : v })}
        />
        <ChipGroup
          label="Funnel"
          options={FUNNELS}
          value={initial.funnel}
          onChange={(v) => updateParam({ funnel: v || null })}
        />
        <ChipGroup
          label="Fase"
          options={PHASES}
          value={initial.phase}
          onChange={(v) => updateParam({ phase: v || null })}
        />
        <ChipGroup
          label="Temperatura"
          options={TEMPS}
          value={initial.temperature}
          onChange={(v) => updateParam({ temp: v || null })}
        />
        <SelectFilter
          label="Origem"
          options={SOURCES}
          value={initial.sourceType}
          onChange={(v) => updateParam({ source: v || null })}
        />
        <SelectFilter
          label="Sem resposta"
          options={NO_RESP_OPTIONS.map((o) => ({ id: String(o.id), label: o.label }))}
          value={String(initial.noResponseDays || 0)}
          onChange={(v) => {
            const n = Number(v) || 0
            updateParam({ no_resp_days: n > 0 ? n : null })
          }}
        />
      </div>
    </div>
  )
}

// ── Chip group (radio-like) ────────────────────────────────────────────────

function ChipGroup<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { id: V; label: string }[]
  value: V | string
  onChange: (v: V | '') => void
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          color: 'var(--b2b-text-muted)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {options.map((o) => {
          const active = (value || '') === o.id
          return (
            <button
              type="button"
              key={String(o.id)}
              onClick={() => onChange(o.id)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                borderRadius: 999,
                cursor: 'pointer',
                border: '1px solid',
                borderColor: active ? 'var(--b2b-champagne)' : 'var(--b2b-border)',
                background: active ? 'rgba(201,169,110,0.18)' : 'transparent',
                color: active ? 'var(--b2b-champagne)' : 'var(--b2b-text-dim)',
                transition: 'all .15s',
              }}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SelectFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { id: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          color: 'var(--b2b-text-muted)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <select
        className="b2b-input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontSize: 12 }}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
