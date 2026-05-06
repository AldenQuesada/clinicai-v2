/**
 * Cron: mira-monthly-partner-feedback.
 *
 * Schedule: dia 1 de cada mes 09h SP (cron `0 12 1 * *` UTC).
 * Pra cada parceria com voucher emitido no MES ANTERIOR, calcula stats de
 * conversao + delta vs mes-2 e envia mensagem WhatsApp resumindo.
 *
 * Consome RPC b2b_partner_conversion_monthly_all (mig 800-16) e despacha via
 * Evolution Mira instance · log em b2b_comm_dispatch_log com event_key
 * 'mira.cron.monthly_partner_feedback'.
 *
 * Best-effort: erros isolados por parceria nao bloqueiam o restante.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { resolveMiraInstance } from '@/lib/mira-instance'
import { createEvolutionServiceForMiraChannel } from '@/lib/mira-channel-evolution'
import { renderTemplate } from '@clinicai/utils'
import type { MonthlyConversionRow } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

const PT_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function fmtYearMonthPt(yearMonth: string): string {
  const [y, m] = yearMonth.split('-')
  const idx = Math.max(0, Math.min(11, Number(m) - 1))
  return `${PT_MONTHS[idx]}/${y}`
}

function fmtDeltaPp(pp: number): string {
  if (pp > 0) return `+${pp.toFixed(1)} pp`
  if (pp < 0) return `${pp.toFixed(1)} pp`
  return 'estável'
}

function fmtDeltaPct(pct: number | null): string {
  if (pct == null) return 'mês 1'
  if (pct > 0) return `+${pct.toFixed(0)}%`
  if (pct < 0) return `${pct.toFixed(0)}%`
  return 'estável'
}

/**
 * Mapeia MonthlyConversionRow + yearMonth → vars do template DB monthly_report
 * (mig 800-44). Vars derivadas com formato amigavel (deltas com "(N)" inline).
 */
function rowToTemplateVars(
  row: MonthlyConversionRow,
  yearMonth: string,
  partnerFirst: string,
): Record<string, string | number> {
  const period = fmtYearMonthPt(yearMonth)
  const deltaIssued =
    row.vouchers_issued_prev > 0
      ? `${fmtDeltaPct(row.delta_issued_pct)} (${row.vouchers_issued_prev})`
      : 'mês 1'
  const deltaConv =
    row.vouchers_issued_prev > 0
      ? `${fmtDeltaPp(row.delta_conv_pp)} (era ${row.conv_total_pct_prev.toFixed(1)}%)`
      : 'mês 1'
  return {
    parceira_name: row.partnership_name,
    parceira_first: partnerFirst,
    period_label: period,
    is_image_partner_emoji: row.is_image_partner ? ' 💎' : '',
    issued: row.vouchers_issued,
    purchased: row.vouchers_purchased,
    conv_pct: row.conv_total_pct.toFixed(1),
    issued_prev: row.vouchers_issued_prev,
    conv_pct_prev: row.conv_total_pct_prev.toFixed(1),
    delta_issued_label: deltaIssued,
    delta_conv_label: deltaConv,
  }
}

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-monthly-partner-feedback', async ({ supabase, repos, clinicId }) => {
    void supabase
    // Mes anterior (ex: rodando dia 01/05 → calcula stats de Abril)
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const yearMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

    // Stats de TODAS parcerias com voucher no mes
    let rows: MonthlyConversionRow[] = []
    try {
      rows = await repos.b2bPerformance.monthlyConversionAll(yearMonth)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`monthlyConversionAll falhou: ${msg}`)
    }

    const eligible = rows.filter((r) => r.vouchers_issued > 0)
    if (eligible.length === 0) {
      return { itemsProcessed: 0, eligible: 0, year_month: yearMonth }
    }

    // Audit C2 (2026-05-05): canal estrito · sem fallback mira-mirian.
    const wa = await createEvolutionServiceForMiraChannel(
      supabase,
      clinicId,
      'partner_response',
    )
    // Source-of-truth UI · mira_channels resolve sender por function_key (log-only).
    const senderInstance = await resolveMiraInstance(clinicId, 'partner_response')

    if (!wa) {
      // Sem canal ativo · skip todo o batch · zero send
      return {
        itemsProcessed: 0,
        eligible: eligible.length,
        year_month: yearMonth,
        skipped_no_channel: eligible.length,
      }
    }

    let sent = 0
    let failed = 0
    let skippedNoPhone = 0

    for (const row of eligible) {
      // Resolve phone + template per partnership (override > global)
      const [partnership, tpl] = await Promise.all([
        repos.b2bPartnerships.getById(row.partnership_id).catch(() => null),
        repos.b2bTemplates.getByEventKey(clinicId, 'monthly_report', row.partnership_id),
      ])
      const phone = partnership?.contactPhone?.trim() || ''
      if (!phone || phone.replace(/\D/g, '').length < 10) {
        skippedNoPhone++
        continue
      }

      const partnerFirst = (partnership?.contactName || row.partnership_name || '')
        .trim()
        .split(/\s+/)[0] || 'parceira'
      const vars = rowToTemplateVars(row, yearMonth, partnerFirst)
      const text = tpl?.textTemplate
        ? renderTemplate(tpl.textTemplate, vars)
        : // Fallback se template apagado · texto minimo
          `Resumo de ${vars.period_label} · ${row.partnership_name} · ${row.vouchers_issued} vouchers · ${row.conv_total_pct.toFixed(1)}% conversão.`

      try {
        const result = await wa.sendText(phone, text)
        await repos.waProAudit
          .logDispatch({
            clinicId,
            partnershipId: row.partnership_id,
            eventKey: 'mira.cron.monthly_partner_feedback',
            channel: 'text',
            recipientRole: 'partner',
            recipientPhone: phone,
            senderInstance,
            textContent: text,
            waMessageId: result.messageId ?? null,
            status: result.ok ? 'sent' : 'failed',
            errorMessage: result.error ?? null,
          })
          .catch(() => {
            // best-effort
          })
        if (result.ok) sent++
        else failed++
      } catch {
        failed++
      }
    }

    return {
      itemsProcessed: sent,
      eligible: eligible.length,
      sent,
      failed,
      skippedNoPhone,
      year_month: yearMonth,
    }
  })
}
