/**
 * useAssignmentEvents · historico semantico de transferencias da conversa.
 *
 * Fonte: GET /api/conversations/[id]/assignment-events?limit=10
 * (endpoint Mig 148 view + repo getAssignmentEvents).
 *
 * Padrao identico a useCopilot/useInsights:
 *   - fetch ao mudar conversationId
 *   - refetch manual via refresh()
 *   - sem polling (decisao de produto · manual eh suficiente)
 *   - silencioso em erro (UI mostra mensagem amigavel)
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface AssignmentEvent {
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
}

export interface UseAssignmentEventsResult {
  items: AssignmentEvent[]
  isLoading: boolean
  isError: boolean
  hasFetched: boolean
  refresh: () => Promise<void>
}

export function useAssignmentEvents(
  conversationId: string | null,
  limit = 10,
): UseAssignmentEventsResult {
  const [items, setItems] = useState<AssignmentEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isError, setIsError] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const stoppedRef = useRef(false)

  const fetchEvents = useCallback(
    async (cid: string) => {
      setIsLoading(true)
      setIsError(false)
      try {
        const res = await fetch(`/api/conversations/${cid}/assignment-events?limit=${limit}`)
        if (!res.ok) {
          if (!stoppedRef.current) setIsError(true)
          return
        }
        const data = (await res.json()) as { items?: AssignmentEvent[] }
        if (!stoppedRef.current) {
          setItems(Array.isArray(data.items) ? data.items : [])
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
    },
    [limit],
  )

  useEffect(() => {
    stoppedRef.current = false
    if (!conversationId) {
      setItems([])
      setIsError(false)
      setHasFetched(false)
      return
    }
    setHasFetched(false)
    fetchEvents(conversationId)
    return () => {
      stoppedRef.current = true
    }
  }, [conversationId, fetchEvents])

  const refresh = useCallback(async () => {
    if (!conversationId) return
    await fetchEvents(conversationId)
  }, [conversationId, fetchEvents])

  return { items, isLoading, isError, hasFetched, refresh }
}
