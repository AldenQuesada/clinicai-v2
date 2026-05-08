/**
 * useAutoSelectFromQuery · seleciona conversa a partir do query param
 * `?conversationId=<uuid>` ao montar a pagina.
 *
 * Fluxo:
 *   1. Le `conversationId` de useSearchParams · valida UUID via regex.
 *   2. Procura na lista `conversations` ja carregada.
 *      - Se achar · setSelectedConversation(found) e finaliza.
 *      - Se nao achar AND hasMore · chama loadMore() · useEffect re-roda
 *        com a proxima pagina. Cap em 5 tentativas pra evitar loop infinito.
 *   3. Se passar do cap ou hasMore=false · `notFound=true` (UI pode mostrar
 *      banner discreto).
 *
 * Reseta quando:
 *   - conversationId muda (new query param)
 *   - usuario seleciona outra conversa manualmente (selectedConversation
 *     muda pra outra)
 *
 * Robustez:
 *   - UUID invalido eh ignorado (notFound=false · sem barulho).
 *   - Sem query param eh no-op total (notFound=false).
 *   - Compatibilidade /conversas (Lara) e /secretaria.
 */

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Conversation } from './useConversations'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LOAD_MORE_ATTEMPTS = 5

interface UseAutoSelectFromQueryArgs {
  conversations: Conversation[]
  selectedConversation: Conversation | null
  setSelectedConversation: (c: Conversation | null) => void
  hasMore: boolean
  isLoadingMore: boolean
  loadMore: () => void | Promise<void>
}

export function useAutoSelectFromQuery({
  conversations,
  selectedConversation,
  setSelectedConversation,
  hasMore,
  isLoadingMore,
  loadMore,
}: UseAutoSelectFromQueryArgs): { notFound: boolean } {
  const searchParams = useSearchParams()
  const targetId = searchParams?.get('conversationId') ?? null
  const isValidUuid = !!targetId && UUID_RE.test(targetId)

  const [notFound, setNotFound] = useState(false)
  const attemptsRef = useRef(0)
  const lastTargetRef = useRef<string | null>(null)
  const didSelectRef = useRef(false)

  useEffect(() => {
    // Reset quando o targetId muda (navegacao pra outra conversa via URL).
    if (lastTargetRef.current !== targetId) {
      lastTargetRef.current = targetId
      attemptsRef.current = 0
      didSelectRef.current = false
      setNotFound(false)
    }

    if (!isValidUuid || didSelectRef.current) return
    if (!conversations || conversations.length === 0) return

    const found = conversations.find((c) => c.conversation_id === targetId)
    if (found) {
      // Evita re-selecionar se ja eh a conversa atual (caso tela carregue
      // ja com a conv certa e useEffect rode varias vezes).
      if (selectedConversation?.conversation_id !== found.conversation_id) {
        setSelectedConversation(found)
      }
      didSelectRef.current = true
      setNotFound(false)
      return
    }

    // Nao achou · tenta proxima pagina se houver e ainda dentro do cap.
    if (hasMore && !isLoadingMore && attemptsRef.current < MAX_LOAD_MORE_ATTEMPTS) {
      attemptsRef.current += 1
      loadMore()
      return
    }

    // Esgotou tentativas e nao achou · marca notFound.
    if (!hasMore || attemptsRef.current >= MAX_LOAD_MORE_ATTEMPTS) {
      setNotFound(true)
    }
  }, [
    targetId,
    isValidUuid,
    conversations,
    selectedConversation,
    setSelectedConversation,
    hasMore,
    isLoadingMore,
    loadMore,
  ])

  return { notFound: isValidUuid ? notFound : false }
}
