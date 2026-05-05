/**
 * useInsights · KPIs globais do clinic pro top bar.
 *
 * Resolve P-03/P-04: contagens independentes do filtro ativo. Sem isto, top
 * bar mostrava "Resolvidos hoje: 0" sempre que aba era != "Resolvidas" (porque
 * o array vinha filtrado pra outro status) e Urgentes/Aguardando zeravam ao
 * trocar de aba.
 *
 * Estrategia:
 *   - fetch inicial no mount
 *   - refetch automatico a cada 30s (cache TTL leve, evita stale)
 *   - refetch manual via `refresh()` (chamar quando SSE dispara update)
 *
 * Nao usa SWR/React Query · padrao do projeto e fetch nativo + state local.
 */

import { useState, useEffect, useCallback, useRef } from 'react'

export interface Insights {
  urgentes: number
  aguardando: number
  laraAtiva: number
  resolvidosHoje: number
  novosLeads: number
  /** Fila Dra · conversas com assigned_to = DOCTOR_USER_ID e status active/paused */
  dra: number
}

const REFRESH_INTERVAL_MS = 30_000

const ZERO: Insights = {
  urgentes: 0,
  aguardando: 0,
  laraAtiva: 0,
  resolvidosHoje: 0,
  novosLeads: 0,
  dra: 0,
}

export function useInsights() {
  const [insights, setInsights] = useState<Insights>(ZERO)
  const stoppedRef = useRef(false)

  const fetchInsights = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations/insights')
      if (!res.ok) return
      const data = (await res.json()) as Insights
      if (!stoppedRef.current) setInsights(data)
    } catch {
      // silencioso · top bar nao quebra a tela inteira se 1 fetch falhar
    }
  }, [])

  useEffect(() => {
    stoppedRef.current = false
    fetchInsights()
    const interval = setInterval(fetchInsights, REFRESH_INTERVAL_MS)
    return () => {
      stoppedRef.current = true
      clearInterval(interval)
    }
  }, [fetchInsights])

  return { insights, refresh: fetchInsights }
}
