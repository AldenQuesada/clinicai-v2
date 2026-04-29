'use client'

/**
 * PatientFilters · search + status + período + custom date range.
 *
 * URL state via useSearchParams · debounce 350ms no search input.
 * Mudar filtro reseta page=1.
 *
 * Period preset: hoje, 7d, 30d, 90d, custom (mostra date range).
 */

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormField, Input, Select, Button } from '@clinicai/ui'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos status' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'blocked', label: 'Bloqueados' },
  { value: 'deceased', label: 'Falecidos' },
]

const PERIOD_OPTIONS = [
  { value: '', label: 'Qualquer período' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: '90', label: 'Últimos 90 dias' },
  { value: '365', label: 'Último ano' },
  { value: 'custom', label: 'Personalizado' },
]

export function PatientFilters() {
  const router = useRouter()
  const sp = useSearchParams()

  const [search, setSearch] = React.useState(sp.get('q') ?? '')
  const status = sp.get('status') ?? ''
  const period = sp.get('period') ?? ''
  const dateFrom = sp.get('from') ?? ''
  const dateTo = sp.get('to') ?? ''

  // Debounce do search · 350ms aposto que ela digita rapido
  React.useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp)
      if (search) next.set('q', search)
      else next.delete('q')
      next.delete('page') // reset page
      const qs = next.toString()
      router.push(qs ? `/crm/pacientes?${qs}` : '/crm/pacientes')
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(sp)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    // Quando muda period pra non-custom, limpa from/to
    if (key === 'period' && value !== 'custom') {
      next.delete('from')
      next.delete('to')
    }
    const qs = next.toString()
    router.push(qs ? `/crm/pacientes?${qs}` : '/crm/pacientes')
  }

  function clearAll() {
    setSearch('')
    router.push('/crm/pacientes')
  }

  const hasFilters = !!(search || status || period || dateFrom || dateTo)

  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
        <div className="md:col-span-5">
          <FormField label="Buscar" htmlFor="filter-search">
            <Input
              id="filter-search"
              type="search"
              placeholder="Nome, telefone, email ou CPF…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </FormField>
        </div>

        <div className="md:col-span-3">
          <FormField label="Status" htmlFor="filter-status">
            <Select
              id="filter-status"
              value={status}
              onChange={(e) => setParam('status', e.target.value || null)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="md:col-span-3">
          <FormField label="Período cadastro" htmlFor="filter-period">
            <Select
              id="filter-period"
              value={period}
              onChange={(e) => setParam('period', e.target.value || null)}
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>

        <div className="md:col-span-1 flex items-end">
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              Limpar
            </Button>
          )}
        </div>
      </div>

      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <FormField label="De" htmlFor="filter-from">
              <Input
                id="filter-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setParam('from', e.target.value || null)}
              />
            </FormField>
          </div>
          <div className="md:col-span-3">
            <FormField label="Até" htmlFor="filter-to">
              <Input
                id="filter-to"
                type="date"
                value={dateTo}
                onChange={(e) => setParam('to', e.target.value || null)}
              />
            </FormField>
          </div>
        </div>
      )}
    </div>
  )
}
