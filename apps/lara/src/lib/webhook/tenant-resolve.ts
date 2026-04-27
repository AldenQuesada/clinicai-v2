/**
 * Resolução de clinic_id do payload Meta · ADR-028.
 *
 * Webhook Cloud envia phone_number_id em entry[0].changes[0].value.metadata.
 * Esse ID identifica qual número da Mirian recebeu a mensagem · resolve pra clinic_id
 * via RPC wa_numbers_resolve_by_phone_number_id (mig 848 + 849).
 *
 * Caminho feliz: clinic_id é DINÂMICO por request (multi-tenant correto).
 *
 * Audit fix N23 (2026-04-27): fail-fast opcional via env LARA_TENANT_FAILFAST.
 *  - Se 'true': lança erro quando RPC falha (mass-message safety pra multi-tenant)
 *  - Default: continua com FALLBACK_CLINIC_ID (transição enquanto wa_numbers populado)
 *
 * Quando todos os wa_numbers estiverem cadastrados, ligar LARA_TENANT_FAILFAST=true
 * em prod e remover fallback completamente em PR seguinte.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'lara' })

// Fallback pro clinic_id da Mirian · usado SOMENTE se RPC retornar null E
// LARA_TENANT_FAILFAST != 'true'. No caminho feliz, clinic_id é dinâmico
// via wa_numbers_resolve.
export const FALLBACK_CLINIC_ID = '00000000-0000-0000-0000-000000000001'

export class TenantResolveError extends Error {
  constructor(message: string, public readonly phoneNumberId: string | null) {
    super(message)
    this.name = 'TenantResolveError'
  }
}

export interface TenantContext {
  clinic_id: string
  wa_number_id: string | null
}

/**
 * Resolve clinic_id + wa_number_id via RPC wa_numbers_resolve_by_phone_number_id.
 * ADR-028 multi-tenant · clinic_id NUNCA hardcoded em request.
 *
 * Modos:
 *  - LARA_TENANT_FAILFAST=true · throw TenantResolveError (recomendado pra multi-tenant)
 *  - default · log warn + fallback pro UUID Mirian (transição)
 */
export async function resolveTenantContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  phoneNumberId: string | null,
): Promise<TenantContext> {
  const failFast = process.env.LARA_TENANT_FAILFAST === 'true'

  if (!phoneNumberId) {
    log.warn({ phone_number_id: null, fail_fast: failFast }, 'tenant.resolve.fallback.missing_id')
    if (failFast) {
      throw new TenantResolveError('phone_number_id ausente no payload Meta', null)
    }
    return { clinic_id: FALLBACK_CLINIC_ID, wa_number_id: null }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('wa_numbers_resolve_by_phone_number_id', {
    p_phone_number_id: phoneNumberId,
  })
  if (error || !data?.ok) {
    log.warn(
      { phone_number_id: phoneNumberId, err: error?.message ?? data?.error, fail_fast: failFast },
      'tenant.resolve.fallback.rpc_failed',
    )
    if (failFast) {
      throw new TenantResolveError(
        `wa_number desconhecido pra phone_number_id=${phoneNumberId}`,
        phoneNumberId,
      )
    }
    return { clinic_id: FALLBACK_CLINIC_ID, wa_number_id: null }
  }
  return {
    clinic_id: data.clinic_id as string,
    wa_number_id: (data.wa_number_id as string) ?? null,
  }
}
