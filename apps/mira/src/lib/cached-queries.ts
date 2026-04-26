/**
 * cached-queries · wraps Supabase RPCs com `unstable_cache` (30s TTL).
 *
 * Reduz pressão Supabase em ~90% nas chamadas mais pesadas do AppShell que
 * sao executadas em TODA navegacao authed. Essas RPCs retornam blob denso
 * que muda raramente (segundos a minutos) · cache 30s eh aceitavel.
 *
 * Pedido Alden 2026-04-26 (#11 monitor consumo).
 *
 * Tags:
 *   - analytics:<clinic_id>      · revalidar quando voucher muda status
 *   - critical-alerts:<clinic_id>· revalidar quando partnership muda
 *   - insights:<clinic_id>       · revalidar quando insight novo
 *
 * Mutations devem chamar `revalidateTag('analytics:<clinicId>')` etc.
 * Por enquanto so revalidate-by-time (30s) pra simplicidade.
 */

import { unstable_cache } from 'next/cache'
import {
  B2BAnalyticsRepository,
  B2BInsightsRepository,
  B2BMetricsV2Repository,
  type AnalyticsBlob,
  type CriticalAlert,
  type InsightsGlobal,
} from '@clinicai/repositories'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js'

const TTL = 30 // seconds

/**
 * Analytics blob cacheado · b2b_mira_analytics(p_days).
 * Key = (clinic_id, days). TTL 30s.
 */
export function getCachedAnalytics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
  days: number,
): Promise<AnalyticsBlob | null> {
  const repo = new B2BAnalyticsRepository(supabase)
  return unstable_cache(
    () => repo.get(days).catch(() => null),
    [`analytics-blob:${clinicId}:${days}`],
    { revalidate: TTL, tags: [`analytics:${clinicId}`] },
  )()
}

/**
 * Critical alerts cacheado · b2b_critical_alerts.
 * TTL 30s. Tag: critical-alerts:<clinic_id>.
 */
export function getCachedCriticalAlerts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
): Promise<CriticalAlert[]> {
  const repo = new B2BMetricsV2Repository(supabase)
  return unstable_cache(
    () => repo.criticalAlerts().catch((): CriticalAlert[] => []),
    [`critical-alerts:${clinicId}`],
    { revalidate: TTL, tags: [`critical-alerts:${clinicId}`] },
  )()
}

/**
 * Insights global cacheado · b2b_insights_global.
 * TTL 30s. Tag: insights:<clinic_id>.
 */
export function getCachedInsightsGlobal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
): Promise<InsightsGlobal | null> {
  const repo = new B2BInsightsRepository(supabase)
  return unstable_cache(
    () => repo.global().catch(() => null),
    [`insights-global:${clinicId}`],
    { revalidate: TTL, tags: [`insights:${clinicId}`] },
  )()
}
