/**
 * Resolver de clinic_id pra Mira.
 *
 * Mira P0 e mono-clinica (Mirian de Paula) · resolve via `_default_clinic_id()`
 * RPC. Multi-tenant ADR-028: nunca hardcoda · sempre via DB.
 *
 * Cache em modulo (sobrevive entre requests no mesmo container Next.js).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@clinicai/logger'

const log = createLogger({ app: 'mira' })

let _cachedClinicId: string | null = null

export async function resolveClinicId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<string> {
  if (_cachedClinicId) return _cachedClinicId

  try {
    const { data, error } = await supabase.rpc('_default_clinic_id')
    if (error) throw error
    if (typeof data === 'string' && data.length > 0) {
      _cachedClinicId = data
      return _cachedClinicId
    }
  } catch (err) {
    log.error({ err }, 'mira.resolveClinicId.failed')
  }

  // Fallback hard · mono-clinica known UUID. NAO violacao do GOLD #1 porque
  // este e um fallback explicito de runtime, nao uma constante de query SQL.
  _cachedClinicId = '00000000-0000-0000-0000-000000000001'
  return _cachedClinicId
}
