/**
 * Cron: mira-daily-top-insight.
 *
 * Schedule: diario 08h SP (cron `0 11 * * *` UTC).
 * Pega o top insight critical/warning do dia (RPC b2b_insights_global · mig 800-19),
 * monta mensagem WhatsApp e envia pros admins ativos cadastrados em b2b_admin_phones.
 *
 * No-spam: se nao tem critical/warning aberto, NAO envia · run_finish skipped.
 *
 * Audit log: cada dispatch loga em b2b_comm_dispatch_log (waProAudit) com
 * event_key 'mira.cron.daily_top_insight'.
 *
 * Best-effort: erros isolados por admin nao bloqueiam o resto.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { getEvolutionService } from '@/services/evolution.service'
import { filterSubscribers } from '@/lib/msg-subscriptions'
import { createLogger } from '@clinicai/logger'
import type { Insight, InsightSeverity } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

const log = createLogger({ app: 'mira' }).child({ cron: 'mira-daily-top-insight' })

// ─── Mapeamento severity → emoji (alinha com InsightsBanner.tsx) ────
const SEVERITY_EMOJI: Record<InsightSeverity, string> = {
  critical: '🚨',
  warning:  '⚠️',
  success:  '✨',
  info:     'ℹ️',
}

const SEVERITY_LABEL: Record<InsightSeverity, string> = {
  critical: 'Crítico',
  warning:  'Atenção',
  success:  'Bom sinal',
  info:     'Info',
}

function buildActionUrl(actionPath: string): string {
  // Base publica do mira (default · prod). action_url da RPC vem como path
  // relativo (ex: '/partnerships/<uuid>?tab=crescer').
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://mira.miriandpaula.com.br')
    .replace(/\/$/, '')
  if (!actionPath) return base
  if (/^https?:\/\//i.test(actionPath)) return actionPath
  const path = actionPath.startsWith('/') ? actionPath : `/${actionPath}`
  return `${base}${path}`
}

function renderInsightText(insight: Insight, totalAlerts: number): string {
  const emoji = SEVERITY_EMOJI[insight.severity] ?? 'ℹ️'
  const label = SEVERITY_LABEL[insight.severity] ?? 'Alerta'
  const url = buildActionUrl(insight.action_url)

  const lines: string[] = []
  lines.push(`${emoji} *Mira · alerta do dia* (${label})`)
  lines.push('')
  lines.push(`*${insight.title}*`)
  lines.push(insight.message)
  lines.push('')
  lines.push(`Parceria: ${insight.partnership_name}`)
  if (totalAlerts > 1) {
    lines.push(`(+${totalAlerts - 1} outros alertas pendentes)`)
  }
  lines.push('')
  lines.push(`Resolver: ${url}`)
  return lines.join('\n')
}

export async function GET(req: NextRequest) {
  return runCron(req, 'mira-daily-top-insight', async ({ repos, clinicId }) => {
    // 1. Busca insights globais (RPC ja ordena por score DESC)
    const result = await repos.b2bInsights.global()
    if (!result || !result.ok || !Array.isArray(result.insights)) {
      return {
        itemsProcessed: 0,
        skipped: true,
        reason: 'insights_unavailable',
      }
    }

    // 2. Filtra critical+warning, pega top score
    const alerts = result.insights.filter(
      (i) => i.severity === 'critical' || i.severity === 'warning',
    )
    if (alerts.length === 0) {
      return {
        itemsProcessed: 0,
        skipped: true,
        reason: 'no_critical',
        partnerships_scanned: result.partnerships_scanned,
      }
    }
    // RPC ja sort por score DESC · defesa em profundidade
    const top = alerts.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]

    // 3. Lista profissionais inscritos · categoria b2b + key b2b.daily_top_insight
    //    (mig 800-27 · 800-30+) · respeita permissions.msg pra opt-out individual
    const allProfessionals = await repos.waNumbers
      .listProfessionalPrivate(clinicId)
      .catch(() => [])
    const professionals = filterSubscribers(
      allProfessionals,
      'b2b',
      'b2b.daily_top_insight',
    )
    const muted =
      allProfessionals.filter((p) => p.isActive).length - professionals.length
    if (muted > 0) {
      log.info(
        { event_key: 'mira.cron.daily_top_insight', muted },
        'admin_dispatch.muted_by_subscription',
      )
    }

    if (professionals.length === 0) {
      return {
        itemsProcessed: 0,
        skipped: true,
        reason: 'no_b2b_recipients',
        insight_kind: top.kind,
        partnership_id: top.partnership_id,
        muted_by_subscription: muted,
      }
    }

    // 4. Monta texto e despacha pra cada profissional inscrito em B2B
    const text = renderInsightText(top, alerts.length)
    const wa = getEvolutionService('mira')
    const senderInstance = process.env.EVOLUTION_INSTANCE_MIRA ?? 'mira-mirian'

    let sent = 0
    let failed = 0

    for (const pro of professionals) {
      const phone = pro.phone
      try {
        const r = await wa.sendText(phone, text)
        await repos.waProAudit
          .logDispatch({
            clinicId,
            partnershipId: top.partnership_id,
            eventKey: 'mira.cron.daily_top_insight',
            channel: 'text',
            recipientRole: 'admin',
            recipientPhone: phone,
            senderInstance,
            textContent: text,
            waMessageId: r.messageId ?? null,
            status: r.ok ? 'sent' : 'failed',
            errorMessage: r.error ?? null,
          })
          .catch(() => {
            // best-effort
          })
        if (r.ok) sent++
        else failed++
      } catch {
        failed++
      }
    }

    return {
      itemsProcessed: sent,
      eligible_alerts: alerts.length,
      recipients: professionals.length,
      muted_by_subscription: muted,
      sent,
      failed,
      insight_kind: top.kind,
      insight_severity: top.severity,
      insight_score: top.score,
      partnership_id: top.partnership_id,
      partnership_name: top.partnership_name,
    }
  })
}
