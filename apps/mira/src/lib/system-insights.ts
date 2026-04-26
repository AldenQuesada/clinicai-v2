/**
 * system-insights · gera Insight[] sinteticos a partir de sinais operacionais.
 *
 * Diferenca vs b2b_insights_global (mig 800-19): aqueles sao por parceria
 * (over_cap, low_conversion, nps_excellent...). Os "system_*" aqui sao
 * cross-program · saude da operacao (WhatsApp ativo, candidaturas paradas,
 * NPS silente). Renderizam no mesmo NotificationsBell pra centralizar tudo
 * num lugar so.
 *
 * Pedido Alden 2026-04-26: tirar alerts da pagina /b2b/analytics e jogar
 * pro sino com link clicavel pra onde resolver.
 */

import type { AnalyticsBlob, Insight } from '@clinicai/repositories'

interface SystemInsightInput {
  data: AnalyticsBlob | null
  pendingApplications: number
  /** Idade em dias da parceria active mais antiga · grace periods. */
  oldestActivePartnershipDays?: number
}

/**
 * Score base por kind · serve so pra ordenacao no sino.
 * Critical > warning > info na escala default da bell.
 */
const SCORE = {
  system_no_senders: 95, // sem sender, automacao morreu
  system_velocity_slow: 80, // candidatas esfriando
  system_nps_silent: 60, // oportunidade · nao bloqueia
  system_pending_apps: 70, // candidaturas paradas
} as const

// Thresholds calibrados ONDA 1.5 (2026-04-26 · reset notificacoes falsas):
// - 3 candidaturas era barulhento · 5 reflete real backlog luxury.
// - 48h era SaaS · luxury permite 72h pra avaliacao com cuidado.
// - no_senders 7d grace · evita alarme durante setup inicial.
// - nps_silent 60d minimo · NPS prematuro era falso (parceria sem
//   convidadas atendidas ainda).
const PENDING_APPS_THRESHOLD = 5
const VELOCITY_SLOW_HOURS = 72
const NO_SENDERS_GRACE_DAYS = 7
const NPS_SILENT_MIN_DAYS = 60

export function buildSystemInsights({
  data,
  pendingApplications,
  oldestActivePartnershipDays,
}: SystemInsightInput): Insight[] {
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

  // ─── 1. Sem WhatsApp ativo · automacao Mira nao roda ────────────────
  if (sendersActive === 0 && totalActive > 0 && ageDays >= NO_SENDERS_GRACE_DAYS) {
    out.push({
      kind: 'system_no_senders',
      severity: 'critical',
      title: 'Mira sem WhatsApp ativo',
      message:
        'Nenhum sender ativo · automacao nao consegue disparar mensagens. Configure pelo menos 1 numero.',
      partnership_id: '',
      partnership_name: 'Sistema',
      action_url: '/configuracoes?tab=channels',
      score: SCORE.system_no_senders,
    })
  }

  // ─── 2. Candidaturas paradas ─────────────────────────────────────────
  const slowApproval = pendingApplications > 0 && resolved > 0 && avgHours > VELOCITY_SLOW_HOURS
  if (pendingApplications >= PENDING_APPS_THRESHOLD || slowApproval) {
    const msg = slowApproval
      ? `${pendingApplications} candidatura${pendingApplications > 1 ? 's' : ''} aguardando · tempo medio ${avgHours}h. Convidadas estao esfriando.`
      : `${pendingApplications} candidatura${pendingApplications > 1 ? 's' : ''} aguardando aprovacao.`
    out.push({
      kind: 'system_pending_apps',
      severity: slowApproval ? 'critical' : 'warning',
      title: 'Candidaturas pendentes',
      message: msg,
      partnership_id: '',
      partnership_name: 'Sistema',
      action_url: '/b2b/candidaturas',
      score: SCORE.system_pending_apps,
    })
  }

  // ─── 3. Velocity alta sem ter candidaturas pendentes (resolvidas devagar) ──
  if (pendingApplications === 0 && resolved > 0 && avgHours > VELOCITY_SLOW_HOURS) {
    out.push({
      kind: 'system_velocity_slow',
      severity: 'warning',
      title: 'Aprovacao lenta',
      message: `Tempo medio de aprovacao em ${avgHours}h (${resolved} resolvidas). Acima do recomendado.`,
      partnership_id: '',
      partnership_name: 'Sistema',
      action_url: '/b2b/candidaturas',
      score: SCORE.system_velocity_slow,
    })
  }

  // ─── 4. NPS silente · senders ok mas zero respostas ──────────────────
  if (
    sendersActive > 0 &&
    npsResponses === 0 &&
    totalActive >= 3 &&
    ageDays >= NPS_SILENT_MIN_DAYS
  ) {
    out.push({
      kind: 'system_nps_silent',
      severity: 'warning',
      title: 'NPS sem respostas',
      message: `${sendersActive} sender${sendersActive > 1 ? 's' : ''} ativo${sendersActive > 1 ? 's' : ''} mas zero respostas NPS no programa. Hora de disparar campanha.`,
      partnership_id: '',
      partnership_name: 'Sistema',
      action_url: '/b2b/disparos',
      score: SCORE.system_nps_silent,
    })
  }

  return out
}
