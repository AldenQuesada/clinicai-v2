/**
 * imageAnalyzer · transforma performance bruta de parcerias de imagem em
 * interpretacao acionavel. Espelho leve de overviewAnalyzer.ts.
 *
 * Recebe lista filtrada (is_image_partner=true) + days do periodo.
 * Retorna:
 *   - status global · semaforo do pilar imagem
 *   - headline + subtitle · 1 frase resumindo
 *   - actions[] · proximos passos por parceria em risco (max 3)
 *   - avgConversion · media usada como referencia na tabela
 *
 * Thresholds (BI · alinhado com overviewAnalyzer):
 *   conv_pct >= 25 = green · 12-25 = amber · <12 = red
 *   days_since_last_voucher > 21 = parceria fria
 *   classification critico/abaixo/inativa = risco
 */

import type { PartnerPerformanceRow } from '@clinicai/repositories'

export type ImageStatus = 'green' | 'amber' | 'red' | 'neutral'

export interface ImageAction {
  priority: 1 | 2 | 3
  title: string
  rationale: string
  href: string
}

export interface ImageDiagnostic {
  status: ImageStatus
  headline: string
  subtitle: string
  actions: ImageAction[]
  avgConversion: number
  totals: {
    total: number
    healthy: number
    warning: number
    risk: number
    cold: number
  }
}

const RISK_CLS = new Set(['critico', 'abaixo', 'inativa'])
const WARN_CLS = new Set(['aceitavel'])
const COLD_DAYS = 21

export function analyzeImage(
  rows: PartnerPerformanceRow[],
  days: number,
): ImageDiagnostic {
  const total = rows.length
  if (total === 0) {
    return {
      status: 'neutral',
      headline: 'Sem parcerias de imagem.',
      subtitle: 'Marque parcerias estrategicas como "imagem" no cadastro.',
      actions: [],
      avgConversion: 0,
      totals: { total: 0, healthy: 0, warning: 0, risk: 0, cold: 0 },
    }
  }

  const healthy = rows.filter(
    (r) => r.health_color === 'green' && !RISK_CLS.has(r.classification),
  ).length
  const warning = rows.filter(
    (r) =>
      r.health_color === 'yellow' ||
      WARN_CLS.has(r.classification),
  ).length
  const risk = rows.filter(
    (r) => r.health_color === 'red' || RISK_CLS.has(r.classification),
  ).length
  const cold = rows.filter(
    (r) =>
      r.last_voucher_at &&
      typeof r.days_since_last_voucher === 'number' &&
      r.days_since_last_voucher > COLD_DAYS,
  ).length

  const withVouchers = rows.filter((r) => (r.vouchers_emitted || 0) > 0)
  const avgConversion =
    withVouchers.length > 0
      ? Math.round(
          withVouchers.reduce((acc, r) => acc + (r.conversion_pct || 0), 0) /
            withVouchers.length,
        )
      : 0

  // ─── Actions · max 3 por prioridade ───────────────────────────────────
  const actions: ImageAction[] = []

  // 1. Parcerias frias (sem voucher ha mais de 21 dias)
  const coldest = rows
    .filter(
      (r) =>
        typeof r.days_since_last_voucher === 'number' &&
        r.days_since_last_voucher > COLD_DAYS,
    )
    .sort(
      (a, b) =>
        (b.days_since_last_voucher ?? 0) - (a.days_since_last_voucher ?? 0),
    )

  for (const r of coldest.slice(0, 2)) {
    actions.push({
      priority: 1,
      title: `Reativar ${r.name}`,
      rationale: `${r.days_since_last_voucher}d sem voucher · parceria de imagem fria.`,
      href: `/partnerships/${r.partnership_id}`,
    })
  }

  // 2. Parcerias em risco (classification critico/inativa OU health red)
  const atRisk = rows
    .filter(
      (r) =>
        (r.health_color === 'red' || r.classification === 'critico') &&
        !coldest.slice(0, 2).some((c) => c.partnership_id === r.partnership_id),
    )
    .sort((a, b) => (a.conversion_pct || 0) - (b.conversion_pct || 0))

  for (const r of atRisk.slice(0, 2)) {
    actions.push({
      priority: 2,
      title: `Aplicar playbook em ${r.name}`,
      rationale: `Conversao ${r.conversion_pct}% · classificada como ${r.classification}.`,
      href: `/partnerships/${r.partnership_id}`,
    })
  }

  // 3. Volume baixo geral
  const totalEmitted = rows.reduce((acc, r) => acc + (r.vouchers_emitted || 0), 0)
  if (totalEmitted === 0) {
    actions.push({
      priority: 1,
      title: 'Emitir primeiro voucher de imagem',
      rationale: 'Nenhuma parceria de imagem gerou voucher no periodo.',
      href: '/vouchers/novo',
    })
  } else if (total >= 3 && totalEmitted < total) {
    actions.push({
      priority: 3,
      title: 'Distribuir vouchers entre parcerias de imagem',
      rationale: `Apenas ${totalEmitted} voucher(s) entre ${total} parcerias estrategicas.`,
      href: '/vouchers/novo',
    })
  }

  actions.sort((a, b) => a.priority - b.priority)
  const topActions = actions.slice(0, 3)

  // ─── Headline · sintese ───────────────────────────────────────────────
  let status: ImageStatus = 'green'
  let headline = 'Pilar imagem saudavel.'
  let subtitle = `${healthy} de ${total} parcerias estrategicas em ritmo · ${avgConversion}% conversao media.`

  if (risk > 0) {
    status = 'red'
    headline =
      risk === 1
        ? '1 parceria de imagem em risco.'
        : `${risk} parcerias de imagem em risco.`
    subtitle = `${healthy} saudaveis · ${warning} em atencao · ${risk} criticas em ${days}d.`
  } else if (cold > 0) {
    status = 'amber'
    headline =
      cold === 1
        ? '1 parceria de imagem esfriou.'
        : `${cold} parcerias de imagem esfriaram.`
    subtitle = `Sem voucher ha mais de ${COLD_DAYS}d · imagem publica perde tracao.`
  } else if (warning > 0) {
    status = 'amber'
    headline = 'Pilar imagem com pendencias.'
    subtitle = `${warning} parceria(s) em atencao · ${avgConversion}% conversao media.`
  } else if (totalEmitted === 0) {
    status = 'amber'
    headline = 'Pilar imagem parado no periodo.'
    subtitle = `${total} parcerias cadastradas mas zero vouchers em ${days}d.`
  }

  return {
    status,
    headline,
    subtitle,
    actions: topActions,
    avgConversion,
    totals: { total, healthy, warning, risk, cold },
  }
}
