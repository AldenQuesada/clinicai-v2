/**
 * Tab Logs · 2 blocos lado a lado (pedido Alden 2026-04-26).
 *
 * Esquerda · Mira (WhatsApp) · wa_pro_audit_log paginado
 * Direita  · Parcerias B2B   · b2b_audit_log (mig 800-19+)
 *
 * Auditoria B2B veio de /b2b/config/auditoria (URL antiga redireciona).
 *
 * Filtros independentes por bloco · pagination so na Mira (auditoria B2B
 * mostra so 30 entradas mais recentes igual original).
 */

import Link from 'next/link'
import { loadMiraServerContext } from '@/lib/server-context'
import type { AuditEntry } from '@clinicai/repositories'

const PAGE_SIZE = 50
const AUDIT_LIMIT = 30

const AUDIT_ACTIONS_VALID = [
  'created',
  'status_change',
  'health_change',
  'voucher_issued',
  'closure_suggested',
  'attribution_created',
] as const

const AUDIT_LABELS: Record<string, string> = {
  created: '🆕 Criada',
  status_change: '🔄 Status',
  health_change: '❤️ Saúde',
  voucher_issued: '🎁 Voucher',
  closure_suggested: '⚠️ Encerramento',
  attribution_created: '🎯 Atribuição',
  'comm.sent': '💬 Mensagem',
}

const AUDIT_OPTIONS = [
  { value: '', label: 'Todas ações' },
  { value: 'created', label: AUDIT_LABELS.created },
  { value: 'status_change', label: AUDIT_LABELS.status_change },
  { value: 'health_change', label: AUDIT_LABELS.health_change },
  { value: 'voucher_issued', label: AUDIT_LABELS.voucher_issued },
  { value: 'closure_suggested', label: AUDIT_LABELS.closure_suggested },
  { value: 'attribution_created', label: AUDIT_LABELS.attribution_created },
]

interface LogsTabProps {
  phone: string
  intent: string
  successFilter: string
  page: number
  auditAction: string
}

export async function LogsTab({
  phone,
  intent,
  successFilter,
  page,
  auditAction,
}: LogsTabProps) {
  const { ctx, repos } = await loadMiraServerContext()

  const successBool =
    successFilter === 'true' ? true : successFilter === 'false' ? false : undefined

  const offset = (page - 1) * PAGE_SIZE
  const validAuditAction = (AUDIT_ACTIONS_VALID as readonly string[]).includes(
    auditAction,
  )
    ? auditAction
    : null

  const [logs, audit] = await Promise.all([
    repos.waProAudit.list(ctx.clinic_id, {
      phone: phone || undefined,
      intent: intent || undefined,
      success: successBool,
      limit: PAGE_SIZE,
      offset,
    }),
    repos.b2bSystemHealth
      .auditRecent({ limit: AUDIT_LIMIT, action: validAuditAction })
      .catch(() => [] as AuditEntry[]),
  ])

  return (
    <div
      className="cfg-logs-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
        gap: 12,
        alignItems: 'start',
      }}
    >
      <MiraLogsBlock
        logs={logs}
        phone={phone}
        intent={intent}
        successFilter={successFilter}
        page={page}
        auditAction={auditAction}
      />
      <AuditB2BBlock entries={audit} action={validAuditAction} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Bloco 1 · Mira (WhatsApp) · wa_pro_audit_log
// ═══════════════════════════════════════════════════════════════════════

interface MiraBlockProps {
  logs: Awaited<ReturnType<typeof getMiraLogsType>>
  phone: string
  intent: string
  successFilter: string
  page: number
  auditAction: string
}

// Type helper · evita inferir tipo do repos.waProAudit.list direto
async function getMiraLogsType() {
  return [] as Array<{
    id: string
    createdAt: string
    phone: string
    intent: string | null
    query: string
    rpcCalled: string | null
    success: boolean
    responseMs: number | null
  }>
}

