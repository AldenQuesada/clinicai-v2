/**
 * WaProAuditRepository · grava em wa_pro_messages + wa_pro_audit_log.
 *
 * Schema canonico nas migs do clinic-dashboard (cluster wa_pro_*). Aqui exponhe
 * apenas o write-path (logQuery) que a Mira usa pra audit cada turno de
 * conversa. UI admin com leitura/dashboards entra na P1.
 *
 * Tx best-effort: se uma das 2 inserts falhar, loga warn mas nao throw ·
 * audit nao deve bloquear resposta da Mira.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface WaProMessageInput {
  clinicId: string
  phone: string
  direction: 'inbound' | 'outbound'
  content: string
  intent?: string | null
  intentData?: Record<string, unknown> | null
  responseMs?: number | null
  status?: string
}

export interface WaProAuditInput {
  clinicId: string
  phone: string
  query: string
  intent?: string | null
  rpcCalled?: string | null
  success: boolean
  resultSummary?: string | null
  errorMessage?: string | null
  responseMs?: number | null
}

export class WaProAuditRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private supabase: SupabaseClient<any>) {}

  /**
   * Loga 1 turn (inbound + audit) · idiomatico pra cada msg processada.
   */
  async logQuery(opts: { msg: WaProMessageInput; audit: WaProAuditInput }): Promise<void> {
    // wa_pro_messages
    try {
      await this.supabase.from('wa_pro_messages').insert({
        clinic_id: opts.msg.clinicId,
        phone: opts.msg.phone,
        direction: opts.msg.direction,
        content: opts.msg.content,
        intent: opts.msg.intent ?? null,
        intent_data: opts.msg.intentData ?? null,
        response_ms: opts.msg.responseMs ?? null,
        status: opts.msg.status ?? 'sent',
      })
    } catch {
      // best-effort · audit nao bloqueia
    }

    // wa_pro_audit_log
    try {
      await this.supabase.from('wa_pro_audit_log').insert({
        clinic_id: opts.audit.clinicId,
        phone: opts.audit.phone,
        query: opts.audit.query,
        intent: opts.audit.intent ?? null,
        rpc_called: opts.audit.rpcCalled ?? null,
        success: opts.audit.success,
        result_summary: opts.audit.resultSummary ?? null,
        error_message: opts.audit.errorMessage ?? null,
        response_ms: opts.audit.responseMs ?? null,
      })
    } catch {
      // best-effort
    }
  }

  /**
   * Loga apenas mensagem (inbound ou outbound) sem audit completo.
   */
  async logMessage(input: WaProMessageInput): Promise<void> {
    try {
      await this.supabase.from('wa_pro_messages').insert({
        clinic_id: input.clinicId,
        phone: input.phone,
        direction: input.direction,
        content: input.content,
        intent: input.intent ?? null,
        intent_data: input.intentData ?? null,
        response_ms: input.responseMs ?? null,
        status: input.status ?? 'sent',
      })
    } catch {
      // ignored
    }
  }

  /**
   * Loga em b2b_comm_dispatch_log (audit trail de toda msg outbound enviada).
   * Bug do clinic-dashboard 2026-04-24: clinic_id NOT NULL faltando deixava
   * dispatch_log zerado em prod. Aqui clinicId e obrigatorio na assinatura.
   */
  async logDispatch(input: {
    clinicId: string
    eventKey: string
    channel: 'text' | 'audio'
    recipientRole: 'partner' | 'beneficiary' | 'admin' | 'unknown'
    recipientPhone: string
    senderInstance: string
    textContent?: string | null
    audioUrl?: string | null
    waMessageId?: string | null
    status: 'sent' | 'failed' | 'skipped'
    errorMessage?: string | null
    partnershipId?: string | null
    templateId?: string | null
    meta?: Record<string, unknown> | null
  }): Promise<void> {
    try {
      await this.supabase.from('b2b_comm_dispatch_log').insert({
        clinic_id: input.clinicId,
        partnership_id: input.partnershipId ?? null,
        template_id: input.templateId ?? null,
        event_key: input.eventKey,
        channel: input.channel,
        recipient_role: input.recipientRole,
        recipient_phone: input.recipientPhone,
        sender_instance: input.senderInstance,
        text_content: input.textContent ? String(input.textContent).slice(0, 2000) : null,
        audio_url: input.audioUrl ?? null,
        wa_message_id: input.waMessageId ?? null,
        status: input.status,
        error_message: input.errorMessage ?? null,
        meta: input.meta ?? null,
      })
    } catch {
      // best-effort
    }
  }
}
