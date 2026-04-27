/**
 * Partnership detail · tab "Vouchers" · funnel + lista + form de emissao.
 *
 * Server Component carrega lista + funnel · VouchersClient cuida do form
 * inline + acoes (cancel / mark-delivered / copiar link).
 *
 * Pedido Alden 2026-04-26: form de emissao precisa puxar combo padrao da
 * parceria + lista de convidadas anteriores (autocomplete) + validar phone.
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
  void partnershipPhone // legacy · convidada usa proprio phone, nao da parceira
  const { repos } = await loadMiraServerContext()
  const [vouchers, funnel, partnership] = await Promise.all([
    repos.b2bVouchers.listByPartnership(partnershipId, 50),
    repos.b2bVouchers.funnel(partnershipId).catch(() => null),
    repos.b2bPartnerships.getById(partnershipId).catch(() => null),
  ])

  // Convidadas anteriores · autocomplete por nome+phone (dedup por phone)
  const previousRecipientsMap = new Map<string, { name: string; phone: string }>()
  for (const v of vouchers) {
    if (v.recipientName && v.recipientPhone) {
      const key = v.recipientPhone.replace(/\D/g, '')
      if (key.length >= 10 && !previousRecipientsMap.has(key)) {
        previousRecipientsMap.set(key, {
          name: v.recipientName,
          phone: v.recipientPhone,
        })
      }
    }
  }
  const previousRecipients = Array.from(previousRecipientsMap.values())

  return (
    <VouchersClient
      partnershipId={partnershipId}
      partnershipCombo={partnership?.voucherCombo ?? null}
      partnershipValidityDays={partnership?.voucherValidityDays ?? 30}
      previousRecipients={previousRecipients}
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
