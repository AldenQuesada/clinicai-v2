/**
 * overviewAnalyzer · transforma estatistica bruta em interpretacao acionavel.
 *
 * Recebe AnalyticsBlob + period days. Retorna:
 *   - status global (green/amber/red) · semaforo do programa
 *   - headline · 1 frase resumindo o estado
 *   - signals[] · interpretacoes contextual por section (sub-text leve)
 *   - actions[] · proximos passos concretos (max 3)
 *
 * Regras simples · benchmarks cravados (decididos com Alden):
 *   conv_pct >= 30 = bom · 15-30 = ok · <15 = baixa
 *   health red >= 1 = atencao · yellow >= 2 = monitorar
 *   candidaturas pending >= 1 = ha trabalho
 *   nps_score >= 8 = oportunidade pitch
 */

import type { AnalyticsBlob } from '@clinicai/repositories'

export type SignalStatus = 'green' | 'amber' | 'red' | 'neutral'

export interface OverviewSignal {
  /** Section/KPI a que pertence · usado pelo render pra colocar o sinal abaixo do bloco certo */
  section: 'snapshot' | 'conversion' | 'origin' | 'health' | 'growth' | 'velocity' | 'mira'
  status: SignalStatus
  /** 1 frase curta · max ~80 chars · interpretativa */
  message: string
}

export interface OverviewAction {
  /** Prioridade 1-3 (1=mais urgente). Render usa pra ordem visual. */
  priority: 1 | 2 | 3
  /** Verbo + substantivo · "Revisar combo voucher" */
  title: string
  /** Razao pelo qual a acao foi sugerida · 1 frase */
  rationale: string
  /** Se aplicavel · path interno pra clicar (ex: /b2b/saude). */
  href?: string
}

export interface OverviewDiagnostic {
  status: SignalStatus
  /** Headline curta · 1 frase descrevendo o estado geral */
  headline: string
  /** Subtitle · 1 frase complementar com numero relevante */
  subtitle: string
  signals: OverviewSignal[]
  actions: OverviewAction[]
}

