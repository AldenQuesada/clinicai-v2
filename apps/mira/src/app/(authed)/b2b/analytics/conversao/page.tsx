/**
 * /b2b/analytics/conversao · #2 · Conversao por parceiro no funil voucher.
 *
 * Layout 2-col:
 *   ESQ · Tabela ranking de TODAS parcerias com voucher no mes
 *         (ordenado is_image_partner DESC, vouchers DESC)
 *   DIR · Detalhes da parceria selecionada (KPIs + funnel + comparison
 *         vs mes anterior + delta)
 *
 * Mes selecionavel via querystring ?ym=YYYY-MM. Auto-fallback (2026-04-26):
 * tenta mes atual, mes anterior, antepenultimo · escolhe primeiro com data
 * pra evitar landing em tela vazia "informativa".
 * Consome RPCs b2b_partner_conversion_monthly_all + monthly (mig 800-16).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { ConversionMonthlyView } from './ConversionMonthlyView'
import type { MonthlyConversionRow } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ ym?: string; partner?: string }>
}

function shiftYM(yearMonth: string, deltaMonths: number): string {
  const [y, m] = yearMonth.split('-').map(Number)
  const d = new Date(y, m - 1 + deltaMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentYM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function ConversaoPage({ searchParams }: PageProps) {
  const sp = await searchParams
  const explicit = sp.ym && /^\d{4}-\d{2}$/.test(sp.ym) ? sp.ym : null
  const selectedPartner = sp.partner || null

  const { repos } = await loadMiraServerContext()

  // Auto-fallback · se user nao especificou ?ym, tenta mes atual depois
  // anterior depois antepenultimo · pega primeiro com dados.
  let yearMonth: string
  let rows: MonthlyConversionRow[]
  if (explicit) {
    yearMonth = explicit
    rows = await repos.b2bPerformance.monthlyConversionAll(explicit).catch(() => [])
  } else {
    const candidates = [currentYM(), shiftYM(currentYM(), -1), shiftYM(currentYM(), -2)]
    yearMonth = candidates[0]
    rows = []
    for (const ym of candidates) {
      const r = await repos.b2bPerformance.monthlyConversionAll(ym).catch(() => [])
      if (r.length > 0) {
        yearMonth = ym
        rows = r
        break
      }
    }
  }

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
