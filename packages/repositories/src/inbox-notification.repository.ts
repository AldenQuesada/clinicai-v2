/**
 * InboxNotificationRepository · wrapper pra RPC `inbox_notification_create`.
 *
 * Notifica dashboard antigo (clinic-dashboard) via tabela inbox_notifications.
 * Sino com badge cross-app · usado em handoff humano + rate_limit + outros
 * gatilhos no futuro.
 *
 * Multi-tenant ADR-028 · payload exige clinic_id (caller resolve).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { InboxNotificationInput } from './types'

export class InboxNotificationRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Cria notificacao via RPC · throw em erro pra caller decidir log/silencio.
   */
  async create(input: InboxNotificationInput): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase as any).rpc('inbox_notification_create', {
      p_clinic_id: input.clinicId,
      p_conversation_id: input.conversationId,
      p_source: input.source,
      p_reason: input.reason,
      p_payload: input.payload,
    })

    if (error) {
      throw new Error(`inbox_notification.create.failed: ${error.message}`)
    }
  }
}
