/**
 * /vouchers/saude · health do dispatch B2B.
 *
 * Server Component · KPIs no recorte de período (default 30d):
 *   - Vouchers emitidos
 *   - Áudio entregue (audio_sent_at NOT NULL · taxa de sucesso)
 *   - Engajamento (delivered/opened/redeemed)
 *   - Cold 72h (issued >72h, sem audio_sent OU sem engagement)
 *   - Erros não-resolvidos (agrupados por reason)
 *
 * Visual mirror /vouchers admin · cards densos + tabelas gold-tinted.
 */

import Link from 'next/link'
import { loadMiraServerContext } from '@/lib/server-context'
import { ResolveByReasonButton, ResolveOneButton } from './ResolveButtons'

export const dynamic = 'force-dynamic'

const PERIOD_OPTIONS = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: '0', label: 'Tudo' },
]

const REASON_LABEL: Record<string, string> = {
  missing_voucher_audio_secret: 'Secret voucher_audio_secret ausente',
  missing_supabase_service_role_key: 'Secret supabase_service_role_key ausente',
  pg_net_failed: 'pg_net falhou (extension/network/timeout)',
  edge_function_error: 'Edge function retornou erro',
  whatsapp_send_failed: 'WhatsApp Cloud API recusou envio',
}

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

interface VoucherRow {
  id: string
  status: string
  audio_sent_at: string | null
  issued_at: string
  is_demo: boolean
}

interface ErrorRow {
  id: string
  voucher_id: string
  reason: string
  detail: string | null
  created_at: string
}

interface ErrorWithVoucher extends ErrorRow {
  voucher_token: string | null
  recipient_name: string | null
}

