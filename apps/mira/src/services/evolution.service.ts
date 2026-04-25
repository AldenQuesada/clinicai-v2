/**
 * Evolution service singleton · resolve providers por instance name.
 *
 * Mira fala com 2 instancias:
 * - mira-mirian (parceiras + admin · default outbound)
 * - Mih (recipient_voucher dispatch · pra convidada)
 *
 * Resolve via env vars:
 *   EVOLUTION_INSTANCE_MIRA → mira-mirian
 *   EVOLUTION_INSTANCE_MIH  → Mih
 *
 * Caller usa:
 *   const wa = getEvolutionService('mira')
 *   await wa.sendText(phone, 'oi')
 */

import { EvolutionService, createEvolutionService } from '@clinicai/whatsapp'

const _cache = new Map<string, EvolutionService>()

export type EvolutionTarget = 'mira' | 'mih'

export function getEvolutionService(target: EvolutionTarget = 'mira'): EvolutionService {
  if (_cache.has(target)) {
    return _cache.get(target) as EvolutionService
  }
  const envVar = target === 'mira' ? 'EVOLUTION_INSTANCE_MIRA' : 'EVOLUTION_INSTANCE_MIH'
  const svc = createEvolutionService(envVar)
  _cache.set(target, svc)
  return svc
}
