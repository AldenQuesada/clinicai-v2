/**
 * system-insights · gera Insight[] sinteticos a partir de sinais operacionais.
 *
 * Diferenca vs b2b_insights_global (mig 800-19): aqueles sao por parceria
 * (over_cap, low_conversion, nps_excellent...). Os "system_*" aqui sao
 * cross-program · saude da operacao (WhatsApp ativo, candidaturas paradas,
 * NPS silente). Renderizam no NotificationsBell.
 *
 * Mig 800-45 (2026-04-26 · zero hardcode): TITLE + MESSAGE de cada alerta
 * vem do DB (b2b_comm_templates · event_keys bell_*). Convencao:
 *   text_template = "TITLE\n---\nMESSAGE"
 * Service splita no primeiro `\n---\n` · vars renderizadas via {var}.
 *
 * Thresholds calibrados ONDA 1.5 (2026-04-26 · reset notificacoes falsas):
 * - 5 candidaturas pra warning (era 3 · barulhento)
 * - 72h pra aprovacao lenta (era 48h · luxury permite mais)
 * - 7d grace pra no_senders (evita alarme durante setup inicial)
 * - 60d minimo pra nps_silent (NPS prematuro era falso)
 */

import { renderTemplate } from '@clinicai/utils'
import type {
  AnalyticsBlob,
  Insight,
  B2BCommTemplateRepository,
} from '@clinicai/repositories'

interface SystemInsightInput {
  data: AnalyticsBlob | null
  pendingApplications: number
  /** Idade em dias da parceria active mais antiga · grace periods. */
  oldestActivePartnershipDays?: number
  /** Repo opcional pra carregar templates DB · fallback hardcoded se ausente. */
  repos?: { b2bTemplates: B2BCommTemplateRepository }
  /** clinic_id pra fetch de templates por clinica. */
  clinicId?: string
}

const SCORE = {
  bell_no_senders: 95,
  bell_velocity_slow: 80,
  bell_nps_silent: 60,
  bell_pending_apps: 70,
} as const

const PENDING_APPS_THRESHOLD = 5
const VELOCITY_SLOW_HOURS = 72
const NO_SENDERS_GRACE_DAYS = 7
const NPS_SILENT_MIN_DAYS = 60

// Fallback hardcoded · so usado se repo/template indisponivel
const FALLBACK = {
  bell_no_senders: {
    title: 'Mira sem WhatsApp ativo',
    message: 'Nenhum sender ativo · automacao nao consegue disparar mensagens.',
  },
  bell_pending_apps: {
    title: 'Candidaturas pendentes',
    message: 'Candidaturas aguardando aprovacao.',
  },
  bell_velocity_slow: {
    title: 'Aprovacao lenta',
    message: 'Tempo medio de aprovacao acima do recomendado.',
  },
  bell_nps_silent: {
    title: 'NPS sem respostas',
    message: 'Senders ativos mas zero respostas NPS.',
  },
} as const

/**
 * Splita "TITLE\n---\nMESSAGE" em {title, message}.
 * Se nao tem separador `\n---\n`, considera tudo como message + title vazio.
 */
function splitTitleMessage(text: string): { title: string; message: string } {
  const idx = text.indexOf('\n---\n')
  if (idx === -1) return { title: '', message: text.trim() }
  return {
    title: text.slice(0, idx).trim(),
    message: text.slice(idx + 5).trim(),
  }
}

/**
 * Resolve title/message · DB-driven com fallback defensivo.
 * vars = vars do template renderizadas via renderTemplate.
 */
async function resolveBellText(
  eventKey: keyof typeof FALLBACK,
  vars: Record<string, string | number>,
  repos?: { b2bTemplates: B2BCommTemplateRepository },
  clinicId?: string,
): Promise<{ title: string; message: string }> {
  if (!repos || !clinicId) return FALLBACK[eventKey]
  try {
    const tpl = await repos.b2bTemplates.getByEventKey(clinicId, eventKey)
    if (!tpl?.textTemplate) return FALLBACK[eventKey]
    const rendered = renderTemplate(tpl.textTemplate, vars)
    return splitTitleMessage(rendered)
  } catch {
    return FALLBACK[eventKey]
  }
}

