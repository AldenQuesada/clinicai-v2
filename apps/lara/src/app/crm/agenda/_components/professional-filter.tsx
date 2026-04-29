'use client'

/**
 * ProfessionalFilter · dropdown "Todos | <prof>" · Camada 8b.
 *
 * URL state: ?prof=<userId>. "Todos" remove o param.
 * Usa useRouter().push pra preservar outros filtros (week, view, etc).
 */

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Users } from 'lucide-react'

interface ProfessionalOption {
  id: string
  name: string
}

interface ProfessionalFilterProps {
  professionals: ReadonlyArray<ProfessionalOption>
  /** userId atual ou null se "todos" */
  current: string | null
}

export function ProfessionalFilter({
  professionals,
  current,
}: ProfessionalFilterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = new URLSearchParams(sp)
    if (e.target.value) next.set('prof', e.target.value)
    else next.delete('prof')
    const qs = next.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="flex items-center gap-1">
      <Users
        className="h-3.5 w-3.5 text-[var(--muted-foreground)]"
        aria-hidden="true"
      />
      <select
        aria-label="Filtrar por profissional"
        value={current ?? ''}
        onChange={handleChange}
        className="h-8 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs text-[var(--foreground)]"
      >
        <option value="">Todos profissionais</option>
        {professionals.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  )
}
