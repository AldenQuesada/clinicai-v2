/**
 * Tab "Vouchers" da parceria · lista vouchers desta parceria.
 */

import { loadMiraServerContext } from '@/lib/server-context'

const STATUS_LABEL: Record<string, string> = {
  issued: 'Emitido',
  delivered: 'Entregue',
  opened: 'Aberto',
  redeemed: 'Resgatado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
}

export async function VouchersTab({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const vouchers = await repos.b2bVouchers.listByPartnership(partnershipId, 100)

  if (vouchers.length === 0) {
    return (
      <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Esta parceria ainda não tem vouchers emitidos.
      </div>
    )
  }

  return (
    <div className="rounded-card border border-[hsl(var(--chat-border))] overflow-hidden bg-[hsl(var(--chat-panel-bg))]">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--muted))]/30 border-b border-[hsl(var(--chat-border))]">
          <tr className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
            <th className="text-left px-4 py-3">Token</th>
            <th className="text-left px-4 py-3">Recipient</th>
            <th className="text-left px-4 py-3">Combo</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Emitido</th>
            <th className="text-left px-4 py-3">Validade</th>
          </tr>
        </thead>
        <tbody>
          {vouchers.map((v) => (
            <tr key={v.id} className="border-b border-[hsl(var(--chat-border))] last:border-0">
              <td className="px-4 py-3 font-mono text-xs">{v.token}</td>
              <td className="px-4 py-3 text-xs">
                {v.recipientName || '—'}
                {v.recipientPhone && (
                  <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">
                    {v.recipientPhone}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-xs">{v.combo || '—'}</td>
              <td className="px-4 py-3">
                <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-pill bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                  {STATUS_LABEL[v.status] ?? v.status}
                </span>
              </td>
              <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{fmt(v.issuedAt)}</td>
              <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{fmt(v.validUntil)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function fmt(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return iso
  }
}
