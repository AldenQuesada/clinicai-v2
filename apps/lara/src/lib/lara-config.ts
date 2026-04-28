/**
 * Helper para ler config runtime da Lara (chave 'lara_config' em clinic_data).
 *
 * Mesma fonte que o form /configuracoes salva. Defaults explicitos pra evitar
 * "configurei mas nao mudou nada" — se DB nao tem, usa default daqui.
 *
 * Cache em memoria por 30s · evita 1 query por mensagem (high-frequency code path).
 */

import { ClinicDataRepository } from '@clinicai/repositories'
import { createServerClient } from '@/lib/supabase'

export interface LaraConfig {
  model: string
  daily_budget_usd: number
  daily_message_limit: number
  auto_pause_minutes: number
  disparo_cooldown_minutes: number
  compact_after: number
}

export const DEFAULT_LARA_CONFIG: LaraConfig = {
  model: 'claude-sonnet-4-6',
  daily_budget_usd: 5.0,
  daily_message_limit: 45,
  auto_pause_minutes: 30,
  disparo_cooldown_minutes: 30,
  compact_after: 6,
}

interface CacheEntry {
  config: LaraConfig
  expiresAt: number
}

const CACHE_TTL_MS = 30_000
const cache = new Map<string, CacheEntry>()

export async function getLaraConfig(clinicId: string): Promise<LaraConfig> {
  if (!clinicId) return DEFAULT_LARA_CONFIG

  const cached = cache.get(clinicId)
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return cached.config
  }

  try {
    const supabase = createServerClient()
    const repo = new ClinicDataRepository(supabase)
    const stored = await repo.getSetting<Partial<LaraConfig>>(clinicId, 'lara_config')
    const config = { ...DEFAULT_LARA_CONFIG, ...(stored ?? {}) }
    cache.set(clinicId, { config, expiresAt: now + CACHE_TTL_MS })
    return config
  } catch {
    return DEFAULT_LARA_CONFIG
  }
}

/**
 * Invalida cache imediatamente · chamada apos saveLaraConfigAction pra
 * mudancas refletirem no proximo request sem aguardar TTL.
 */
export function invalidateLaraConfigCache(clinicId?: string) {
  if (clinicId) {
    cache.delete(clinicId)
  } else {
    cache.clear()
  }
}
