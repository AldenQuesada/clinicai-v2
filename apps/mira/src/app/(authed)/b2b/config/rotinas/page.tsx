/**
 * /b2b/config/rotinas · controle dos cron jobs proativos da Mira.
 *
 * Lista os 11 jobs (digests, alerts, reminders, suggestions) com status
 * (enabled/disabled), ultimo run, runs nas ultimas 24h, success rate.
 * Toggle ON/OFF + nota opcional. Owner/admin only.
 *
 * Mig 800-15 cria mira_cron_jobs + mira_cron_runs · seed dos 11 jobs roda
 * pra toda clinic na aplicacao.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { RotinasClient } from './RotinasClient'

export const dynamic = 'force-dynamic'

export default async function RotinasPage() {
  const { repos } = await loadMiraServerContext()
  const jobs = await repos.miraCronRegistry.list().catch(() => [])

  return <RotinasClient initialJobs={jobs} />
}
