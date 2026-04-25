'use server'

import { loadMiraServerContext } from '@/lib/server-context'
import type { AnalyticsBlob } from '@clinicai/repositories'

export async function fetchAnalyticsAction(days: number): Promise<AnalyticsBlob | null> {
  const { repos } = await loadMiraServerContext()
  return repos.b2bAnalytics.get(days || 30)
}
