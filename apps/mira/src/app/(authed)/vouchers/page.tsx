/**
 * /vouchers · lista admin densa de vouchers com filtros.
 *
 * Server Component · sem create UI (vouchers sao emitidos via Mira webhook).
 * Visual mirror mira-config antigo · row pattern + status pills,
 * filtros em linha gold-tinted, max-w-[960px].
 */

import Link from 'next/link'
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

const STATUS_PILL: Record<string, string> = {
  issued: 'bg-[#C9A96E]/18 text-[#C9A96E]',
  delivered: 'bg-[#C9A96E]/18 text-[#C9A96E]',
  opened: 'bg-[#10B981]/15 text-[#10B981]',
  redeemed: 'bg-[#10B981]/15 text-[#10B981]',
  expired: 'bg-white/10 text-[#9CA3AF]',
  cancelled: 'bg-[#EF4444]/15 text-[#FCA5A5]',
}

const STATUS_LABEL: Record<string, string> = {
  issued: 'Emitido',
  delivered: 'Entregue',
  opened: 'Aberto',
  redeemed: 'Resgatado',
  expired: 'Expirado',
  cancelled: 'Cancelado',
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

  const partnershipNameById = new Map(allPartnerships.map((p) => [p.id, p.name]))

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[960px] mx-auto px-6 py-6 flex flex-col gap-3">
        {/* Header denso */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div>
            <span className="eyebrow text-[#C9A96E]">Hoje · Vouchers em curso</span>
            <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">Vouchers</h1>
            <p className="text-[11px] text-[#9CA3AF] mt-1">
              {vouchers.length} voucher{vouchers.length === 1 ? '' : 's'} no recorte
            </p>
          </div>
          <Link
            href="/vouchers/bulk"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#0a0a0a] hover:opacity-90 transition-opacity"
          >
            + Lote
          </Link>
        </div>

        {/* Filtros · gold tinted form */}
        <form className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] px-3.5 py-3 flex items-center gap-2.5 flex-wrap">
          <FilterField
            label="Status"
            name="status"
            defaultValue={params.status || ''}
            options={STATUS_OPTIONS}
          />
          <FilterField
            label="Parceria"
            name="partnership"
            defaultValue={params.partnership || ''}
            options={[
              { value: '', label: 'Todas' },
              ...allPartnerships.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <FilterField
            label="Período"
            name="period"
            defaultValue={params.period || '30'}
            options={PERIOD_OPTIONS}
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors ml-auto"
          >
            Aplicar
          </button>
        </form>

        {/* Lista densa */}
        {vouchers.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
            Nenhum voucher encontrado com os filtros.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {vouchers.map((v) => {
              const partnerName = partnershipNameById.get(v.partnershipId) ?? '—'
              const pill = STATUS_PILL[v.status] ?? 'bg-white/10 text-[#9CA3AF]'
              const label = STATUS_LABEL[v.status] ?? v.status
              return (
                <div
                  key={v.id}
                  className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-3.5 py-2.5 bg-white/[0.02] border border-white/10 rounded-lg hover:border-white/14 transition-colors"
                >
                  <span className="font-mono text-[11px] text-[#C9A96E]">{v.token}</span>

                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-xs text-[#F5F0E8] truncate">
                      {v.recipientName || '—'}
                      <span className="ml-2">
                        <Link
                          href={`/partnerships/${v.partnershipId}`}
                          className="text-[#C9A96E] hover:underline text-[11px]"
                        >
                          {partnerName}
                        </Link>
                      </span>
                    </span>
                    {v.recipientPhone && (
                      <span className="text-[10.5px] font-mono text-[#9CA3AF]">
                        {v.recipientPhone}
                      </span>
                    )}
                  </div>

                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] ${pill}`}
                  >
                    {label}
                  </span>

                  <div className="flex flex-col items-end gap-0.5 text-[10px] text-[#6B7280] font-mono whitespace-nowrap">
                    <span>emit {fmt(v.issuedAt)}</span>
                    <span>até {fmt(v.validUntil)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

function FilterField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string
  name: string
  defaultValue: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
