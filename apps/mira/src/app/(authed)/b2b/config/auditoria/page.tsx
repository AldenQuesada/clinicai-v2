import { loadMiraServerContext } from '@/lib/server-context'
import { AuditoriaClient } from './AuditoriaClient'

export const dynamic = 'force-dynamic'

const VALID = [
  'created',
  'status_change',
  'health_change',
  'voucher_issued',
  'closure_suggested',
  'attribution_created',
] as const

function parseAction(raw?: string): string | null {
  if (!raw) return null
  return (VALID as readonly string[]).includes(raw) ? raw : null
}

export default async function ConfigAuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>
}) {
  const sp = await searchParams
  const action = parseAction(sp.action)
  const { repos } = await loadMiraServerContext()
  const rows = await repos.b2bSystemHealth
    .auditRecent({ limit: 30, action })
    .catch(() => [])
  return <AuditoriaClient initial={rows} initialAction={action} />
}
