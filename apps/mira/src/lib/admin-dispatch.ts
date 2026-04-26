/**
 * Helpers de dispatch pra crons proativos · resolve admin phones e envia.
 *
 * Convencao: admin phones vivem em wa_numbers (clinic-dashboard) com
 * is_active=true. Crons proativos (digests, alerts) enviam pra todas wa_numbers
 * ativas via Evolution Mira instance. Audit em b2b_comm_dispatch_log com
 * recipient_role='admin'.
 *
 * Subscriptions individuais (mig 800-30+): caller pode passar `category` +
 * `msgKey` pra honrar permissions.msg[<key>] dos wa_numbers professional_private.
 * Cron sistemico (anomaly_check etc.) que afeta todos admins NAO passa esses
 * params · entrega broadcast garantido.
 *
 * Best-effort: erros nao param o cron, sao reportados no payload final.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getEvolutionService } from '@/services/evolution.service'
import type { MiraRepos } from '@/lib/repos'
import { createLogger } from '@clinicai/logger'
import {
  filterSubscribers,
  type PermissionCategory,
} from '@/lib/msg-subscriptions'
import { resolveMiraInstance } from '@/lib/mira-instance'

const log = createLogger({ app: 'mira' }).child({ helper: 'admin-dispatch' })

export interface AdminPhone {
  id: string
  phone: string
  isActive: boolean
}

export async function listActiveAdminPhones(
  repos: MiraRepos,
  clinicId: string,
): Promise<AdminPhone[]> {
  const numbers = await repos.waNumbers.listActive(clinicId)
  return numbers.map((n) => ({ id: n.id, phone: n.phone, isActive: n.isActive }))
}

export interface DispatchAdminResult {
  recipients: number
  sent: number
  failed: number
  /** Quantos wa_numbers foram silenciados pela subscription individual. */
  mutedBySubscription?: number
}

export async function dispatchAdminText(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  repos: MiraRepos
  clinicId: string
  eventKey: string
  text: string
  /** Categoria pra filtro subscription · omitido = sistemico, broadcast. */
  category?: PermissionCategory
  /** Key da mensagem · ex: 'agenda.daily_summary'. Obrigatorio se category. */
  msgKey?: string
}): Promise<DispatchAdminResult> {
  // Caminho com subscription · usa wa_numbers professional_private (com
  // permissions.msg) pra filtrar quem optou por nao receber esta msg.
  if (opts.category && opts.msgKey) {
    const all = await opts.repos.waNumbers
      .listProfessionalPrivate(opts.clinicId)
      .catch(() => [])
    const recipients = filterSubscribers(all, opts.category, opts.msgKey)
    const muted = all.filter((n) => n.isActive).length - recipients.length
    if (muted > 0) {
      log.info(
        {
          event_key: opts.eventKey,
          category: opts.category,
          msg_key: opts.msgKey,
          muted,
        },
        'admin_dispatch.muted_by_subscription',
      )
    }
    if (recipients.length === 0) {
      return { recipients: 0, sent: 0, failed: 0, mutedBySubscription: muted }
    }
    const wa = getEvolutionService('mira')
    // Resolve antes do loop · evita N awaits + cache amortiza igual.
    const senderInstance = await resolveMiraInstance(
      opts.clinicId,
      'mira_admin_outbound',
      opts.supabase,
    )
    let sent = 0
    let failed = 0
    for (const r of recipients) {
      try {
        const result = await wa.sendText(r.phone, opts.text)
        await opts.repos.waProAudit.logDispatch({
          clinicId: opts.clinicId,
          eventKey: opts.eventKey,
          channel: 'text',
          recipientRole: 'admin',
          recipientPhone: r.phone,
          senderInstance,
          textContent: opts.text,
          waMessageId: result.messageId ?? null,
          status: result.ok ? 'sent' : 'failed',
          errorMessage: result.error ?? null,
        })
        if (result.ok) sent++
        else failed++
      } catch {
        failed++
      }
    }
    return {
      recipients: recipients.length,
      sent,
      failed,
      mutedBySubscription: muted,
    }
  }

  // Caminho sistemico · broadcast pra todo admin ativo (sem permissions check).
  const phones = await listActiveAdminPhones(opts.repos, opts.clinicId)
  if (phones.length === 0) return { recipients: 0, sent: 0, failed: 0 }

  const wa = getEvolutionService('mira')
  // Resolve antes do loop · UI source-of-truth via mira_channels.
  const senderInstance = await resolveMiraInstance(
    opts.clinicId,
    'mira_admin_outbound',
    opts.supabase,
  )
  let sent = 0
  let failed = 0

  for (const p of phones) {
    try {
      const result = await wa.sendText(p.phone, opts.text)
      await opts.repos.waProAudit.logDispatch({
        clinicId: opts.clinicId,
        eventKey: opts.eventKey,
        channel: 'text',
        recipientRole: 'admin',
        recipientPhone: p.phone,
        senderInstance,
        textContent: opts.text,
        waMessageId: result.messageId ?? null,
        status: result.ok ? 'sent' : 'failed',
        errorMessage: result.error ?? null,
      })
      if (result.ok) sent++
      else failed++
    } catch {
      failed++
    }
  }

  return { recipients: phones.length, sent, failed }
}

/**
 * Tenta executar uma RPC que devolve texto a ser enviado pra admin · best-effort.
 * Se RPC nao existir ou retornar vazio, devolve null (caller pula dispatch).
 */
export async function tryRpcText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  rpcName: string,
  args: Record<string, unknown> = {},
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc(rpcName, args)
    if (error) return null
    if (typeof data === 'string') return data || null
    if (data && typeof data === 'object') {
      const obj = data as { text?: string; message?: string }
      return obj.text || obj.message || null
    }
    return null
  } catch {
    return null
  }
}
