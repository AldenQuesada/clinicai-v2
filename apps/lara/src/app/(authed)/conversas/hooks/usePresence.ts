/**
 * usePresence · presença em tempo real via Supabase Realtime channel.track.
 *
 * P-12 multi-atendente · Fase 3 (presença) + Fase 4 (typing).
 * Doc: docs/audits/2026-04-29-p12-multi-atendente-projeto.html
 *
 * Como funciona:
 *  1. Conecta no canal `presence:${channelKey}` (presence config no canal)
 *  2. .track({user_id, full_name, avatar_url, typing, joined_at})
 *  3. Listen pra `presence sync/join/leave` events
 *  4. sendTyping(true) atualiza o próprio track · throttle de 2s no caller
 *  5. Cleanup em unmount + visibility change (tab hide → leave)
 *
 * channelKey naming:
 *  - 'inbox'                       → toda Lara (sidebar avatares)
 *  - 'conversation:{conv_id}'      → uma conversa (linha "X vendo")
 *
 * Multi-tenant: caller passa clinic_id no prefix · keys ficam isoladas por
 * clinic. Sem isso, dois clinics no mesmo Supabase vazariam presença.
 */

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createBrowserClient } from '@clinicai/supabase/browser'

export interface PresenceUser {
  user_id: string
  full_name: string
  avatar_url: string | null
  typing: boolean
  joined_at: string
}

interface UsePresenceArgs {
  /** Key composta · ex: `clinic-${clinicId}:inbox` ou `clinic-${clinicId}:conversation-${convId}` */
  channelKey: string | null
  /** User payload · null = nao conecta (esperando dados) */
  user: Omit<PresenceUser, 'typing' | 'joined_at'> | null
  /** Default false · habilita envio de typing state pra esse canal */
  trackTyping?: boolean
}

const TYPING_THROTTLE_MS = 1500

export function usePresence({ channelKey, user, trackTyping = false }: UsePresenceArgs) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastTypingSentRef = useRef<{ value: boolean; at: number }>({ value: false, at: 0 })
  const typingResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const joinedAtRef = useRef<string>(new Date().toISOString())

  // Conecta + track + listen
  useEffect(() => {
    if (!channelKey || !user?.user_id) return

    const supabase = createBrowserClient()
    const channelName = `presence:${channelKey}`
    const channel = supabase.channel(channelName, {
      config: {
        presence: { key: user.user_id },
      },
    })
    channelRef.current = channel

    const syncState = () => {
      // presenceState retorna { user_id: [{...}, {...}] } (array por causa de
      // multi-conexao do mesmo user · pegamos sempre o mais recente)
      const state = channel.presenceState() as Record<string, PresenceUser[]>
      const collapsed: PresenceUser[] = []
      for (const list of Object.values(state)) {
        if (Array.isArray(list) && list.length > 0) {
          // pega o mais recente (joined_at mais recente)
          const latest = list.reduce((acc, cur) =>
            !acc || (cur.joined_at ?? '') > (acc.joined_at ?? '') ? cur : acc,
          )
          if (latest && latest.user_id) collapsed.push(latest)
        }
      }
      setOnlineUsers(collapsed)
    }

    channel
      .on('presence', { event: 'sync' }, syncState)
      .on('presence', { event: 'join' }, syncState)
      .on('presence', { event: 'leave' }, syncState)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.user_id,
            full_name: user.full_name,
            avatar_url: user.avatar_url ?? null,
            typing: false,
            joined_at: joinedAtRef.current,
          } satisfies PresenceUser)
        }
      })

    // Untrack ao esconder a aba (vibe "saiu da sala")
    const onVisibility = () => {
      if (document.hidden) {
        channel.untrack()
      } else {
        channel.track({
          user_id: user.user_id,
          full_name: user.full_name,
          avatar_url: user.avatar_url ?? null,
          typing: false,
          joined_at: new Date().toISOString(),
        } satisfies PresenceUser)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      if (typingResetTimerRef.current) clearTimeout(typingResetTimerRef.current)
      channel.untrack().catch(() => {})
      channel.unsubscribe().catch(() => {})
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, user?.user_id, user?.full_name, user?.avatar_url])

  /**
   * Envia typing=true · auto-reset 2s sem chamadas. Throttled em ~1.5s pra
   * nao floodar o canal a cada keystroke.
   */
  const sendTyping = useCallback(
    (value: boolean) => {
      if (!trackTyping) return
      const channel = channelRef.current
      if (!channel || !user?.user_id) return

      const now = Date.now()

      if (value) {
        // Throttle uplinks de "ainda digitando"
        if (
          lastTypingSentRef.current.value === true &&
          now - lastTypingSentRef.current.at < TYPING_THROTTLE_MS
        ) {
          // mesmo throttle, reseta o timer pra continuar com typing=true
        } else {
          channel
            .track({
              user_id: user.user_id,
              full_name: user.full_name,
              avatar_url: user.avatar_url ?? null,
              typing: true,
              joined_at: joinedAtRef.current,
            } satisfies PresenceUser)
            .catch(() => {})
          lastTypingSentRef.current = { value: true, at: now }
        }

        // Auto-reset 2s sem chamadas
        if (typingResetTimerRef.current) clearTimeout(typingResetTimerRef.current)
        typingResetTimerRef.current = setTimeout(() => {
          channel
            .track({
              user_id: user.user_id,
              full_name: user.full_name,
              avatar_url: user.avatar_url ?? null,
              typing: false,
              joined_at: joinedAtRef.current,
            } satisfies PresenceUser)
            .catch(() => {})
          lastTypingSentRef.current = { value: false, at: Date.now() }
        }, 2000)
      } else {
        if (typingResetTimerRef.current) {
          clearTimeout(typingResetTimerRef.current)
          typingResetTimerRef.current = null
        }
        channel
          .track({
            user_id: user.user_id,
            full_name: user.full_name,
            avatar_url: user.avatar_url ?? null,
            typing: false,
            joined_at: joinedAtRef.current,
          } satisfies PresenceUser)
          .catch(() => {})
        lastTypingSentRef.current = { value: false, at: now }
      }
    },
    [trackTyping, user?.user_id, user?.full_name, user?.avatar_url],
  )

  return { onlineUsers, sendTyping }
}
