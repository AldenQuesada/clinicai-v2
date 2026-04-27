/**
 * Guard Middleware · checa pause + daily limit antes de IA responder.
 *
 * Reescrito sobre ConversationRepository + MessageRepository + InboxNotificationRepository
 * (ADR-012 · UI/Service nunca chama supabase.from direto).
 *
 * `paused_by` e leitura por id · ainda tocamos supabase aqui pra getById/clear pause
 * via repository. Daily limit usa MessageRepository.countLaraOutboundSince +
 * ConversationRepository.updateAiPause.
 */

import { createServerClient } from '@/lib/supabase'
import { makeRepos } from '@/lib/repos'

export interface GuardResult {
  allowed: boolean
  reason?: string
}

const DAILY_LIMIT = 45

export async function checkGuard(conversationId: string): Promise<GuardResult> {
  const supabase = createServerClient()
  const repos = makeRepos(supabase)

  const conv = await repos.conversations.getById(conversationId)
  if (!conv) return { allowed: false, reason: 'conversation_not_found' }

  if (conv.aiEnabled === false) {
    return { allowed: false, reason: conv.pausedBy || 'human_assumed' }
  }

  if (conv.aiPausedUntil) {
    const pauseEnd = new Date(conv.aiPausedUntil)
    if (pauseEnd > new Date()) {
      return { allowed: false, reason: 'paused_until_' + pauseEnd.toISOString() }
    }
    // Pause expirou · limpa atomicamente · libera IA
    await repos.conversations.updateAiPause(conversationId, {
      pausedUntil: null,
      aiEnabled: true,
      pausedBy: null,
    })
  }

  if (conv.status === 'archived' || conv.status === 'resolved') {
    return { allowed: false, reason: 'conversation_closed' }
  }

  // Daily limit · 24h
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const dailySent = await repos.messages.countLaraOutboundSince(conversationId, yesterday)

  if (dailySent > DAILY_LIMIT) {
    await repos.conversations.updateAiPause(conversationId, {
      pausedUntil: null,
      aiEnabled: false,
      pausedBy: 'auto_limit',
    })

    // Notifica dashboard antigo · sino com reason 'rate_limit'
    try {
      await repos.inboxNotifications.create({
        clinicId: conv.clinicId,
        conversationId,
        source: 'lara',
        reason: 'rate_limit',
        payload: {
          phone: conv.phone,
          daily_count: dailySent,
          limit: DAILY_LIMIT,
          triggered_at: new Date().toISOString(),
        },
      })
    } catch (notifErr) {
      console.warn(`[Notif] Falha rate_limit: ${(notifErr as Error)?.message}`)
    }

    return { allowed: false, reason: 'daily_limit_reached' }
  }

  return { allowed: true }
}

/**
 * Pausa IA por N minutos · soma se ja pausada (estende pausa em vez de truncar).
 */
export async function pauseAgent(conversationId: string, minutes: number) {
  const supabase = createServerClient()
  const repos = makeRepos(supabase)

  const conv = await repos.conversations.getById(conversationId)
  const now = new Date()
  let baseTime = now

  if (conv?.aiPausedUntil) {
    const existing = new Date(conv.aiPausedUntil)
    if (existing > now) baseTime = existing
  }

  const pauseUntil = new Date(baseTime.getTime() + minutes * 60 * 1000)
  await repos.conversations.updateAiPause(conversationId, {
    pausedUntil: pauseUntil.toISOString(),
    aiEnabled: false,
  })

  return {
    isPaused: true,
    remainingTime:
      minutes + (baseTime > now ? (baseTime.getTime() - now.getTime()) / 60000 : 0),
    pausedAt: now.toISOString(),
    ai_paused_until: pauseUntil.toISOString(),
  }
}

export async function reactivateAgent(conversationId: string) {
  const supabase = createServerClient()
  const repos = makeRepos(supabase)
  console.log(`[GUARD] Reactivating agent for ${conversationId}`)

  await repos.conversations.updateAiPause(conversationId, {
    pausedUntil: null,
    aiEnabled: true,
    status: 'active',
  })

  console.log(`[GUARD] Agent reactivated successfully for ${conversationId}`)
  return { isPaused: false, remainingTime: 0, pausedAt: null }
}

export async function getPauseStatus(conversationId: string) {
  const supabase = createServerClient()
  const repos = makeRepos(supabase)

  const conv = await repos.conversations.getById(conversationId)
  if (!conv) return { isPaused: false, remainingTime: 0, pausedBy: null, pausedAt: null }

  const now = new Date()

  if (conv.aiPausedUntil) {
    const pauseEnd = new Date(conv.aiPausedUntil)
    if (pauseEnd > now) {
      const remainingMs = pauseEnd.getTime() - now.getTime()
      // Audit fix N27 (2026-04-27): usa pausedBy real do DTO, não hardcoded.
      // Antes mostrava 'dashboard' mesmo quando veio de human_handoff/auto_limit.
      return {
        isPaused: true,
        remainingTime: remainingMs / 60000,
        pausedBy: conv.pausedBy || 'dashboard',
        pausedAt: conv.aiPausedUntil,
      }
    }
  }

  if (conv.aiEnabled === false) {
    return { isPaused: true, remainingTime: 0, pausedBy: 'manual', pausedAt: null }
  }

  return { isPaused: false, remainingTime: 0, pausedBy: null, pausedAt: null }
}
