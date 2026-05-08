/**
 * useAssignmentLogs · fetch + state da pagina /logs.
 *
 * Consome GET /api/logs/assignment-events (commit 822b78e · repo
 * getAssignmentEventsLog · view Mig 148).
 *
 * Padrao identico a useCopilot/useInsights/useSecretariaKpis: fetch nativo
 * + state local · sem polling automatico · refetch manual via refresh().
 *
 * Re-fetcha automaticamente quando filtros mudam (deps no useEffect).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type LogsAction = '' | 'assigned' | 'returned' | 'reassigned' | 'profile_changed' | 'updated'
export type LogsOwner = '' | 'secretaria' | 'alden' | 'mirian' | 'luciana' | 'responsavel'
export type LogsActorRole = '' | 'owner' | 'admin' | 'receptionist' | 'therapist' | 'viewer' | 'anon'

export interface LogsFilters {
  q: string
  action: LogsAction
  fromOwner: LogsOwner
  toOwner: LogsOwner
  actorRole: LogsActorRole
  dateFrom: string
  dateTo: string
  includeTechnical: boolean
  limit: number
}

export const DEFAULT_FILTERS: LogsFilters = {
  q: '',
  action: '',
  fromOwner: '',
  toOwner: '',
  actorRole: '',
  dateFrom: '',
  dateTo: '',
  includeTechnical: false,
  limit: 50,
}

export interface AssignmentLogItem {
  audit_at: string
  assignment_action: string
  from_owner: string
  from_assigned_to_name: string | null
  to_owner: string
  to_assigned_to_name: string | null
  actor_role: string | null
  audit_reason: string | null
  phone: string | null
  display_name: string | null
  status: string | null
  conversation_id: string | null
}

export interface UseAssignmentLogsResult {
  items: AssignmentLogItem[]
  count: number
  isLoading: boolean
  isError: boolean
  hasFetched: boolean
  refresh: () => Promise<void>
}

function buildQueryString(f: LogsFilters): string {
  const params = new URLSearchParams()
  params.set('limit', String(Math.max(1, Math.min(200, f.limit))))
  if (f.action) params.set('action', f.action)
  if (f.fromOwner) params.set('fromOwner', f.fromOwner)
  if (f.toOwner) params.set('toOwner', f.toOwner)
  if (f.actorRole) params.set('actorRole', f.actorRole)
  if (f.q.trim()) params.set('q', f.q.trim())
  if (f.dateFrom) params.set('dateFrom', new Date(f.dateFrom).toISOString())
  if (f.dateTo) params.set('dateTo', new Date(f.dateTo).toISOString())
  if (f.includeTechnical) params.set('includeTechnical', 'true')
  return params.toString()
}

export function useAssignmentLogs(filters: LogsFilters): UseAssignmentLogsResult {
  const [items, setItems] = useState<AssignmentLogItem[]>([])
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isError, setIsError] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const stoppedRef = useRef(false)

  const fetchLogs = useCallback(async (f: LogsFilters) => {
    setIsLoading(true)
    setIsError(false)
    try {
      const qs = buildQueryString(f)
      const res = await fetch(`/api/logs/assignment-events?${qs}`)
      // Defesa contra HTML (auth redirect, etc) · checa content-type antes de parsear.
      const ct = res.headers.get('content-type') || ''
      if (!res.ok || !ct.includes('application/json')) {
        if (!stoppedRef.current) setIsError(true)
        return
      }
      const data = (await res.json()) as { count?: number; items?: AssignmentLogItem[] }
      if (!stoppedRef.current) {
        setItems(Array.isArray(data.items) ? data.items : [])
        setCount(typeof data.count === 'number' ? data.count : 0)
        setIsError(false)
      }
    } catch {
      if (!stoppedRef.current) setIsError(true)
    } finally {
      if (!stoppedRef.current) {
        setIsLoading(false)
        setHasFetched(true)
      }
    }
  }, [])

  // Refetch quando QUALQUER filtro muda. JSON.stringify pra deps estaveis ·
  // evita explosao de re-renders por referencia.
  const filtersKey = JSON.stringify(filters)

  useEffect(() => {
    stoppedRef.current = false
    fetchLogs(filters)
    return () => {
      stoppedRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, fetchLogs])

  const refresh = useCallback(async () => {
    await fetchLogs(filters)
  }, [fetchLogs, filters])

  return { items, count, isLoading, isError, hasFetched, refresh }
}
