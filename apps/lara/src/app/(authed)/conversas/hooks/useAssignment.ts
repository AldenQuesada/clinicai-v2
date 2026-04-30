/**
 * useAssignment · estado de assigned_to + assigned_at de uma conversa.
 *
 * P-12 multi-atendente · alimenta AssignmentSection no LeadInfoPanel.
 *
 * Estrategia:
 *  - Estado inicial vem da prop `initial` (caller passa de selectedConversation
 *    pra evitar fetch redundante · valor ja vem com a conversa).
 *  - assignTo / unassign sao otimistas · UI atualiza imediato e re-sync via
 *    fetch da conversa pelo caller (refreshAll).
 */

import { useCallback, useEffect, useState } from 'react'

export interface AssignmentState {
  assignedTo: string | null
  assignedAt: string | null
}

interface UseAssignmentArgs {
  conversationId: string | null
  initial?: AssignmentState
  onChange?: () => void
}

export function useAssignment({ conversationId, initial, onChange }: UseAssignmentArgs) {
  const [state, setState] = useState<AssignmentState>(
    initial ?? { assignedTo: null, assignedAt: null },
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync com prop · troca de conversa muda initial
  useEffect(() => {
    if (initial) setState(initial)
  }, [conversationId, initial?.assignedTo, initial?.assignedAt])

  const assignTo = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!conversationId) return false
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/conversations/${conversationId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || data.ok === false) {
          setError(data.error ?? `HTTP ${res.status}`)
          return false
        }
        setState({
          assignedTo: data.assigned_to ?? userId,
          assignedAt: data.assigned_at ?? new Date().toISOString(),
        })
        onChange?.()
        return true
      } catch (e) {
        setError(e instanceof Error ? e.message : 'unknown')
        return false
      } finally {
        setIsLoading(false)
      }
    },
    [conversationId, onChange],
  )

  const unassign = useCallback(async (): Promise<boolean> => {
    if (!conversationId) return false
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/assign`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        setError(data.error ?? `HTTP ${res.status}`)
        return false
      }
      setState({ assignedTo: null, assignedAt: null })
      onChange?.()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown')
      return false
    } finally {
      setIsLoading(false)
    }
  }, [conversationId, onChange])

  return {
    assignedTo: state.assignedTo,
    assignedAt: state.assignedAt,
    isLoading,
    error,
    assignTo,
    unassign,
  }
}
