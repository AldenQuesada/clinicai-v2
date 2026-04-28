/**
 * Mira instance resolver · UI source-of-truth pra qual numero envia cada
 * funcao (mira_channels → wa_numbers.phone_number_id).
 *
 * Pedido Alden 2026-04-26: trocar a Mira via UI (nao env var).
 *
 * Cache em memoria · TTL 60s · evita hit Supabase por cron tick.
 * Fallback pra `EVOLUTION_INSTANCE_MIRA` env var (default 'mira-mirian')
 * se canal nao tem wa_number_id ou phone_number_id.
 *
 * Function keys conhecidas (seed em prod):
 *   - mira_admin_outbound · digests, alertas, dispatches admin
 *   - partner_onboarding  · welcome B2B
 *   - partner_voucher_req · admin recebe pedido voucher
 *   - partner_response    · admin responde parceira
 *   - vpi_partner         · Lara VPI parceira
 *   - recipient_voucher   · Lara voucher convidada
 *   - recipient_followup  · Lara follow-up convidada
 */

import { makeMiraRepos } from '@/lib/repos'
import { createServerClient } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { val: string; exp: number }>()

function fallback(): string {
  return process.env.EVOLUTION_INSTANCE_MIRA ?? 'mira-mirian'
}

/**
 * Resolve sender instance pra uma funcao da Mira.
 * Aceita supabase client opcional · se nao passar, cria um (server-side only).
 */
export async function resolveMiraInstance(
  clinicId: string,
  functionKey: string,
  supabase?: SupabaseClient<Database>,
): Promise<string> {
  const cacheKey = `${clinicId}:${functionKey}`
  const hit = cache.get(cacheKey)
  if (hit && hit.exp > Date.now()) return hit.val

  const client = (supabase ?? createServerClient()) as SupabaseClient<Database>
  const repos = makeMiraRepos(client)

  let resolved = fallback()
  try {
    const ch = await repos.miraChannels.resolveInstance(clinicId, functionKey)
    if (ch?.phoneNumberId) {
      resolved = ch.phoneNumberId
    }
  } catch {
    // fallback ja setado
  }

  cache.set(cacheKey, { val: resolved, exp: Date.now() + CACHE_TTL_MS })
  return resolved
}

/**
 * Limpa cache · usar quando admin atualiza mira_channels via UI
 * (action chamar isso depois do update pra refresh imediato).
 */
export function clearMiraInstanceCache(clinicId?: string): void {
  if (!clinicId) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${clinicId}:`)) cache.delete(key)
  }
}
