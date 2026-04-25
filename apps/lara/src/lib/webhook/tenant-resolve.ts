/**
 * Resolução de clinic_id do payload Meta · ADR-028.
 *
 * Webhook Cloud envia phone_number_id em entry[0].changes[0].value.metadata.
 * Esse ID identifica qual número da Mirian recebeu a mensagem · resolve pra clinic_id
 * via RPC wa_numbers_resolve_by_phone_number_id (mig 848 + 849).
 *
 * Caminho feliz: clinic_id é DINÂMICO por request (multi-tenant correto).
 * Caminho fallback: usa Mirian (00000000-0000-0000-0000-000000000001) · audit warn.
 *
 * Fallback existe apenas pra não perder mensagens enquanto wa_numbers
 * está sendo populado. Quando todos os números estiverem cadastrados,
 * o fallback deve virar fail-fast (throw) num PR futuro.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'lara' })

// Fallback pro clinic_id da Mirian · usado SOMENTE se RPC retornar null.
// No caminho feliz, clinic_id e dinamico via wa_numbers_resolve.
export const FALLBACK_CLINIC_ID = '00000000-0000-0000-0000-000000000001'

export interface TenantContext {
  clinic_id: string
  wa_number_id: string | null
}

/**
 * Resolve clinic_id + wa_number_id via RPC wa_numbers_resolve_by_phone_number_id.
 * ADR-028 multi-tenant · clinic_id NUNCA hardcoded em request.
 */
export async function resolveTenantContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  phoneNumberId: string | null,
): Promise<TenantContext> {
  if (!phoneNumberId) {
    log.warn({ phone_number_id: null }, 'tenant.resolve.fallback.missing_id')
    return { clinic_id: FALLBACK_CLINIC_ID, wa_number_id: null }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('wa_numbers_resolve_by_phone_number_id', {
    p_phone_number_id: phoneNumberId,
  })
  if (error || !data?.ok) {
    log.warn(
      { phone_number_id: phoneNumberId, err: error?.message ?? data?.error },
      'tenant.resolve.fallback.rpc_failed',
    )
    return { clinic_id: FALLBACK_CLINIC_ID, wa_number_id: null }
  }
  return {
    clinic_id: data.clinic_id as string,
    wa_number_id: (data.wa_number_id as string) ?? null,
  }
}
