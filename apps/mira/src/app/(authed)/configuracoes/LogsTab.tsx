/**
 * Tab Logs · paginated wa_pro_audit_log.
 *
 * Visual mirror b2b-config.css `.bcfg-audit-row` linha 258-294 ·
 * grid 100px/140px/1fr/2fr (denso, mono, 11.5px).
 */

import Link from 'next/link'
import { loadMiraServerContext } from '@/lib/server-context'

const PAGE_SIZE = 50

export async function LogsTab({
  phone,
  intent,
  successFilter,
  page,
}: {
  phone: string
  intent: string
  successFilter: string
  page: number
}) {
  const { ctx, repos } = await loadMiraServerContext()

  const successBool =
    successFilter === 'true' ? true : successFilter === 'false' ? false : undefined

  const offset = (page - 1) * PAGE_SIZE
  const logs = await repos.waProAudit.list(ctx.clinic_id, {
    phone: phone || undefined,
    intent: intent || undefined,
    success: successBool,
    limit: PAGE_SIZE,
    offset,
  })

  return (
    <div className="flex flex-col gap-3">
      {/* Filtros · gold tinted */}
      <form className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] px-3.5 py-3 flex items-center gap-2.5 flex-wrap">
        <input type="hidden" name="tab" value="logs" />

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
            Phone
          </label>
          <input
            name="phone"
            defaultValue={phone}
            placeholder="ex: 5511..."
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/8 text-xs text-[#F5F5F5] font-mono focus:outline-none focus:border-[#C9A96E]/50 w-36"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
            Intent
          </label>
          <input
            name="intent"
            defaultValue={intent}
            placeholder="ex: b2b_admin_query"
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/8 text-xs text-[#F5F5F5] font-mono focus:outline-none focus:border-[#C9A96E]/50 w-44"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
            Status
          </label>
          <select
            name="success"
            defaultValue={successFilter}
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/8 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#C9A96E]/50"
          >
            <option value="">Todos</option>
            <option value="true">Sucesso</option>
            <option value="false">Falha</option>
          </select>
        </div>

        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors ml-auto"
        >
          Filtrar
        </button>
      </form>

      {/* Lista · audit row pattern */}
      {logs.length === 0 ? (
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
          Sem registros pra esta página/filtro.
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 max-h-[600px] overflow-y-auto custom-scrollbar">
          {logs.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-[110px_140px_140px_1fr_auto_auto] gap-2.5 items-center px-3 py-2 rounded border border-transparent hover:bg-white/[0.02] hover:border-white/8 transition-colors text-[11px]"
            >
              <span className="text-[10px] font-mono text-[#9CA3AF] whitespace-nowrap">
                {fmtDateTime(l.createdAt)}
              </span>
              <span className="font-mono text-[11px] text-[#F5F5F5] truncate" title={l.phone}>
                {l.phone}
              </span>
              <span className="font-mono text-[11px] text-[#C9A96E] truncate" title={l.intent ?? ''}>
                {l.intent ?? '—'}
              </span>
              <span className="text-[11px] text-[#F5F5F5] truncate" title={l.query}>
                {l.query}
                {l.rpcCalled && (
                  <span className="ml-2 font-mono text-[10px] text-[#6B7280]">
                    rpc: {l.rpcCalled}
                  </span>
                )}
              </span>
              <span
                className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] ${
                  l.success
                    ? 'bg-[#10B981]/15 text-[#10B981]'
                    : 'bg-[#EF4444]/15 text-[#FCA5A5]'
                }`}
              >
                {l.success ? 'OK' : 'FAIL'}
              </span>
              <span className="text-[10px] font-mono text-[#9CA3AF] whitespace-nowrap">
                {l.responseMs ?? '—'}ms
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Paginacao */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-[#6B7280] font-mono">
          Página {page} · {logs.length} registros
        </span>
        <div className="flex gap-1.5">
          {page > 1 && (
            <Link
              href={pageUrl({ phone, intent, successFilter, page: page - 1 })}
              className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-[1px] border border-white/8 text-[#9CA3AF] hover:border-[#C9A96E]/40 hover:text-[#C9A96E] transition-colors"
            >
              ← Anterior
            </Link>
          )}
          {logs.length === PAGE_SIZE && (
            <Link
              href={pageUrl({ phone, intent, successFilter, page: page + 1 })}
              className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-[1px] border border-white/8 text-[#9CA3AF] hover:border-[#C9A96E]/40 hover:text-[#C9A96E] transition-colors"
            >
              Próxima →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

function pageUrl(opts: {
  phone: string
  intent: string
  successFilter: string
  page: number
}): string {
  const params = new URLSearchParams()
  params.set('tab', 'logs')
  if (opts.phone) params.set('phone', opts.phone)
  if (opts.intent) params.set('intent', opts.intent)
  if (opts.successFilter) params.set('success', opts.successFilter)
  params.set('page', String(opts.page))
  return `/configuracoes?${params.toString()}`
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
