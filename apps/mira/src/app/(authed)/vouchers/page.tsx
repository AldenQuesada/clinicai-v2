/**
 * /vouchers · lista de vouchers com filtros (status, partnership, periodo).
 *
 * Server Component · sem create UI (vouchers sao emitidos via Mira webhook).
 * Click linha vai pra /vouchers/[id] (P2 - placeholder pode ficar).
 */

import Link from 'next/link'
import { Ticket, Filter } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'issued', label: 'Emitido' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'opened', label: 'Aberto' },
  { value: 'redeemed', label: 'Resgatado' },
  { value: 'expired', label: 'Expirado' },
  { value: 'cancelled', label: 'Cancelado' },
]

const PERIOD_OPTIONS = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: '0', label: 'Tudo' },
]

const STATUS_BADGE: Record<string, string> = {
  issued: 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]',
  delivered: 'bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]',
  opened: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]',
  redeemed: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]',
  expired: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]',
  cancelled: 'bg-[hsl(var(--danger))]/10 text-[hsl(var(--danger))]',
}

interface PageProps {
  searchParams: Promise<{
    status?: string
    partnership?: string
    period?: string
  }>
}

export default async function VouchersPage({ searchParams }: PageProps) {
  const params = await searchParams
  const { ctx, repos } = await loadMiraServerContext()

  const days = parseInt(params.period ?? '30', 10)
  const sinceIso = days > 0
    ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
    : undefined

  const [vouchers, allPartnerships] = await Promise.all([
    repos.b2bVouchers.list(ctx.clinic_id, {
      status: (params.status as 'issued' | 'opened' | 'redeemed' | 'expired' | 'cancelled' | 'delivered' | undefined) || undefined,
      partnershipId: params.partnership || undefined,
      sinceIso,
      limit: 200,
    }),
    repos.b2bPartnerships.list(ctx.clinic_id),
  ])

  // Lookup map name por id
  const partnershipNameById = new Map(allPartnerships.map((p) => [p.id, p.name]))

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-start gap-4">
          <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-light">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">Vouchers</span>
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              {vouchers.length} voucher{vouchers.length === 1 ? '' : 's'} no recorte
            </p>
          </div>
        </div>

        <form className="mb-6 flex flex-wrap items-center gap-3 px-4 py-3 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]">
          <Filter className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />

          <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Status</label>
          <select
            name="status"
            defaultValue={params.status || ''}
            className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] ml-2">Parceria</label>
          <select
            name="partnership"
            defaultValue={params.partnership || ''}
            className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-sm"
          >
            <option value="">Todas</option>
            {allPartnerships.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] ml-2">Período</label>
          <select
            name="period"
            defaultValue={params.period || '30'}
            className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-sm"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <button
            type="submit"
            className="px-3 py-1.5 rounded-pill text-[10px] uppercase tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all"
          >
            Aplicar
          </button>
        </form>

        {vouchers.length === 0 ? (
          <div className="text-center py-16 text-sm text-[hsl(var(--muted-foreground))]">
            Nenhum voucher encontrado com os filtros.
          </div>
        ) : (
          <div className="rounded-card border border-[hsl(var(--chat-border))] overflow-hidden bg-[hsl(var(--chat-panel-bg))]">
            <table className="w-full text-sm">
              <thead className="bg-[hsl(var(--muted))]/30 border-b border-[hsl(var(--chat-border))]">
                <tr className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                  <th className="text-left px-4 py-3">Token</th>
                  <th className="text-left px-4 py-3">Recipient</th>
                  <th className="text-left px-4 py-3">Parceria</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Emitido</th>
                  <th className="text-left px-4 py-3">Válido até</th>
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => {
                  const partnerName = partnershipNameById.get(v.partnershipId) ?? '—'
                  return (
                    <tr
                      key={v.id}
                      className="border-b border-[hsl(var(--chat-border))] last:border-0 hover:bg-[hsl(var(--muted))]/20 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{v.token}</td>
                      <td className="px-4 py-3 text-xs">
                        {v.recipientName || '—'}
                        {v.recipientPhone && (
                          <span className="block text-[10px] text-[hsl(var(--muted-foreground))]">
                            {v.recipientPhone}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <Link
                          href={`/partnerships/${v.partnershipId}`}
                          className="text-[hsl(var(--primary))] hover:underline"
                        >
                          {partnerName}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-pill text-[10px] uppercase tracking-widest ${STATUS_BADGE[v.status] ?? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
                          {v.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{fmt(v.issuedAt)}</td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{fmt(v.validUntil)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
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
