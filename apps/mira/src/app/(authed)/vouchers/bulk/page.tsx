/**
 * /vouchers/bulk · admin emit lote de vouchers.
 *
 * Server Component denso (mirror mira-config antigo) · fluxo:
 *   1. Form: parceria + combo + lista textarea + scheduled_at → "Validar lote"
 *   2. Server Action validateBulkAction parseia + dedup paralelo · grava
 *      preview em cookie · revalida pagina.
 *   3. Page renderiza preview com cards eligible/blocked.
 *   4. "Confirmar e enfileirar" chama enqueueBulkAction · redirect /bulk/[batchId].
 *
 * Sem client components · forms via Server Actions.
 *
 * UI: gold #C9A96E, slate #9CA3AF, max-w-[860px], rounded-lg.
 */

import Link from 'next/link'
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { formatPhoneBR } from '@clinicai/utils'
import { loadMiraServerContext } from '@/lib/server-context'
import {
  validateBulkAction,
  enqueueBulkAction,
  clearBulkPreviewAction,
  readBulkPreview,
  type BulkPreviewItem,
} from './actions'

export const dynamic = 'force-dynamic'

// Default scheduled_at = agora (datetime-local sem TZ · YYYY-MM-DDTHH:mm)
function localNowInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

function fmtDateOnly(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  } catch {
    return iso
  }
}

const BATCH_STATUS_PILL: Record<string, string> = {
  pending: 'bg-[#9CA3AF]/18 text-[#9CA3AF]',
  processing: 'bg-[#C9A96E]/18 text-[#C9A96E]',
  done: 'bg-[#10B981]/15 text-[#10B981]',
  failed: 'bg-[#DC2626]/15 text-[#DC2626]',
  cancelled: 'bg-[#6B7280]/15 text-[#6B7280]',
}

function worstStatus(s: {
  pending: number
  processing: number
  failed: number
  done: number
  cancelled: number
}): string {
  if (s.failed > 0) return 'failed'
  if (s.processing > 0) return 'processing'
  if (s.pending > 0) return 'pending'
  if (s.cancelled > 0 && s.done === 0) return 'cancelled'
  if (s.done > 0) return 'done'
  return 'pending'
}

