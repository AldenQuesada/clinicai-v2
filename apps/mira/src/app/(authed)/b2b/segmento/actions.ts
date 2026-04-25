'use server'

import { loadMiraServerContext } from '@/lib/server-context'
import type {
  BroadcastFilters,
  BroadcastPreview,
  BroadcastPartnerIds,
} from '@clinicai/repositories'

export async function previewSegmentAction(
  filters: BroadcastFilters,
): Promise<BroadcastPreview> {
  const { repos } = await loadMiraServerContext()
  return repos.b2bCollab.broadcastPreview(filters || {})
}

export async function fetchSegmentIdsAction(
  filters: BroadcastFilters,
): Promise<BroadcastPartnerIds> {
  const { repos } = await loadMiraServerContext()
  return repos.b2bCollab.broadcastPartnerIds(filters || {})
}
