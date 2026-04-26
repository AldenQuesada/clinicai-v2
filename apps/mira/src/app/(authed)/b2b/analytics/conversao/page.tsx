/**
 * /b2b/analytics/conversao · #2 · Conversao por parceiro no funil voucher.
 *
 * Layout 2-col:
 *   ESQ · Tabela ranking de TODAS parcerias com voucher no mes
 *         (ordenado is_image_partner DESC, vouchers DESC)
 *   DIR · Detalhes da parceria selecionada (KPIs + funnel + comparison
 *         vs mes anterior + delta)
 *
 * Mes selecionavel via querystring ?ym=YYYY-MM (default: mes anterior).
 * Consome RPCs b2b_partner_conversion_monthly_all + monthly (mig 800-16).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { ConversionMonthlyView } from './ConversionMonthlyView'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ ym?: string; partner?: string }>
}

function parseYearMonth(raw?: string): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function ConversaoPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const yearMonth = parseYearMonth(sp.ym)
  const selectedPartner = sp.partner || null

  const { repos } = await loadMiraServerContext()
  const rows = await repos.b2bPerformance
    .monthlyConversionAll(yearMonth)
    .catch(() => [])

  // Auto-select primeira parceria se nada selecionado e existe alguma
  const effectivePartner =
    selectedPartner && rows.some((r) => r.partnership_id === selectedPartner)
      ? selectedPartner
      : rows[0]?.partnership_id || null

  const detail = effectivePartner
    ? await repos.b2bPerformance
        .monthlyConversion(yearMonth, effectivePartner)
        .catch(() => null)
    : null

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap">
        <ConversionMonthlyView
          yearMonth={yearMonth}
          rows={rows}
          selectedPartner={effectivePartner}
          detail={detail}
        />
      </div>
    </main>
  )
}
