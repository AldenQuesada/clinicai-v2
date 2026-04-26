/**
 * ContratoTab · Server Component · fetcha contrato + atividades em paralelo.
 * Renderiza ContratoClient (CRUD interativo).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { ContratoClient } from './ContratoClient'

export async function ContratoTab({
  partnershipId,
  canManage,
}: {
  partnershipId: string
  canManage: boolean
}) {
  const { repos } = await loadMiraServerContext()
  const [contract, activities] = await Promise.all([
    repos.b2bPartnershipContracts.getContract(partnershipId).catch(() => null),
    repos.b2bPartnershipContracts.listActivities(partnershipId).catch(() => []),
  ])

  return (
    <ContratoClient
      partnershipId={partnershipId}
      canManage={canManage}
      initialContract={contract}
      initialActivities={activities}
    />
  )
}
