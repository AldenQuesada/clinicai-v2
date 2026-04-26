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
import { getEvolutionService } from '@/services/evolution.service'
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

function renderMonthlyText(row: MonthlyConversionRow, yearMonth: string): string {
  const label = fmtYearMonthPt(yearMonth)
  const lines: string[] = []
  lines.push(`Olá! Resumo da parceria em *${label}* 📊`)
  lines.push('')
  lines.push(`*${row.partnership_name}*${row.is_image_partner ? ' 💎' : ''}`)
  lines.push('')
  lines.push(`🎟 Vouchers emitidos: *${row.vouchers_issued}*`)
  if (row.vouchers_issued_prev > 0) {
    lines.push(`   vs mês anterior: ${fmtDeltaPct(row.delta_issued_pct)} (${row.vouchers_issued_prev})`)
  }
  lines.push(`💰 Conversão total: *${row.conv_total_pct.toFixed(1)}%*`)
  lines.push(`   ${row.vouchers_purchased} virou compra de ${row.vouchers_issued} emitidos`)
  if (row.vouchers_issued_prev > 0) {
    lines.push(`   vs mês anterior: ${fmtDeltaPp(row.delta_conv_pp)} (era ${row.conv_total_pct_prev.toFixed(1)}%)`)
  }
  lines.push('')
  lines.push('Obrigada pela parceria 💛')
  return lines.join('\n')
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

    const wa = getEvolutionService('mira')
    const senderInstance = process.env.EVOLUTION_INSTANCE_MIRA ?? 'mira-mirian'

    let sent = 0
    let failed = 0
    let skippedNoPhone = 0

    for (const row of eligible) {
      // Resolve phone (precisa hit no DB porque RPC nao retorna phone)
      const partnership = await repos.b2bPartnerships
        .getById(row.partnership_id)
        .catch(() => null)
      const phone = partnership?.contactPhone?.trim() || ''
      if (!phone || phone.replace(/\D/g, '').length < 10) {
        skippedNoPhone++
        continue
      }

      const text = renderMonthlyText(row, yearMonth)

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
