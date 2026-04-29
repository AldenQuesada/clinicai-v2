'use client'

/**
 * Filtros da listagem /crm/orcamentos · sincroniza com URL searchParams.
 *
 * Filtros suportados v1:
 *   - search (title ilike)
 *   - status (one of: draft|sent|viewed|followup|negotiation|approved|lost)
 *   - openOnly (exclui approved/lost)
 *   - createdFrom / createdTo (range YYYY-MM-DD)
 *
 * Submit faz router.push com nova querystring · server re-renderiza com
 * lista filtrada (RSC).
 */

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, FormField, Input, Select } from '@clinicai/ui'
import { Search, X } from 'lucide-react'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'open', label: 'Em aberto' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'sent', label: 'Enviado' },
  { value: 'viewed', label: 'Visualizado' },
  { value: 'followup', label: 'Em follow-up' },
  { value: 'negotiation', label: 'Em negociação' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'lost', label: 'Perdido' },
] as const

interface OrcamentoFiltersProps {
  /** Valores iniciais lidos do URL pelo RSC */
  initial: {
    search: string
    status: string
    createdFrom: string
    createdTo: string
  }
}

export function OrcamentoFilters({ initial }: OrcamentoFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [search, setSearch] = React.useState(initial.search)
  const [status, setStatus] = React.useState(initial.status)
  const [from, setFrom] = React.useState(initial.createdFrom)
  const [to, setTo] = React.useState(initial.createdTo)

  function applyFilters(next: {
    search?: string
    status?: string
    from?: string
    to?: string
  }) {
    const params = new URLSearchParams(searchParams.toString())
    const set = (k: string, v: string) => {
      if (v && v.length > 0) params.set(k, v)
      else params.delete(k)
    }
    set('q', next.search ?? search)
    set('status', next.status ?? status)
    set('from', next.from ?? from)
    set('to', next.to ?? to)
    params.delete('page') // reset paginacao ao filtrar
    router.push(`/crm/orcamentos?${params.toString()}`)
  }

  function clear() {
    setSearch('')
    setStatus('')
    setFrom('')
    setTo('')
    router.push('/crm/orcamentos')
  }

  const hasFilters =
    search.length > 0 || status.length > 0 || from.length > 0 || to.length > 0

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        applyFilters({})
      }}
      className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5"
    >
      <FormField label="Buscar título" htmlFor="orc-search">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input
            id="orc-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ex: Lipo HD"
            className="pl-8"
          />
        </div>
      </FormField>

      <FormField label="Status" htmlFor="orc-status">
        <Select
          id="orc-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value)
            applyFilters({ status: e.target.value })
          }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="Criado de" htmlFor="orc-from">
        <Input
          id="orc-from"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
      </FormField>

      <FormField label="Criado até" htmlFor="orc-to">
        <Input
          id="orc-to"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </FormField>

      <div className="flex items-end gap-2">
        <Button type="submit" size="sm" className="flex-1">
          Aplicar
        </Button>
        {hasFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            <X className="h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>
    </form>
  )
}