export function analyzeOverview(
  data: AnalyticsBlob,
  days: number,
): OverviewDiagnostic {
  const a = data.applications ?? ({} as AnalyticsBlob['applications'])
  const v = data.vouchers ?? ({} as AnalyticsBlob['vouchers'])
  const t = data.timing ?? ({} as AnalyticsBlob['timing'])
  const h = data.health ?? ({} as AnalyticsBlob['health'])
  const m = data.mira ?? ({} as AnalyticsBlob['mira'])
  const nps = m.nps_summary ?? { responses: 0, nps_score: null }

  const totalActive = Number(h.total ?? 0)
  const red = Number(h.red ?? 0)
  const yellow = Number(h.yellow ?? 0)
  const green = Number(h.green ?? 0)

  const vouchersTotal = Number(v.total ?? 0)
  const vouchersOpened = Number(v.opened ?? 0)
  const vouchersScheduled = Number(v.scheduled ?? 0)
  const vouchersRedeemed = Number(v.redeemed ?? 0)
  const vouchersPaid = Number(v.purchased ?? 0)
  const convPct =
    vouchersTotal > 0 ? Math.round((vouchersPaid / vouchersTotal) * 100) : 0

  const candidPending = Number(a.pending ?? 0)
  const npsScore = nps.nps_score
  const npsResponses = Number(nps.responses ?? 0)
  const miraVouchers = Number(v.via_mira ?? 0)
  const miraSendersActive = Number(m.wa_senders_active ?? 0)

  const signals: OverviewSignal[] = []
  const actions: OverviewAction[] = []

  // ─── Snapshot · estado geral ─────────────────────────────────────────
  if (totalActive === 0) {
    signals.push({
      section: 'snapshot',
      status: 'red',
      message: 'Nenhuma parceria ativa · programa não iniciado.',
    })
  } else if (red > 0) {
    signals.push({
      section: 'snapshot',
      status: 'red',
      message: `${red} parceria${red > 1 ? 's' : ''} em saúde crítica · ação imediata.`,
    })
  } else if (yellow > 0) {
    signals.push({
      section: 'snapshot',
      status: 'amber',
      message: `${yellow} parceria${yellow > 1 ? 's' : ''} em atenção · monitorar.`,
    })
  } else {
    signals.push({
      section: 'snapshot',
      status: 'green',
      message: `${green} de ${totalActive} parcerias saudáveis · operação estável.`,
    })
  }

  // ─── Conversao ──────────────────────────────────────────────────────
  if (vouchersTotal === 0) {
    signals.push({
      section: 'conversion',
      status: 'amber',
      message: `Nenhum voucher emitido nos últimos ${days}d · programa parado nesse período.`,
    })
    actions.push({
      priority: 1,
      title: 'Emitir vouchers',
      rationale: 'Sem vouchers, não há pipeline. Use a tela de cadastrar.',
      href: '/vouchers/novo',
    })
  } else if (vouchersTotal < 5) {
    signals.push({
      section: 'conversion',
      status: 'amber',
      message: `Apenas ${vouchersTotal} vouchers no período · volume baixo pra avaliar conversão.`,
    })
  } else if (convPct >= 30) {
    signals.push({
      section: 'conversion',
      status: 'green',
      message: `Conversão de ${convPct}% acima do benchmark (30%) · funil saudável.`,
    })
  } else if (convPct >= 15) {
    signals.push({
      section: 'conversion',
      status: 'amber',
      message: `Conversão de ${convPct}% dentro do esperado (15-30%) · pode otimizar.`,
    })
  } else {
    // Detecta onde o drop principal acontece
    let dropStage = 'desconhecido'
    if (vouchersScheduled === 0 && vouchersOpened > 0) dropStage = 'Aberto → Agendou'
    else if (vouchersRedeemed === 0 && vouchersScheduled > 0) dropStage = 'Agendou → Compareceu'
    else if (vouchersPaid === 0 && vouchersRedeemed > 0) dropStage = 'Compareceu → Pagou'
    signals.push({
      section: 'conversion',
      status: 'red',
      message: `Conversão de ${convPct}% abaixo do mínimo (15%) · drop em ${dropStage}.`,
    })
    actions.push({
      priority: 1,
      title: 'Revisar combo do voucher',
      rationale: `Conversão baixa (${convPct}%) sugere combo não case com perfil das convidadas.`,
      href: '/estudio/combos',
    })
  }

  // ─── Saude ──────────────────────────────────────────────────────────
  if (red > 0) {
    actions.push({
      priority: 1,
      title: 'Aplicar playbook retention',
      rationale: `${red} parceria${red > 1 ? 's' : ''} em saúde crítica · risco de churn.`,
      href: '/b2b/saude',
    })
    signals.push({
      section: 'health',
      status: 'red',
      message: `${red} parceria${red > 1 ? 's' : ''} crítica${red > 1 ? 's' : ''} · risco de churn alto.`,
    })
  } else if (yellow > 0) {
    actions.push({
      priority: 2,
      title: 'Monitorar parcerias amarelas',
      rationale: `${yellow} parceria${yellow > 1 ? 's' : ''} em atenção · agir antes de virar vermelha.`,
      href: '/b2b/saude',
    })
    signals.push({
      section: 'health',
      status: 'amber',
      message: `${yellow} parceria${yellow > 1 ? 's' : ''} em atenção · ajuste preventivo.`,
    })
  } else if (totalActive > 0) {
    signals.push({
      section: 'health',
      status: 'green',
      message: `100% das ${totalActive} parcerias verdes · saúde excelente.`,
    })
  }

  // ─── Crescimento (candidaturas) ────────────────────────────────────
  if (candidPending > 0) {
    signals.push({
      section: 'growth',
      status: 'amber',
      message: `${candidPending} candidatura${candidPending > 1 ? 's' : ''} aguardando aprovação.`,
    })
    actions.push({
      priority: 2,
      title: 'Aprovar candidaturas pendentes',
      rationale: `${candidPending} aguardando · cada dia parado é candidata desistindo.`,
      href: '/b2b/candidaturas',
    })
  } else if ((a.total ?? 0) === 0) {
    signals.push({
      section: 'growth',
      status: 'amber',
      message: 'Nenhuma candidatura no período · pipeline frio.',
    })
  } else {
    signals.push({
      section: 'growth',
      status: 'green',
      message: 'Pipeline em dia · sem candidaturas pendentes.',
    })
  }

  // ─── Velocity ───────────────────────────────────────────────────────
  const avgHours = Number(t.avg_approval_hours ?? 0)
  const resolved = Number(t.resolved_count ?? 0)
  if (resolved === 0) {
    signals.push({
      section: 'velocity',
      status: 'neutral',
      message: 'Nenhuma candidatura resolvida no período.',
    })
  } else if (avgHours <= 4) {
    signals.push({
      section: 'velocity',
      status: 'green',
      message: `Aprovação rápida · ${avgHours}h em média (${resolved} resolvidas).`,
    })
  } else if (avgHours <= 24) {
    signals.push({
      section: 'velocity',
      status: 'amber',
      message: `Tempo médio ${avgHours}h · pode acelerar.`,
    })
  } else {
    signals.push({
      section: 'velocity',
      status: 'red',
      message: `Tempo médio ${avgHours}h · candidatas esfriando.`,
    })
  }

  // ─── Origem dos vouchers ────────────────────────────────────────────
  if (vouchersTotal > 0) {
    const miraPct = Math.round((miraVouchers / vouchersTotal) * 100)
    if (miraPct < 30) {
      signals.push({
        section: 'origin',
        status: 'amber',
        message: `Mira gerou só ${miraPct}% (${miraVouchers}/${vouchersTotal}) · automação subutilizada.`,
      })
    } else if (miraPct >= 70) {
      signals.push({
        section: 'origin',
        status: 'green',
        message: `Mira responsável por ${miraPct}% dos vouchers · automação madura.`,
      })
    } else {
      signals.push({
        section: 'origin',
        status: 'neutral',
        message: `${miraPct}% via Mira · automação parcial.`,
      })
    }
  }

  // ─── NPS ────────────────────────────────────────────────────────────
  if (npsScore != null && npsScore >= 8) {
    actions.push({
      priority: 3,
      title: 'Aproveitar NPS alto pra renovações',
      rationale: `NPS ${npsScore} excelente · momento ideal pra Pitch Mode.`,
      href: '/partnerships',
    })
  }

  // ─── Mira background ────────────────────────────────────────────────
  if (miraSendersActive === 0) {
    signals.push({
      section: 'mira',
      status: 'red',
      message: 'Nenhum WhatsApp ativo · Mira não consegue disparar.',
    })
    actions.push({
      priority: 1,
      title: 'Configurar pelo menos 1 WhatsApp',
      rationale: 'Sem sender ativo, automação Mira não funciona.',
      href: '/configuracoes?tab=channels',
    })
  } else if (npsResponses === 0 && totalActive >= 3) {
    signals.push({
      section: 'mira',
      status: 'amber',
      message: `${miraSendersActive} senders ativos mas zero respostas NPS · disparar campanha NPS.`,
    })
  } else {
    signals.push({
      section: 'mira',
      status: 'green',
      message: `${miraSendersActive} senders ativos · sistema saudável.`,
    })
  }

  // ─── Headline · síntese ─────────────────────────────────────────────
  let status: SignalStatus = 'green'
  let headline = 'Programa em ritmo saudável.'
  let subtitle = `${totalActive} parcerias ativas · ${vouchersTotal} vouchers no período · ${convPct}% conversão.`

  if (totalActive === 0) {
    status = 'red'
    headline = 'Programa não iniciado.'
    subtitle = 'Cadastre a primeira parceria e emita vouchers.'
  } else if (red > 0) {
    status = 'red'
    headline = 'Atenção crítica.'
    subtitle = `${red} parceria${red > 1 ? 's' : ''} em risco · ${candidPending} candidatura${candidPending > 1 ? 's' : ''} pendente${candidPending > 1 ? 's' : ''}.`
  } else if (vouchersTotal === 0) {
    status = 'amber'
    headline = 'Programa parado no período.'
    subtitle = `${totalActive} parcerias ativas mas zero vouchers em ${days}d.`
  } else if (convPct < 15 && vouchersTotal >= 5) {
    status = 'amber'
    headline = 'Conversão abaixo do esperado.'
    subtitle = `${convPct}% (${vouchersPaid}/${vouchersTotal}) · benchmark mínimo é 15%.`
  } else if (yellow > 0 || candidPending > 0) {
    status = 'amber'
    headline = 'Programa estável com pendências.'
    subtitle = `${yellow} amarelas · ${candidPending} candidatura${candidPending > 1 ? 's' : ''} aguardando.`
  }

  // Limita actions a 3 priorizadas
  actions.sort((x, y) => x.priority - y.priority)
  const topActions = actions.slice(0, 3)

  return { status, headline, subtitle, signals, actions: topActions }
}
