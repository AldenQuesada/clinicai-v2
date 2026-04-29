/**
 * useCopilot · Sprint B (W-01 + W-02 + W-03).
 *
 * Fetcha 1x ao trocar de conversa · UI re-busca quando user clica refresh.
 * Cache server-side em wa_conversations.ai_copilot · client so guarda no state.
 */

import { useState, useEffect, useCallback } from 'react'

export interface CopilotData {
  cached: boolean
  generated_at: string
  summary: string
  next_actions: Array<{ verb: string; target: string; rationale: string }>
  smart_replies: string[]
}

export interface UseCopilotResult {
  copilot: CopilotData | null
  isLoading: boolean
  error: string | null
  /** Re-busca · forceRefresh=true ignora cache server */
  refresh: (forceRefresh?: boolean) => Promise<void>
}

const EMPTY: CopilotData = {
  cached: false,
  generated_at: '',
  summary: '',
  next_actions: [],
  smart_replies: [],
}

export function useCopilot(conversationId: string | null): UseCopilotResult {
  const [copilot, setCopilot] = useState<CopilotData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCopilot = useCallback(
    async (cid: string, forceRefresh = false) => {
      setIsLoading(true)
      setError(null)
      try {
        const url = `/api/conversations/${cid}/copilot${forceRefresh ? '?refresh=1' : ''}`
        const res = await fetch(url)
        if (!res.ok) {
          if (res.status === 402) {
            setError('Limite de IA atingido pra hoje · entre em contato com admin.')
          } else {
            setError(`Falhou ${res.status}`)
          }
          return
        }
        const data = (await res.json()) as CopilotData
        setCopilot(data)
      } catch (e) {
        setError((e as Error).message || 'Erro ao gerar copiloto')
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  // Re-fetcha quando troca conversa
  useEffect(() => {
    if (!conversationId) {
      setCopilot(null)
      setError(null)
      return
    }
    fetchCopilot(conversationId, false)
  }, [conversationId, fetchCopilot])

  const refresh = useCallback(
    async (forceRefresh = true) => {
      if (!conversationId) return
      await fetchCopilot(conversationId, forceRefresh)
    },
    [conversationId, fetchCopilot],
  )

  return { copilot: copilot ?? EMPTY, isLoading, error, refresh }
}
