/**
 * Partnership detail · tab "Vouchers" · funnel + lista + form de emissao.
 *
 * Server Component carrega lista + funnel · VouchersClient cuida do form
 * inline + acoes (cancel / mark-delivered / copiar link).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { VouchersClient } from './VouchersClient'

export async function VouchersTab({
  partnershipId,
  partnershipName,
  partnershipPhone,
  canManage,
}: {
  partnershipId: string
  partnershipName: string
  partnershipPhone: string
  canManage: boolean
}) {
  void partnershipName
  const { repos } = await loadMiraServerContext()
  const [vouchers, funnel] = await Promise.all([
    repos.b2bVouchers.listByPartnership(partnershipId, 50),
    repos.b2bVouchers.funnel(partnershipId).catch(() => null),
  ])

  return (
    <VouchersClient
      partnershipId={partnershipId}
      partnershipPhone={partnershipPhone}
      initialVouchers={vouchers.map((v) => ({
        id: v.id,
        token: v.token,
        combo: v.combo,
        status: v.status,
        recipientName: v.recipientName,
        recipientPhone: v.recipientPhone,
        validUntil: v.validUntil,
        issuedAt: v.issuedAt,
      }))}
      funnel={funnel}
      canManage={canManage}
    />
  )
}
