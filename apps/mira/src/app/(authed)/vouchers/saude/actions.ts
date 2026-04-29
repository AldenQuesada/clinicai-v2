'use server'

/**
 * Server Actions · /vouchers/saude · admin marca erros como resolvidos.
 */

import { revalidatePath } from 'next/cache'
import { loadMiraServerContext } from '@/lib/server-context'

export interface ResolveResult {
  ok: boolean
  resolved?: number
  error?: string
}

/**
 * Resolve todos os erros de um motivo específico (reason).
 * Usado quando admin corrigiu o secret/config e quer limpar a fila.
 */
export async function resolveErrorsByReasonAction(
  reason: string,
): Promise<ResolveResult> {
  try {
    const { supabase, ctx } = await loadMiraServerContext()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('b2b_voucher_dispatch_errors')
      .update({ resolved_at: new Date().toISOString() })
      .eq('clinic_id', ctx.clinic_id)
      .eq('reason', reason)
      .is('resolved_at', null)
      .select('id')
    if (error) return { ok: false, error: error.message }
    revalidatePath('/vouchers/saude')
    revalidatePath('/vouchers')
    return { ok: true, resolved: (data as unknown[] | null)?.length ?? 0 }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'unknown' }
  }
}

/**
 * Resolve um único erro (botão inline na lista recente).
 */
export async function resolveErrorAction(
  errorId: string,
): Promise<ResolveResult> {
  try {
    const { supabase, ctx } = await loadMiraServerContext()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('b2b_voucher_dispatch_errors')
      .update({ resolved_at: new Date().toISOString() })
      .eq('clinic_id', ctx.clinic_id)
      .eq('id', errorId)
      .is('resolved_at', null)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/vouchers/saude')
    revalidatePath('/vouchers')
    return { ok: true, resolved: 1 }
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'unknown' }
  }
}
