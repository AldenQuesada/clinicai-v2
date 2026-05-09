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
  /**
   * SmartReplies B (2026-05-07) · true depois da PRIMEIRA tentativa de fetch
   * pra essa conversa (sucesso OU falha · não conta o ciclo loading inicial).
   * Permite UI distinguir "ainda buscando" de "buscou e veio vazio" pra mostrar
   * hint discreto só após resposta real.
   */
  hasFetched: boolean
  /** Re-busca · forceRefresh=true ignora cache server */
  refresh: (forceRefresh?: boolean) => Promise<void>
}

/**
 * J3 opcao B (2026-05-08) · opcoes do hook.
 *  - scope='full' (default · /conversas) · summary + next_actions + smart_replies
 *  - scope='smart_replies' (/secretaria) · apenas smart_replies do servidor ·
 *    summary='' e next_actions=[] no payload · zero cache write server-side.
 */
export interface UseCopilotOptions {
  scope?: 'smart_replies' | 'full'
}

const EMPTY: CopilotData = {
  cached: false,
  generated_at: '',
  summary: '',
  next_actions: [],
  smart_replies: [],
}

export function useCopilot(
  conversationId: string | null,
  options?: UseCopilotOptions,
): UseCopilotResult {
  const scope = options?.scope ?? 'full'
  const [copilot, setCopilot] = useState<CopilotData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // SmartReplies B (2026-05-07) · vira true ao fim da primeira tentativa de
  // fetch (sucesso OU erro). Reseta ao trocar conversa pra não vazar estado
  // "fetched" entre conversas distintas.
  const [hasFetched, setHasFetched] = useState(false)

  const fetchCopilot = useCallback(
    async (cid: string, forceRefresh = false) => {
      setIsLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (forceRefresh) params.set('refresh', '1')
        if (scope === 'smart_replies') params.set('scope', 'smart_replies')
        const qs = params.toString()
        const url = `/api/conversations/${cid}/copilot${qs ? `?${qs}` : ''}`
        const res = await fetch(url)
        // Auth/API Hardening A (2026-05-08) · checa content-type antes de
        // parsear · sessao expirada/rate-limited devolve JSON 401 (nao mais
        // HTML do /login · mig middleware). Defesa extra: se response NAO
        // for application/json (401 plain · proxy injetando algo), trata
        // como erro generico em vez de crashar com Unexpected token.
        const ct = res.headers.get('content-type') || ''
        if (!res.ok || !ct.includes('application/json')) {
          if (res.status === 402) {
            setError('Limite de IA do dia atingido')
          } else {
            setError('Sugestões indisponíveis agora')
          }
          return
        }
        const data = (await res.json()) as CopilotData
        setCopilot(data)
      } catch {
        // SmartReplies B · msg genérica · stack trace fica no console do
        // browser (fetch lança Error padrão), não vaza pro usuário final.
        setError('Sugestões indisponíveis agora')
      } finally {
        setIsLoading(false)
        setHasFetched(true)
      }
    },
    [scope],
  )

  // Re-fetcha quando troca conversa
  useEffect(() => {
    if (!conversationId) {
      setCopilot(null)
      setError(null)
      setHasFetched(false)
      return
    }
    setHasFetched(false)
    fetchCopilot(conversationId, false)
  }, [conversationId, fetchCopilot])

  const refresh = useCallback(
    async (forceRefresh = true) => {
      if (!conversationId) return
      await fetchCopilot(conversationId, forceRefresh)
    },
    [conversationId, fetchCopilot],
  )

  return { copilot: copilot ?? EMPTY, isLoading, error, hasFetched, refresh }
}
