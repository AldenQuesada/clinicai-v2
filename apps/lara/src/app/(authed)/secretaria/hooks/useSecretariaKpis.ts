/**
 * useSecretariaKpis · counts reais pros 5 KPIs do topo da Secretaria.
 *
 * Patch SECRETARIA KPI A (2026-05-07) · resolve subestimação dos KPIs antes
 * desse patch (que faziam `.filter().length` no array de 50 conversas
 * paginado · perdiam ~50% da fila quando havia 91 reais).
 *
 * Fonte: GET /api/secretaria/kpis · 5 COUNT(*) server-side em
 * wa_conversations_operational_view. Refetch: a cada 30s + manual via
 * `refresh()` (chamar quando user faz assign/unassign/handoff pra atualizar
 * sem esperar o tick).
 *
 * Padrao de erro silencioso (igual useInsights): se fetch falhar, mantem
 * counts anteriores · UI cai em fallback de count local (ver
 * secretaria/page.tsx). Nao usa SWR/React Query · padrao do projeto e
 * fetch nativo + state local.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

export interface SecretariaKpis {
  total: number
  luciana: number
  mirian: number
  /** Onda 3 (2026-05-08) · count fila Alden · operational_owner='alden'
      via UUID na view (mig 146). */
  alden: number
  aguardando: number
  urgente: number
}

const REFRESH_INTERVAL_MS = 30_000

const ZERO: SecretariaKpis = {
  total: 0,
  luciana: 0,
  mirian: 0,
  alden: 0,
  aguardando: 0,
  urgente: 0,
}

export function useSecretariaKpis() {
  const [kpis, setKpis] = useState<SecretariaKpis>(ZERO)
  const [hasFetched, setHasFetched] = useState(false)
  const [isError, setIsError] = useState(false)
  const stoppedRef = useRef(false)

  const fetchKpis = useCallback(async () => {
    try {
      const res = await fetch('/api/secretaria/kpis')
      if (!res.ok) {
        if (!stoppedRef.current) setIsError(true)
        return
      }
      const data = (await res.json()) as SecretariaKpis
      if (!stoppedRef.current) {
        setKpis(data)
        setIsError(false)
        setHasFetched(true)
      }
    } catch {
      if (!stoppedRef.current) setIsError(true)
    }
  }, [])

  useEffect(() => {
    stoppedRef.current = false
    fetchKpis()
    const interval = setInterval(fetchKpis, REFRESH_INTERVAL_MS)
    return () => {
      stoppedRef.current = true
      clearInterval(interval)
    }
  }, [fetchKpis])

  return { kpis, hasFetched, isError, refresh: fetchKpis }
}
