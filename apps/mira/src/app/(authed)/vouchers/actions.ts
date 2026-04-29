'use server'

/**
 * Server Actions · /vouchers · admin retomar controle quando audio falhou.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

export interface ResendAudioResult {
  ok: boolean
  error?: string
  detail?: string
  requestId?: number
}

/**
 * Reenvia audio do voucher · chama RPC b2b_voucher_audio_resend (Fase 1).
 * RPC e SECURITY DEFINER + checa is_admin internamente.
 * skip_if_sent=false · forca reenvio mesmo se audio_sent_at populado.
 */
export async function resendVoucherAudioAction(
  voucherId: string,
): Promise<ResendAudioResult> {
  try {
    const { supabase } = await loadMiraServerContext()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('b2b_voucher_audio_resend', {
      p_voucher_id: voucherId,
    })
    if (error) {
      return { ok: false, error: error.message }
    }
    if (data && data.ok === false) {
      return { ok: false, error: data.error, detail: data.detail }
    }
    revalidatePath('/vouchers')
    return {
      ok: true,
      requestId: data?.request_id,
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'unknown' }
  }
}
