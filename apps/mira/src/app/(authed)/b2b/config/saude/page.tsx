import { loadMiraServerContext } from '@/lib/server-context'
import { ConfigSaudeClient } from './ConfigSaudeClient'

export const dynamic = 'force-dynamic'

export default async function ConfigSaudePage() {
  const { repos } = await loadMiraServerContext()
  const snapshot = await repos.b2bSystemHealth.snapshot().catch(() => null)
  return <ConfigSaudeClient initial={snapshot} />
}
