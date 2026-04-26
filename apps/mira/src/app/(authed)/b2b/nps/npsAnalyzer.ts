/**
 * npsAnalyzer · transforma respostas de NPS B2B em interpretacao acionavel.
 *
 * Espelho leve de imageAnalyzer.ts. Recebe summary global + lista das respostas
 * (last 200, ja vem do server) e retorna:
 *   - status      · semaforo (>= 70 green · 30-69 amber · < 30 red · zero neutral)
 *   - headline + subtitle · 1 frase com o so-what
 *   - actions[]   · proximos passos (max 3) com link
 *   - perPartnership[] · agregacao client-side pra heatmap
 *   - totals      · contagens normalizadas
 *
 * Thresholds (BI · alinhado com benchmark de NPS):
 *   nps >= 70  · excelencia (top performers)
 *   nps 30-69  · bom mas pode melhorar (mediano)
 *   nps < 30   · ruim · acao urgente
 *   bucket: promoter (9-10) · passive (7-8) · detractor (0-6) · pending (no score)
 */

import type {
  NpsBucket,
  NpsResponseEntry,
  NpsSummary,
} from '@clinicai/repositories'

export type NpsStatus = 'green' | 'amber' | 'red' | 'neutral'

export interface NpsAction {
  priority: 1 | 2 | 3
  title: string
  rationale: string
  href: string
}

export interface NpsPerPartnership {
  partnership_id: string | null
  partnership_name: string
  total: number
  promoters: number
  passives: number
  detractors: number
  pending: number
  nps: number | null
  responded: number
}

export interface NpsDiagnostic {
  status: NpsStatus
  headline: string
  subtitle: string
  actions: NpsAction[]
  totals: {
    responses: number
    responded: number
    promoters: number
    passives: number
    detractors: number
    pending: number
    promoterPct: number
    passivePct: number
    detractorPct: number
    nps: number | null
  }
  perPartnership: NpsPerPartnership[]
}

const BENCHMARK_GOOD = 50
const BENCHMARK_GREAT = 70
const BENCHMARK_BAD = 30

export function analyzeNps(
  summary: NpsSummary | null,
  list: NpsResponseEntry[],
): NpsDiagnostic {
  const promoters = Number(summary?.promoters ?? 0)
  const passives = Number(summary?.passives ?? 0)
  const detractors = Number(summary?.detractors ?? 0)
  const responded = promoters + passives + detractors
  // summary.responses_count vem do RPC; fallback pra responded
  const respondedCount = Number(summary?.responses_count ?? responded)
  // Pendentes nao entram em responses_count · contamos da list
  const pending = list.filter((r) => (r.bucket ?? 'pending') === 'pending').length
  const totalResponses = respondedCount + pending
  const npsScore =
    summary?.nps != null
      ? Math.round(Number(summary.nps))
      : respondedCount > 0
        ? Math.round(((promoters - detractors) / respondedCount) * 100)
        : null

  const promoterPct = respondedCount > 0 ? Math.round((promoters / respondedCount) * 100) : 0
  const passivePct = respondedCount > 0 ? Math.round((passives / respondedCount) * 100) : 0
  const detractorPct =
    respondedCount > 0 ? Math.round((detractors / respondedCount) * 100) : 0

  // ─── Per partnership (heatmap) ────────────────────────────────────────
  const perPartnership = aggregatePerPartnership(list)

  // ─── Diagnostic + actions ──────────────────────────────────────────────
  if (totalResponses === 0) {
    return emptyDiagnostic({
      promoters,
      passives,
      detractors,
      pending,
      promoterPct,
      passivePct,
      detractorPct,
      responses: 0,
      responded: 0,
      nps: null,
      perPartnership,
    })
  }

  let status: NpsStatus = 'amber'
  let headline = ''
  let subtitle = ''

  if (npsScore == null) {
    status = 'neutral'
    headline = `${pending} convite(s) sem resposta ainda.`
    subtitle = 'Aguardando respostas pra calcular NPS · acompanhe a taxa de resposta.'
  } else if (npsScore >= BENCHMARK_GREAT) {
    status = 'green'
    headline = `NPS ${npsScore} · excelencia.`
    subtitle = `${promoterPct}% promotoras · acima do benchmark de mercado (${BENCHMARK_GREAT}+). Capitalize com depoimentos e indicacoes.`
  } else if (npsScore >= BENCHMARK_GOOD) {
    status = 'green'
    headline = `NPS ${npsScore} · bom.`
    subtitle = `${promoterPct}% promotoras · acima da media (${BENCHMARK_GOOD}+). Reduza detratoras pra alcancar excelencia.`
  } else if (npsScore >= BENCHMARK_BAD) {
    status = 'amber'
    headline = `NPS ${npsScore} · pode melhorar.`
    subtitle = `${detractorPct}% detratoras · benchmark de mercado e ${BENCHMARK_GOOD}+. Investigue comentarios negativos.`
  } else {
    status = 'red'
    headline = `NPS ${npsScore} · ruim · acao urgente.`
    subtitle = `${detractorPct}% detratoras · benchmark de mercado e ${BENCHMARK_GOOD}+. Foque em retencao e reativacao agora.`
  }

  // ─── Actions ───────────────────────────────────────────────────────────
  const actions: NpsAction[] = []

  // 1. Parcerias com muitas detratoras (priority 1 · risco)
  const detratorasPartnerships = perPartnership
    .filter((p) => p.detractors >= 1 && p.partnership_id)
    .sort((a, b) => b.detractors - a.detractors)
    .slice(0, 2)

  for (const p of detratorasPartnerships) {
    actions.push({
      priority: 1,
      title: `Reativar ${p.partnership_name}`,
      rationale:
        p.detractors === 1
          ? `1 detratora · ler comentario e abrir tarefa de followup.`
          : `${p.detractors} detratoras · sinal forte de risco.`,
      href: p.partnership_id ? `/partnerships/${p.partnership_id}` : '/b2b/saude',
    })
  }

  // 2. Capitalizar promotoras (priority 2 · upside)
  const promotorasPartnerships = perPartnership
    .filter((p) => p.promoters >= 2 && p.partnership_id)
    .sort((a, b) => b.promoters - a.promoters)
    .slice(0, 1)

  for (const p of promotorasPartnerships) {
    if (actions.length >= 3) break
    actions.push({
      priority: 2,
      title: `Pedir depoimento · ${p.partnership_name}`,
      rationale: `${p.promoters} promotora(s) · momento ideal pra coletar testemunho ou indicacao.`,
      href: p.partnership_id ? `/partnerships/${p.partnership_id}` : '/b2b/disparos',
    })
  }

  // 3. Taxa de resposta baixa (priority 3 · operacional)
  if (
    actions.length < 3 &&
    totalResponses > 0 &&
    pending > respondedCount &&
    pending >= 3
  ) {
    actions.push({
      priority: 3,
      title: 'Reforcar pesquisa NPS',
      rationale: `${pending} convite(s) sem resposta vs ${respondedCount} respondido(s) · revisar template e cadencia.`,
      href: '/b2b/disparos',
    })
  }

  // 4. Fallback · nada acionavel mas score baixo
  if (actions.length === 0 && npsScore != null && npsScore < BENCHMARK_GOOD) {
    actions.push({
      priority: 1,
      title: 'Investigar comentarios negativos',
      rationale: 'Filtre por detratoras na lista abaixo pra entender padroes.',
      href: '/b2b/nps?bucket=detractor',
    })
  }

  return {
    status,
    headline,
    subtitle,
    actions: actions.slice(0, 3),
    totals: {
      responses: totalResponses,
      responded: respondedCount,
      promoters,
      passives,
      detractors,
      pending,
      promoterPct,
      passivePct,
      detractorPct,
      nps: npsScore,
    },
    perPartnership,
  }
}

