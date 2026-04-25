/**
 * Guard Middleware — Pause / AI-enabled check
 *
 * Atomic check: blocks AI response if conversation is paused.
 * Uses `ai_paused_until` timestamp for time-based pausing.
 */

import { createServerClient } from '@/lib/supabase';

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Checks whether the AI agent is allowed to respond to this conversation.
 * Returns { allowed: false } if agent is paused or manually assumed by a human.
 */
export async function checkGuard(conversationId: string): Promise<GuardResult> {
  const supabase = createServerClient();

  const { data: conv, error } = await supabase
    .from('wa_conversations')
    .select('ai_enabled, ai_paused_until, status, paused_by')
    .eq('id', conversationId)
    .single();

  if (error || !conv) {
    return { allowed: false, reason: 'conversation_not_found' };
  }

  // Hard block: human assumed the conversation
  if (conv.ai_enabled === false) {
    return { allowed: false, reason: conv.paused_by || 'human_assumed' };
  }

  // Time-based pause check
  if (conv.ai_paused_until) {
    const pauseEnd = new Date(conv.ai_paused_until);
    if (pauseEnd > new Date()) {
      return { allowed: false, reason: 'paused_until_' + pauseEnd.toISOString() };
    }
    // Pause expired — clear it atomically
    await supabase
      .from('wa_conversations')
      .update({ ai_paused_until: null, paused_by: null, ai_enabled: true })
      .eq('id', conversationId);
  }

  // Conversation archived or resolved
  if (conv.status === 'archived' || conv.status === 'resolved') {
    return { allowed: false, reason: 'conversation_closed' };
  }

  // Verificação de Limite Diário (Daily Limit)
  // Conta mensagens que a Lara enviou nas últimas 24hs
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: dailySent } = await supabase
    .from('wa_messages')
    .select('*', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .eq('sender', 'lara')
    .gte('sent_at', yesterday);

  if (dailySent && dailySent > 45) {
    // Em caso de abuso (spam/looping longo), cessa o bot.
    await supabase.from('wa_conversations').update({
      ai_enabled: false,
      paused_by: 'auto_limit'
    }).eq('id', conversationId);

    // Notifica dashboard antigo · sino com reason 'rate_limit'
    // Pega clinic_id da conversation pra escopar notif corretamente
    try {
      const { data: convRow } = await supabase
        .from('wa_conversations')
        .select('clinic_id, phone')
        .eq('id', conversationId)
        .maybeSingle();
      if (convRow?.clinic_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc('inbox_notification_create', {
          p_clinic_id:       convRow.clinic_id,
          p_conversation_id: conversationId,
          p_source:          'lara',
          p_reason:          'rate_limit',
          p_payload: {
            phone:        convRow.phone,
            daily_count:  dailySent,
            limit:        45,
            triggered_at: new Date().toISOString(),
          },
        });
      }
    } catch (notifErr) {
      console.warn(`[Notif] Falha ao gravar rate_limit notif: ${(notifErr as Error)?.message}`);
    }

    return { allowed: false, reason: 'daily_limit_reached' };
  }

  return { allowed: true };
}

/**
 * Pause the AI agent for N minutes on a conversation.
 * If already paused, ADDS time to the existing pause.
 */
export async function pauseAgent(conversationId: string, minutes: number) {
  const supabase = createServerClient();

  const { data: conv } = await supabase
    .from('wa_conversations')
    .select('ai_paused_until')
    .eq('id', conversationId)
    .single();

  const now = new Date();
  let baseTime = now;

  // If already paused, extend from existing pause end
  if (conv?.ai_paused_until) {
    const existing = new Date(conv.ai_paused_until);
    if (existing > now) {
      baseTime = existing;
    }
  }

  const pauseUntil = new Date(baseTime.getTime() + minutes * 60 * 1000);

  const { error } = await supabase
    .from('wa_conversations')
    .update({
      ai_paused_until: pauseUntil.toISOString(),
      ai_enabled: false,
    })
    .eq('id', conversationId);

  if (error) throw error;

  return {
    isPaused: true,
    remainingTime: minutes + (baseTime > now ? (baseTime.getTime() - now.getTime()) / 60000 : 0),
    pausedAt: now.toISOString(),
    ai_paused_until: pauseUntil.toISOString(),
  };
}

/**
 * Reactivate the AI agent immediately.
 */
export async function reactivateAgent(conversationId: string) {
  const supabase = createServerClient();
  console.log(`[GUARD] Reactivating agent for ${conversationId}`);

  const { error } = await supabase
    .from('wa_conversations')
    .update({
      ai_paused_until: null,
      ai_enabled: true,
      status: 'active'
    })
    .eq('id', conversationId);

  if (error) {
    console.error(`[GUARD] Error reactivating ${conversationId}:`, error);
    throw error;
  }

  console.log(`[GUARD] Agent reactivated successfully for ${conversationId}`);
  return { isPaused: false, remainingTime: 0, pausedAt: null };
}

/**
 * Get current pause status for a conversation.
 */
export async function getPauseStatus(conversationId: string) {
  const supabase = createServerClient();

  const { data: conv } = await supabase
    .from('wa_conversations')
    .select('ai_enabled, ai_paused_until')
    .eq('id', conversationId)
    .single();

  if (!conv) {
    return { isPaused: false, remainingTime: 0, pausedBy: null, pausedAt: null };
  }

  const now = new Date();

  if (conv.ai_paused_until) {
    const pauseEnd = new Date(conv.ai_paused_until);
    if (pauseEnd > now) {
      const remainingMs = pauseEnd.getTime() - now.getTime();
      return {
        isPaused: true,
        remainingTime: remainingMs / 60000, // minutes
        pausedBy: 'dashboard',
        pausedAt: conv.ai_paused_until,
      };
    }
  }

  if (conv.ai_enabled === false) {
    return { isPaused: true, remainingTime: 0, pausedBy: 'manual', pausedAt: null };
  }

  return { isPaused: false, remainingTime: 0, pausedBy: null, pausedAt: null };
}