export async function buildSystemInsights({
  data,
  pendingApplications,
  oldestActivePartnershipDays,
  repos,
  clinicId,
}: SystemInsightInput): Promise<Insight[]> {
  const out: Insight[] = []
  if (!data) return out

  const m = data.mira ?? ({} as AnalyticsBlob['mira'])
  const t = data.timing ?? ({} as AnalyticsBlob['timing'])
  const h = data.health ?? ({} as AnalyticsBlob['health'])
  const nps = m.nps_summary ?? { responses: 0, nps_score: null }

  const sendersActive = Number(m.wa_senders_active ?? 0)
  const totalActive = Number(h.total ?? 0)
  const npsResponses = Number(nps.responses ?? 0)
  const avgHours = Number(t.avg_approval_hours ?? 0)
  const resolved = Number(t.resolved_count ?? 0)
  const ageDays = Number(oldestActivePartnershipDays ?? 0)

  // ─── 1. Sem WhatsApp ativo ──────────────────────────────────────────
  if (sendersActive === 0 && totalActive > 0 && ageDays >= NO_SENDERS_GRACE_DAYS) {
    const { title, message } = await resolveBellText('bell_no_senders', { total_active: totalActive }, repos, clinicId)
    out.push({
      kind: 'system_no_senders',
      severity: 'critical',
      title,
      message,
      partnership_id: '',
      partnership_name: 'Sistema',
      action_url: '/configuracoes?tab=channels',
      score: SCORE.bell_no_senders,
    })
  }

  // ─── 2. Candidaturas paradas ────────────────────────────────────────
  const slowApproval = pendingApplications > 0 && resolved > 0 && avgHours > VELOCITY_SLOW_HOURS
  if (pendingApplications >= PENDING_APPS_THRESHOLD || slowApproval) {
    const plural = pendingApplications > 1 ? 's' : ''
    const slowSuffix = slowApproval ? ` · tempo medio ${avgHours}h` : ''
    const { title, message } = await resolveBellText(
      'bell_pending_apps',
      {
        pending_count: pendingApplications,
        plural_s: plural,
        slow_suffix: slowSuffix,
        avg_hours: avgHours,
      },
      repos,
      clinicId,
    )
    out.push({
      kind: 'system_pending_apps',
      severity: slowApproval ? 'critical' : 'warning',
      title,
      message,
      partnership_id: '',
      partnership_name: 'Sistema',
      action_url: '/b2b/candidaturas',
      score: SCORE.bell_pending_apps,
    })
  }

  // ─── 3. Velocity alta sem candidaturas pendentes ───────────────────
  if (pendingApplications === 0 && resolved > 0 && avgHours > VELOCITY_SLOW_HOURS) {
    const { title, message } = await resolveBellText(
      'bell_velocity_slow',
      { avg_hours: avgHours, resolved_count: resolved },
      repos,
      clinicId,
    )
    out.push({
      kind: 'system_velocity_slow',
      severity: 'warning',
      title,
      message,
      partnership_id: '',
      partnership_name: 'Sistema',
      action_url: '/b2b/candidaturas',
      score: SCORE.bell_velocity_slow,
    })
  }

  // ─── 4. NPS silente ──────────────────────────────────────────────────
  if (
    sendersActive > 0 &&
    npsResponses === 0 &&
    totalActive >= 3 &&
    ageDays >= NPS_SILENT_MIN_DAYS
  ) {
    const { title, message } = await resolveBellText(
      'bell_nps_silent',
      {
        senders_active: sendersActive,
        plural_s: sendersActive > 1 ? 's' : '',
        total_active: totalActive,
      },
      repos,
      clinicId,
    )
    out.push({
      kind: 'system_nps_silent',
      severity: 'warning',
      title,
      message,
      partnership_id: '',
      partnership_name: 'Sistema',
      action_url: '/b2b/disparos',
      score: SCORE.bell_nps_silent,
    })
  }

  return out
}