function emptyDiagnostic(totals: NpsDiagnostic['totals'] & { perPartnership?: NpsPerPartnership[] }): NpsDiagnostic {
  return {
    status: 'neutral',
    headline: 'Sem respostas de NPS ainda.',
    subtitle:
      'O cron envia pesquisa trimestral via WhatsApp pras parcerias ativas. Verifique se esta ligado.',
    actions: [
      {
        priority: 1,
        title: 'Verificar cron mira-nps-quarterly-dispatch',
        rationale:
          'Sem cron ativo, nenhuma pesquisa sai. Confirme em Configurações > Automação que o job esta ON.',
        href: '/configuracoes?tab=automacao',
      },
      {
        priority: 2,
        title: 'Revisar template do disparo',
        rationale: 'Confirme que o template de NPS esta cadastrado e habilitado.',
        href: '/b2b/disparos',
      },
      {
        priority: 3,
        title: 'Conferir saude das parcerias',
        rationale:
          'Pesquisa so dispara pra parcerias ativas. Se nao tem ativa, nao tem NPS.',
        href: '/b2b/saude',
      },
    ],
    totals: {
      responses: 0,
      responded: 0,
      promoters: 0,
      passives: 0,
      detractors: 0,
      pending: totals.pending ?? 0,
      promoterPct: 0,
      passivePct: 0,
      detractorPct: 0,
      nps: null,
    },
    perPartnership: totals.perPartnership ?? [],
  }
}

function aggregatePerPartnership(
  list: NpsResponseEntry[],
): NpsPerPartnership[] {
  const map = new Map<string, NpsPerPartnership>()
  for (const r of list) {
    const id = r.partnership_id ?? '__no_id'
    const name = r.partnership_name ?? '(parceria removida)'
    const key = id
    let cur = map.get(key)
    if (!cur) {
      cur = {
        partnership_id: r.partnership_id,
        partnership_name: name,
        total: 0,
        promoters: 0,
        passives: 0,
        detractors: 0,
        pending: 0,
        nps: null,
        responded: 0,
      }
      map.set(key, cur)
    }
    cur.total += 1
    const b: NpsBucket = (r.bucket ?? 'pending') as NpsBucket
    if (b === 'promoter') cur.promoters += 1
    else if (b === 'passive') cur.passives += 1
    else if (b === 'detractor') cur.detractors += 1
    else cur.pending += 1
    if (b !== 'pending') cur.responded += 1
  }
  // NPS por parceria
  for (const p of map.values()) {
    if (p.responded > 0) {
      p.nps = Math.round(((p.promoters - p.detractors) / p.responded) * 100)
    }
  }
  // Ordenar: criticas primeiro (detractors desc), depois NPS asc, depois alpha
  return Array.from(map.values()).sort((a, b) => {
    if (a.detractors !== b.detractors) return b.detractors - a.detractors
    if ((a.nps ?? 999) !== (b.nps ?? 999)) return (a.nps ?? 999) - (b.nps ?? 999)
    return a.partnership_name.localeCompare(b.partnership_name)
  })
}

/**
 * Tone do score NPS pra colorir cell · alinhado com benchmarks.
 */
export function npsTone(score: number | null): NpsStatus {
  if (score == null) return 'neutral'
  if (score >= BENCHMARK_GREAT) return 'green'
  if (score >= BENCHMARK_GOOD) return 'green'
  if (score >= BENCHMARK_BAD) return 'amber'
  return 'red'
}

export const NPS_BENCHMARKS = {
  good: BENCHMARK_GOOD,
  great: BENCHMARK_GREAT,
  bad: BENCHMARK_BAD,
}
