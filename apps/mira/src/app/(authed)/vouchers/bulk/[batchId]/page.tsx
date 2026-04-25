/**
 * /vouchers/bulk/[batchId] · status do lote enfileirado.
 *
 * Server Component denso · auto-refresh 10s via meta http-equiv.
 *
 * Mostra:
 *   - KPI cards (pending/processing/done/failed/cancelled)
 *   - Lista row dense (mirror /vouchers/page.tsx)
 *   - Botao "Cancelar batch" se ainda tem pending
 *
 * Multi-tenant ADR-028 · sanity check em listByBatch (1a row tem clinic_id).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, RefreshCw, Ban } from 'lucide-react'
import { formatPhoneBR } from '@clinicai/utils'
import type { VoucherDispatchQueueStatus } from '@clinicai/repositories'
import { loadMiraServerContext } from '@/lib/server-context'
import { cancelBatchAction } from '../actions'

export const dynamic = 'force-dynamic'
// Revalidate curto pra UI parecer "live" mesmo sem polling client-side
export const revalidate = 0

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-[#9CA3AF]/18 text-[#9CA3AF]',
  processing: 'bg-[#C9A96E]/18 text-[#C9A96E]',
  done: 'bg-[#10B981]/15 text-[#10B981]',
  failed: 'bg-[#DC2626]/15 text-[#FCA5A5]',
  cancelled: 'bg-[#6B7280]/15 text-[#6B7280]',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  processing: 'Processando',
  done: 'Emitido',
  failed: 'Falhou',
  cancelled: 'Cancelado',
}

function fmtDateTime(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

interface PageProps {
  params: Promise<{ batchId: string }>
}

export default async function BatchDetailPage({ params }: PageProps) {
  const { batchId } = await params
  const { ctx, repos } = await loadMiraServerContext()

  const items = await repos.voucherQueue.listByBatch(batchId)
  if (items.length === 0) notFound()

  // Sanity multi-tenant
  if (items[0].clinicId !== ctx.clinic_id) notFound()

  // Resolve partnership name
  const partnershipId = items[0].partnershipId
  const partnership = await repos.b2bPartnerships.getById(partnershipId)

  // KPIs
  const counts: Record<VoucherDispatchQueueStatus, number> = {
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    cancelled: 0,
  }
  for (const it of items) counts[it.status]++

  const total = items.length
  const scheduledAt = items.reduce(
    (min, it) => (it.scheduledAt < min ? it.scheduledAt : min),
    items[0].scheduledAt,
  )
  const submittedBy = items[0].submittedBy ?? '—'
  const submittedAt = items.reduce(
    (max, it) => (it.createdAt > max ? it.createdAt : max),
    items[0].createdAt,
  )

  const canCancel = counts.pending > 0
  const isLiveBatch = counts.pending > 0 || counts.processing > 0

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      {/* Auto-refresh 10s enquanto tem item ativo · pausa quando estatico */}
      {isLiveBatch && (
        <meta httpEquiv="refresh" content="10" />
      )}
      <div className="max-w-[860px] mx-auto px-6 py-6 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/8">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/vouchers/bulk"
              className="p-1 rounded text-[#9CA3AF] hover:text-[#F5F5F5] hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-[#F5F5F5] flex items-center gap-2">
                <span className="font-mono text-[#C9A96E]">
                  #{batchId.slice(0, 8)}
                </span>
                <span className="text-[#6B7280] text-sm">·</span>
                <span className="text-sm text-[#F5F5F5] truncate">
                  {partnership?.name ?? 'Parceria desconhecida'}
                </span>
              </h1>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                {total} voucher{total === 1 ? '' : 's'} · agendado{' '}
                {fmtDateTime(scheduledAt)} · enviado {fmtDateTime(submittedAt)}
                {submittedBy !== '—' && (
                  <span className="text-[#6B7280]"> · por {submittedBy}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isLiveBatch && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[1px] font-bold text-[#C9A96E]">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Atualiza 10s
              </span>
            )}
            {canCancel && (
              <form action={cancelBatchAction}>
                <input type="hidden" name="batch_id" value={batchId} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-[1px] border border-[#DC2626]/30 text-[#FCA5A5] hover:bg-[#DC2626]/10 transition-colors"
                >
                  <Ban className="w-3 h-3" />
                  Cancelar batch
                </button>
              </form>
            )}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-5 gap-2">
          <KpiCard label="Pendente" value={counts.pending} status="pending" />
          <KpiCard label="Processando" value={counts.processing} status="processing" />
          <KpiCard label="Emitido" value={counts.done} status="done" />
          <KpiCard label="Falhou" value={counts.failed} status="failed" />
          <KpiCard label="Cancelado" value={counts.cancelled} status="cancelled" />
        </div>

        {/* Lista row dense */}
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]">
              Items do lote
            </h2>
            <span className="text-[10px] text-[#6B7280]">{total} total</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {items.map((it) => {
              const pill = STATUS_PILL[it.status] ?? STATUS_PILL.pending
              const label = STATUS_LABEL[it.status] ?? it.status
              return (
                <div
                  key={it.id}
                  className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-3.5 py-2.5 bg-white/[0.02] border border-white/8 rounded-lg hover:border-white/14 transition-colors"
                >
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] ${pill}`}
                  >
                    {label}
                  </span>

                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-xs text-[#F5F5F5] truncate">
                      {it.recipientName || '—'}
                    </span>
                    <span className="text-[10.5px] font-mono text-[#9CA3AF]">
                      {formatPhoneBR(it.recipientPhone)}
                    </span>
                  </div>

                  {/* Voucher link OR error message · alinhamento direito */}
                  <div className="flex flex-col items-end gap-0.5 text-[10px] text-[#9CA3AF] font-mono whitespace-nowrap min-w-0">
                    {it.voucherId && (
                      <Link
                        href={`/vouchers?status=&partnership=${it.partnershipId}`}
                        className="text-[#C9A96E] hover:underline"
                      >
                        voucher #{it.voucherId.slice(0, 8)}
                      </Link>
                    )}
                    {it.errorMessage && (
                      <span className="text-[#FCA5A5] truncate max-w-[260px]">
                        {it.errorMessage}
                      </span>
                    )}
                    {it.attempts > 0 && (
                      <span className="text-[#6B7280]">
                        {it.attempts} tentativa{it.attempts === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-0.5 text-[10px] text-[#6B7280] font-mono whitespace-nowrap">
                    {it.lastAttemptAt && (
                      <span>tentou {fmtDateTime(it.lastAttemptAt)}</span>
                    )}
                    {it.combo && (
                      <span className="text-[#9CA3AF]">{it.combo}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </main>
  )
}

function KpiCard({
  label,
  value,
  status,
}: {
  label: string
  value: number
  status: 'pending' | 'processing' | 'done' | 'failed' | 'cancelled'
}) {
  const accent: Record<string, string> = {
    pending: 'text-[#9CA3AF]',
    processing: 'text-[#C9A96E]',
    done: 'text-[#10B981]',
    failed: 'text-[#FCA5A5]',
    cancelled: 'text-[#6B7280]',
  }
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2.5 flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]">
        {label}
      </span>
      <span className={`text-xl font-bold ${accent[status]}`}>{value}</span>
    </div>
  )
}