export default async function VoucherBulkPage() {
  const { ctx, repos } = await loadMiraServerContext()

  const [partnerships, recentBatches, preview] = await Promise.all([
    repos.b2bPartnerships.list(ctx.clinic_id, { status: 'active' }),
    repos.voucherQueue.listRecentBatches(ctx.clinic_id, 10),
    readBulkPreview(),
  ])

  const partnershipNameById = new Map(partnerships.map((p) => [p.id, p.name]))
  const defaultScheduled = preview?.scheduledAt
    ? toLocalInput(preview.scheduledAt)
    : localNowInput()

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[860px] mx-auto px-6 py-6 flex flex-col gap-3">
        {/* Header denso */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Link
              href="/vouchers"
              className="p-1 rounded text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <div>
              <span className="eyebrow text-[#C9A96E]">Hoje · Vouchers em curso</span>
              <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
                Emitir lote de vouchers
              </h1>
              <p className="text-[11px] text-[#9CA3AF] mt-1">
                Cole a lista (1 por linha) · sistema valida dedup e agenda dispatch
              </p>
            </div>
          </div>
        </div>

        {/* Form principal */}
        <form
          action={validateBulkAction}
          className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-3.5"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="bulk-partnership"
                className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]"
              >
                Parceria
              </label>
              <select
                id="bulk-partnership"
                name="partnership_id"
                defaultValue={preview?.partnershipId ?? ''}
                required
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
              >
                <option value="">Selecionar parceria ativa…</option>
                {partnerships.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {partnerships.length === 0 && (
                <span className="text-[10px] text-[#DC2626]">
                  Nenhuma parceria ativa · ativa uma em /partnerships
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="bulk-combo"
                className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]"
              >
                Combo (opcional)
              </label>
              <input
                id="bulk-combo"
                name="combo"
                type="text"
                placeholder="default = combo da parceria"
                defaultValue={preview?.combo ?? ''}
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] placeholder:text-[#6B7280] focus:outline-none focus:border-[#C9A96E]/50"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="bulk-list"
              className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]"
            >
              Lista (1 por linha · formatos aceitos)
            </label>
            <textarea
              id="bulk-list"
              name="list_text"
              rows={10}
              required
              placeholder={
                'Maria 5544991111111\nAna Paula (44) 99222-2222\nBia Mendes 44 99333-3333\n...'
              }
              defaultValue={preview?.listText ?? ''}
              className="px-3 py-2.5 rounded-lg bg-[#0a0a0a]/60 border border-white/10 text-xs font-mono text-[#F5F0E8] placeholder:text-[#6B7280] focus:outline-none focus:border-[#C9A96E]/50 resize-y"
            />
            <span className="text-[10px] text-[#6B7280]">
              Aceita: <span className="text-[#9CA3AF]">Nome 5544991111111</span>{' '}
              · <span className="text-[#9CA3AF]">Nome (44) 99111-1111</span> ·{' '}
              <span className="text-[#9CA3AF]">Nome 44 99111 1111</span> ·
              inline com vírgula
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="bulk-scheduled"
                className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]"
              >
                Agendar dispatch
              </label>
              <input
                id="bulk-scheduled"
                name="scheduled_at"
                type="datetime-local"
                defaultValue={defaultScheduled}
                className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
              />
            </div>
            <div className="flex justify-end gap-2">
              {preview && (
                <button
                  type="submit"
                  formAction={clearBulkPreviewAction}
                  className="px-3 py-2 rounded text-[10px] font-bold uppercase tracking-[1px] border border-white/10 text-[#9CA3AF] hover:text-[#F5F0E8] hover:border-white/14 transition-colors"
                >
                  Limpar
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-2 rounded font-semibold text-xs uppercase tracking-[1px] bg-[#C9A96E] text-[#0a0a0a] hover:opacity-90 transition-opacity"
              >
                Validar lote
              </button>
            </div>
          </div>
        </form>

        {/* Preview · renderizado se cookie estiver presente */}
        {preview && <PreviewBlock preview={preview} />}

        {/* Lista de batches recentes */}
        <div className="flex flex-col gap-1.5 mt-1">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-[10px] uppercase tracking-[1px] font-bold text-[#9CA3AF]">
              Últimos lotes
            </h2>
            <span className="text-[10px] text-[#6B7280]">
              {recentBatches.length} batch{recentBatches.length === 1 ? '' : 'es'}
            </span>
          </div>
          {recentBatches.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5 text-center text-xs text-[#9CA3AF]">
              Nenhum lote enviado ainda · valide e enfileire seu primeiro acima.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recentBatches.map((b) => {
                const status = worstStatus(b)
                const pill = BATCH_STATUS_PILL[status] ?? BATCH_STATUS_PILL.pending
                return (
                  <Link
                    key={b.batchId}
                    href={`/vouchers/bulk/${b.batchId}`}
                    className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-3.5 py-2.5 bg-white/[0.02] border border-white/10 rounded-lg hover:border-white/14 transition-colors"
                  >
                    <span className="font-mono text-[11px] text-[#C9A96E]">
                      #{b.batchId.slice(0, 8)}
                    </span>
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <span className="text-xs text-[#F5F0E8] truncate">
                        {partnershipNameById.get(b.partnershipId) ?? '—'}
                        <span className="ml-2 text-[10.5px] text-[#9CA3AF]">
                          {b.total} item{b.total === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono text-[#6B7280]">
                        agendado {fmtDateTime(b.scheduledAt)}
                      </span>
                    </div>
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] ${pill}`}
                    >
                      {status}
                    </span>
                    <div className="flex flex-col items-end gap-0.5 text-[10px] text-[#6B7280] font-mono whitespace-nowrap">
                      <span>{b.done}/{b.total} done</span>
                      {b.failed > 0 && (
                        <span className="text-[#FCA5A5]">{b.failed} fail</span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

function PreviewBlock({ preview }: { preview: Awaited<ReturnType<typeof readBulkPreview>> }) {
  if (!preview) return null

  if (preview.fatalError) {
    return (
      <div className="rounded-lg border border-[#DC2626]/30 bg-[#DC2626]/10 px-3.5 py-3 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-[#FCA5A5] mt-0.5 shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] uppercase tracking-[1px] font-bold text-[#FCA5A5]">
            Não consegui validar
          </span>
          <span className="text-xs text-[#F5F0E8]">{preview.fatalError}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] flex flex-col">
      {/* Resumo header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-[1px] font-bold text-[#C9A96E]">
            Preview
          </span>
          <span className="text-xs text-[#F5F0E8]">
            {preview.partnershipName}
          </span>
          <span className="text-[10px] text-[#6B7280]">
            agendado {fmtDateTime(preview.scheduledAt)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono">
          <span className="text-[#10B981]">{preview.eligibleCount} OK</span>
          {preview.blockedCount > 0 && (
            <span className="text-[#FCA5A5]">{preview.blockedCount} bloq</span>
          )}
        </div>
      </div>

      {/* Lista preview */}
      <div className="divide-y divide-white/6">
        {preview.items.map((it, idx) => (
          <PreviewRow key={`${it.phone}-${idx}`} item={it} />
        ))}
      </div>

      {/* CTA confirmar · disabled se eligibleCount=0 */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-white/10">
        <span className="text-[10px] text-[#6B7280]">
          {preview.declaredCount != null && (
            <>declarados {preview.declaredCount} · </>
          )}
          {preview.scheduleHint && <>hint &quot;{preview.scheduleHint}&quot; · </>}
          combo &quot;{preview.combo || '—'}&quot;
        </span>
        <form action={enqueueBulkAction}>
          <button
            type="submit"
            disabled={preview.eligibleCount === 0}
            className="px-4 py-2 rounded font-semibold text-xs uppercase tracking-[1px] bg-[#C9A96E] text-[#0a0a0a] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirmar e enfileirar {preview.eligibleCount}
          </button>
        </form>
      </div>
    </div>
  )
}

function PreviewRow({ item }: { item: BulkPreviewItem }) {
  if (item.status === 'eligible') {
    return (
      <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3.5 py-2 hover:bg-white/[0.01] transition-colors">
        <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="text-xs text-[#F5F0E8] truncate">{item.name}</span>
          <span className="text-[10.5px] font-mono text-[#9CA3AF]">
            {formatPhoneBR(item.phone)}
          </span>
        </div>
        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] bg-[#10B981]/15 text-[#10B981]">
          OK
        </span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3.5 py-2 bg-[#DC2626]/[0.04] hover:bg-[#DC2626]/[0.07] transition-colors">
      <XCircle className="w-3.5 h-3.5 text-[#FCA5A5]" />
      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="text-xs text-[#F5F0E8] truncate">
          {item.name}
          <span className="text-[10.5px] font-mono text-[#9CA3AF] ml-2">
            {formatPhoneBR(item.phone)}
          </span>
        </span>
        <span className="text-[10px] text-[#FCA5A5]">
          {item.blockReason ?? 'Bloqueada'}
          {item.dedupName && (
            <span className="text-[#9CA3AF] ml-1">
              · cadastrada como &quot;{item.dedupName}&quot;
            </span>
          )}
          {item.dedupSince && (
            <span className="text-[#6B7280] ml-1">
              · desde {fmtDateOnly(item.dedupSince)}
            </span>
          )}
          {item.dedupPartnership && (
            <span className="text-[#6B7280] ml-1">
              · via {item.dedupPartnership}
            </span>
          )}
        </span>
      </div>
      <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] bg-[#DC2626]/15 text-[#FCA5A5]">
        BLOQ
      </span>
    </div>
  )
}

// Converte ISO → datetime-local input value (YYYY-MM-DDTHH:mm)
function toLocalInput(iso: string): string {
  if (!iso) return localNowInput()
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return localNowInput()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return localNowInput()
  }
}
