/**
 * LgpdSection · sec 19 do modal admin legacy.
 *
 * Mirror de `b2b-lgpd-panel.ui.js`. Server Component carrega consents +
 * delega LgpdClient pra interacao (toggles + export + anonymize).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { LgpdClient } from './LgpdClient'

export async function LgpdSection({
  partnershipId,
  partnershipName,
  canManage,
}: {
  partnershipId: string
  partnershipName: string
  canManage: boolean
}) {
  const { repos } = await loadMiraServerContext()
  const consents = await repos.b2bLgpd.consentGet(partnershipId).catch(() => null)

  return (
    <LgpdClient
      partnershipId={partnershipId}
      partnershipName={partnershipName}
      initialConsents={consents?.consents ?? {}}
      canManage={canManage}
    />
  )
}
