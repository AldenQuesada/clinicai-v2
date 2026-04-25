/**
 * Tab Logs · paginated wa_pro_audit_log.
 * Filtros: phone, intent, success/fail.
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
    <div className="space-y-4">
      <form className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]">
        <input type="hidden" name="tab" value="logs" />
        <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Phone</label>
        <input
          name="phone"
          defaultValue={phone}
          placeholder="ex: 5511..."
          className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-sm font-mono"
        />
        <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] ml-2">Intent</label>
        <input
          name="intent"
          defaultValue={intent}
          placeholder="ex: b2b_admin_query"
          className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-sm font-mono"
        />
        <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] ml-2">Status</label>
        <select
          name="success"
          defaultValue={successFilter}
          className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-sm"
        >
          <option value="">Todos</option>
          <option value="true">Sucesso</option>
          <option value="false">Falha</option>
        </select>
        <button
          type="submit"
          className="px-3 py-1.5 rounded-pill text-[10px] uppercase tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all"
        >
          Filtrar
        </button>
      </form>

      {logs.length === 0 ? (
        <div className="text-center py-12 text-sm text-[hsl(var(--muted-foreground))]">
          Sem registros pra esta página/filtro.
        </div>
      ) : (
        <div className="rounded-card border border-[hsl(var(--chat-border))] overflow-hidden bg-[hsl(var(--chat-panel-bg))]">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--muted))]/30 border-b border-[hsl(var(--chat-border))]">
              <tr className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Phone</th>
                <th className="text-left px-3 py-2">Intent</th>
                <th className="text-left px-3 py-2">Query</th>
                <th className="text-left px-3 py-2">RPC</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">ms</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-[hsl(var(--chat-border))] last:border-0 align-top">
                  <td className="px-3 py-2 text-[10px] text-[hsl(var(--muted-foreground))] whitespace-nowrap">
                    {fmtDateTime(l.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{l.phone}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.intent ?? '—'}</td>
                  <td className="px-3 py-2 text-xs max-w-md truncate" title={l.query}>
                    {l.query}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{l.rpcCalled ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-pill ${
                      l.success
                        ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]'
                        : 'bg-[hsl(var(--danger))]/15 text-[hsl(var(--danger))]'
                    }`}>
                      {l.success ? 'OK' : 'FAIL'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{l.responseMs ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-xs">
        <span className="text-[hsl(var(--muted-foreground))]">
          Página {page} · {logs.length} registros
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={pageUrl({ phone, intent, successFilter, page: page - 1 })}
              className="px-3 py-1.5 rounded-pill text-[10px] uppercase tracking-widest border border-[hsl(var(--chat-border))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
            >
              ← Anterior
            </Link>
          )}
          {logs.length === PAGE_SIZE && (
            <Link
              href={pageUrl({ phone, intent, successFilter, page: page + 1 })}
              className="px-3 py-1.5 rounded-pill text-[10px] uppercase tracking-widest border border-[hsl(var(--chat-border))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]"
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