export default async function VouchersSaudePage({ searchParams }: PageProps) {
  const params = await searchParams
  const { supabase, ctx } = await loadMiraServerContext()

  const days = parseInt(params.period ?? '30', 10)
  const sinceIso =
    days > 0
      ? new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      : new Date('2000-01-01').toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any

  // 1. Todos vouchers no período (não-demo)
  const { data: vouchersData } = await sb
    .from('b2b_vouchers')
    .select('id, status, audio_sent_at, issued_at, is_demo')
    .eq('clinic_id', ctx.clinic_id)
    .eq('is_demo', false)
    .gte('issued_at', sinceIso)
    .order('issued_at', { ascending: false })
    .limit(2000)
  const vouchers: VoucherRow[] = vouchersData || []

  // 2. Erros não-resolvidos (sem filtro de período · todos pendentes)
  const { data: errorsData } = await sb
    .from('b2b_voucher_dispatch_errors')
    .select('id, voucher_id, reason, detail, created_at')
    .eq('clinic_id', ctx.clinic_id)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  const errors: ErrorRow[] = errorsData || []

  // 3. Recent errors com info do voucher (join client-side via in())
  const recentErrorIds = errors.slice(0, 20).map((e) => e.voucher_id)
  let voucherInfoById = new Map<
    string,
    { token: string | null; recipient_name: string | null }
  >()
  if (recentErrorIds.length > 0) {
    const { data: vinfo } = await sb
      .from('b2b_vouchers')
      .select('id, token, recipient_name')
      .in('id', recentErrorIds)
    if (vinfo) {
      voucherInfoById = new Map(
        (vinfo as Array<{ id: string; token: string; recipient_name: string }>).map(
          (v) => [v.id, { token: v.token, recipient_name: v.recipient_name }],
        ),
      )
    }
  }
  const recentErrors: ErrorWithVoucher[] = errors.slice(0, 20).map((e) => ({
    ...e,
    voucher_token: voucherInfoById.get(e.voucher_id)?.token ?? null,
    recipient_name: voucherInfoById.get(e.voucher_id)?.recipient_name ?? null,
  }))

  // 4. Computa KPIs
  const total = vouchers.length
  const audioSent = vouchers.filter((v) => !!v.audio_sent_at).length
  const audioRate = total > 0 ? (audioSent / total) * 100 : 0
  const engaged = vouchers.filter((v) =>
    ['delivered', 'opened', 'redeemed'].includes(v.status),
  ).length
  const engagedRate = total > 0 ? (engaged / total) * 100 : 0

  const seventyTwoHrAgo = Date.now() - 72 * 60 * 60 * 1000
  const cold72h = vouchers.filter((v) => {
    const issued = v.issued_at ? new Date(v.issued_at).getTime() : Date.now()
    if (issued > seventyTwoHrAgo) return false
    return !v.audio_sent_at || v.status === 'issued'
  }).length

  // 5. Agrupa erros por reason
  const errorsByReason = new Map<string, number>()
  for (const e of errors) {
    errorsByReason.set(e.reason, (errorsByReason.get(e.reason) || 0) + 1)
  }
  const errorReasons = Array.from(errorsByReason.entries()).sort(
    (a, b) => b[1] - a[1],
  )

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[960px] mx-auto px-6 py-6 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div>
            <span className="eyebrow text-[#C9A96E]">
              Operação · Saúde do dispatch
            </span>
            <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
              Saúde dos Vouchers
            </h1>
            <p className="text-[11px] text-[#9CA3AF] mt-1">
              Visibilidade de falhas no envio de áudio · {total} voucher{total === 1 ? '' : 's'} no recorte
            </p>
          </div>
          <Link
            href="/vouchers"
            className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF] hover:text-[#F5F0E8] transition-colors"
          >
            ← Voltar para vouchers
          </Link>
        </div>

        {/* Period filter */}
        <form className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] px-3.5 py-3 flex items-center gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
            Período
          </span>
          <select
            name="period"
            defaultValue={params.period || '30'}
            className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors ml-auto"
          >
            Aplicar
          </button>
        </form>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <KpiCard
            label="Emitidos"
            value={total.toString()}
            sub={`${days > 0 ? `${days}d` : 'todo período'}`}
            tone="neutral"
          />
          <KpiCard
            label="Áudio entregue"
            value={`${audioRate.toFixed(1)}%`}
            sub={`${audioSent}/${total}`}
            tone={
              audioRate >= 95 ? 'good' : audioRate >= 80 ? 'warn' : 'bad'
            }
          />
          <KpiCard
            label="Engajados"
            value={`${engagedRate.toFixed(1)}%`}
            sub={`${engaged}/${total}`}
            tone={
              engagedRate >= 30 ? 'good' : engagedRate >= 15 ? 'warn' : 'neutral'
            }
          />
          <KpiCard
            label="Cold 72h+"
            value={cold72h.toString()}
            sub="sem áudio ou ainda 'issued'"
            tone={cold72h === 0 ? 'good' : cold72h < 5 ? 'warn' : 'bad'}
          />
        </div>

        {/* Erros agrupados */}
        <section className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3.5 flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#F5F0E8]">
              Erros pendentes por motivo
            </h2>
            <span className="text-[10px] text-[#9CA3AF]">
              {errors.length} no total
            </span>
          </div>
          {errorReasons.length === 0 ? (
            <div className="text-xs text-[#10B981] py-2">
              ✓ Nenhum erro pendente. Dispatch saudável.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {errorReasons.map(([reason, count]) => (
                <div
                  key={reason}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2 bg-white/[0.02] border border-white/10 rounded-lg"
                >
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-xs text-[#F5F0E8] truncate">
                      {REASON_LABEL[reason] || reason}
                    </span>
                    <span className="text-[10px] font-mono text-[#6B7280]">
                      {reason}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold tabular-nums bg-[#EF4444]/15 text-[#FCA5A5]">
                    {count}
                  </span>
                  <ResolveByReasonButton reason={reason} count={count} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Erros recentes (lista) */}
        {recentErrors.length > 0 && (
          <section className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3.5 flex flex-col gap-2.5">
            <h2 className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#F5F0E8]">
              Erros recentes (últimos {recentErrors.length})
            </h2>
            <div className="flex flex-col gap-1">
              {recentErrors.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center px-3 py-2 bg-white/[0.02] border border-white/10 rounded-lg"
                >
                  <span className="font-mono text-[10px] text-[#C9A96E]">
                    {e.voucher_token ?? '—'}
                  </span>
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <span className="text-xs text-[#F5F0E8] truncate">
                      {e.recipient_name || '—'}
                      <span className="ml-2 text-[10px] text-[#FCA5A5]">
                        {e.reason}
                      </span>
                    </span>
                    {e.detail && (
                      <span className="text-[10px] text-[#9CA3AF] truncate">
                        {e.detail}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[#6B7280] font-mono whitespace-nowrap">
                    {fmtDate(e.created_at)}
                  </span>
                  <ResolveOneButton errorId={e.id} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Hint operacional */}
        <div className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] px-3.5 py-3 text-[11px] text-[#9CA3AF] leading-relaxed">
          <strong className="text-[#C9A96E]">Como interpretar:</strong>{' '}
          Áudio entregue ≥95% é a meta operacional. Abaixo de 80%, cheque{' '}
          <code className="text-[#F5F0E8]">clinic_secrets.voucher_audio_secret</code> e{' '}
          <code className="text-[#F5F0E8]">supabase_service_role_key</code>.
          Cold 72h+ marca vouchers que ficaram sem áudio ou sem ser entregues —
          retry pela página /vouchers ou peça novo lote.
        </div>
      </div>
    </main>
  )
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone: 'good' | 'warn' | 'bad' | 'neutral'
}) {
  const colorByTone: Record<string, string> = {
    good: '#10B981',
    warn: '#F59E0B',
    bad: '#EF4444',
    neutral: '#C9A96E',
  }
  const c = colorByTone[tone]
  return (
    <div
      className="rounded-lg border bg-white/[0.02] px-3.5 py-3 flex flex-col gap-0.5"
      style={{ borderColor: `${c}33` }}
    >
      <span className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#9CA3AF]">
        {label}
      </span>
      <span
        className="font-display text-2xl tabular-nums"
        style={{ color: c }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[10px] text-[#6B7280] font-mono">{sub}</span>
      )}
    </div>
  )
}

function fmtDate(iso: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