function MiraLogsBlock({
  logs,
  phone,
  intent,
  successFilter,
  page,
  auditAction,
}: MiraBlockProps) {
  return (
    <section className="bg-white/[0.02] border border-white/10 rounded-lg p-3.5 flex flex-col gap-2.5 min-w-0">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
            🤖 Mira · WhatsApp
          </h3>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            wa_pro_audit_log · queries do robo
          </p>
        </div>
        <span className="text-[10px] text-[#6B7280] font-mono">
          pag {page}
        </span>
      </header>

      {/* Filtros compactos · 1 linha */}
      <form className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <input type="hidden" name="tab" value="logs" />
        <input type="hidden" name="audit_action" value={auditAction} />
        <input
          name="phone"
          defaultValue={phone}
          placeholder="phone"
          className="px-2 py-1 rounded bg-white/[0.02] border border-white/10 text-[11px] text-[#F5F0E8] font-mono focus:outline-none focus:border-[#C9A96E]/50 w-28"
        />
        <input
          name="intent"
          defaultValue={intent}
          placeholder="intent"
          className="px-2 py-1 rounded bg-white/[0.02] border border-white/10 text-[11px] text-[#F5F0E8] font-mono focus:outline-none focus:border-[#C9A96E]/50 w-32"
        />
        <select
          name="success"
          defaultValue={successFilter}
          className="px-2 py-1 rounded bg-white/[0.02] border border-white/10 text-[11px] text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
        >
          <option value="">Todos</option>
          <option value="true">OK</option>
          <option value="false">Fail</option>
        </select>
        <button
          type="submit"
          className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-[0.8px] bg-[#C9A96E]/20 text-[#C9A96E] hover:bg-[#C9A96E]/30 border border-[#C9A96E]/30"
        >
          ↻
        </button>
      </form>

      {/* Lista densa · vertical scroll */}
      {logs.length === 0 ? (
        <div className="text-[11px] text-[#9CA3AF] py-4 text-center italic">
          Sem registros pra esta pagina/filtro.
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 max-h-[520px] overflow-y-auto custom-scrollbar">
          {logs.map((l) => (
            <div
              key={l.id}
              className="flex flex-col gap-0.5 px-2 py-1.5 rounded border border-transparent hover:bg-white/[0.02] hover:border-white/10 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="font-mono text-[#9CA3AF]">
                  {fmtDateTime(l.createdAt)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-[1px] ${
                    l.success
                      ? 'bg-[#10B981]/15 text-[#10B981]'
                      : 'bg-[#EF4444]/15 text-[#FCA5A5]'
                  }`}
                >
                  {l.success ? 'ok' : 'fail'}
                </span>
                <span className="font-mono text-[9.5px] text-[#6B7280]">
                  {l.responseMs ?? '—'}ms
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10.5px]">
                <span className="font-mono text-[#F5F0E8] truncate" title={l.phone}>
                  {l.phone}
                </span>
                <span className="font-mono text-[#C9A96E] truncate" title={l.intent ?? ''}>
                  {l.intent ?? '—'}
                </span>
              </div>
              <div className="text-[10.5px] text-[#9CA3AF] truncate" title={l.query}>
                {l.query}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginacao · so na Mira */}
      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-white/5">
        <span className="text-[#6B7280] font-mono">
          {logs.length} registros
        </span>
        <div className="flex gap-1">
          {page > 1 && (
            <Link
              href={miraPageUrl({ phone, intent, successFilter, page: page - 1, auditAction })}
              className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1px] border border-white/10 text-[#9CA3AF] hover:border-[#C9A96E]/40 hover:text-[#C9A96E]"
            >
              ←
            </Link>
          )}
          {logs.length === PAGE_SIZE && (
            <Link
              href={miraPageUrl({ phone, intent, successFilter, page: page + 1, auditAction })}
              className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1px] border border-white/10 text-[#9CA3AF] hover:border-[#C9A96E]/40 hover:text-[#C9A96E]"
            >
              →
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Bloco 2 · Auditoria B2B · b2b_audit_log
// ═══════════════════════════════════════════════════════════════════════

function AuditB2BBlock({
  entries,
  action,
}: {
  entries: AuditEntry[]
  action: string | null
}) {
  return (
    <section className="bg-white/[0.02] border border-white/10 rounded-lg p-3.5 flex flex-col gap-2.5 min-w-0">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
            🤝 Parcerias · B2B
          </h3>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            b2b_audit_log · ate 30 mais recentes
          </p>
        </div>
      </header>

      {/* Filtro compacto · select de action */}
      <form className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <input type="hidden" name="tab" value="logs" />
        <select
          name="audit_action"
          defaultValue={action || ''}
          className="px-2 py-1 rounded bg-white/[0.02] border border-white/10 text-[11px] text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50 flex-1 min-w-0"
        >
          {AUDIT_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-[0.8px] bg-[#C9A96E]/20 text-[#C9A96E] hover:bg-[#C9A96E]/30 border border-[#C9A96E]/30"
        >
          ↻
        </button>
      </form>

      {/* Lista densa */}
      {entries.length === 0 ? (
        <div className="text-[11px] text-[#9CA3AF] py-4 text-center italic">
          Nenhuma entrada.
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 max-h-[520px] overflow-y-auto custom-scrollbar">
          {entries.map((r) => (
            <AuditRow key={r.id} r={r} />
          ))}
        </div>
      )}
    </section>
  )
}

function AuditRow({ r }: { r: AuditEntry }) {
  const lbl = AUDIT_LABELS[r.action] || r.action
  const detail = r.from_value
    ? `${r.from_value} → ${r.to_value || ''}`
    : r.notes
      ? r.notes.slice(0, 60)
      : ''
  const hasPart = !!r.partnership_id
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="font-mono text-[#9CA3AF]">
          {fmtDateTime(r.created_at)}
        </span>
        <span className="text-[10px] text-[#C9A96E] truncate">
          {lbl}
        </span>
      </div>
      <div className="text-[10.5px] text-[#F5F0E8] truncate">
        {r.partnership_name || '—'}
      </div>
      {detail && (
        <div className="text-[10px] text-[#9CA3AF] truncate" title={detail}>
          {detail}
        </div>
      )}
    </>
  )
  if (hasPart) {
    return (
      <Link
        href={`/partnerships/${r.partnership_id}`}
        className="flex flex-col gap-0.5 px-2 py-1.5 rounded border border-transparent hover:bg-white/[0.02] hover:border-white/10 transition-colors"
      >
        {inner}
      </Link>
    )
  }
  return (
    <div className="flex flex-col gap-0.5 px-2 py-1.5 rounded border border-transparent">
      {inner}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function miraPageUrl(opts: {
  phone: string
  intent: string
  successFilter: string
  page: number
  auditAction: string
}): string {
  const params = new URLSearchParams()
  params.set('tab', 'logs')
  if (opts.phone) params.set('phone', opts.phone)
  if (opts.intent) params.set('intent', opts.intent)
  if (opts.successFilter) params.set('success', opts.successFilter)
  if (opts.auditAction) params.set('audit_action', opts.auditAction)
  params.set('page', String(opts.page))
  return `/configuracoes?${params.toString()}`
}

function fmtDateTime(iso: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const today = new Date().toDateString() === d.toDateString()
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    if (today) return `hoje ${hh}:${mm}`
    return (
      d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit' }) +
      ` ${hh}:${mm}`
    )
  } catch {
    return iso
  }
}
