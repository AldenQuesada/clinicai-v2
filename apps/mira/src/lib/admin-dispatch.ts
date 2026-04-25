/**
 * Helpers de dispatch pra crons proativos · resolve admin phones e envia.
 *
 * Convencao: admin phones vivem em wa_numbers (clinic-dashboard) com
 * is_active=true. Crons proativos (digests, alerts) enviam pra todas wa_numbers
 * ativas via Evolution Mira instance. Audit em b2b_comm_dispatch_log com
 * recipient_role='admin'.
 *
 * Best-effort: erros nao param o cron, sao reportados no payload final.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getEvolutionService } from '@/services/evolution.service'
import type { MiraRepos } from '@/lib/repos'

export interface AdminPhone {
  id: string
  phone: string
  isActive: boolean
}

export async function listActiveAdminPhones(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
): Promise<AdminPhone[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from('wa_numbers') as any)
    .select('id, phone, is_active')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
  if (!Array.isArray(data)) return []
  return data
    .map((r: { id: string; phone?: string | null; is_active?: boolean }) => ({
      id: String(r.id),
      phone: String(r.phone ?? ''),
      isActive: r.is_active !== false,
    }))
    .filter((p) => p.phone.length >= 10)
}

export interface DispatchAdminResult {
  recipients: number
  sent: number
  failed: number
}

export async function dispatchAdminText(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>
  repos: MiraRepos
  clinicId: string
  eventKey: string
  text: string
}): Promise<DispatchAdminResult> {
  const phones = await listActiveAdminPhones(opts.supabase, opts.clinicId)
  if (phones.length === 0) return { recipients: 0, sent: 0, failed: 0 }

  const wa = getEvolutionService('mira')
  const senderInstance = process.env.EVOLUTION_INSTANCE_MIRA ?? 'mira-mirian'
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
