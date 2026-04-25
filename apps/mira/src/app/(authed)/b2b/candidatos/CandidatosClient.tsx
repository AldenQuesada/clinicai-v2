'use client'

/**
 * CandidatosClient · UI interativa da tab Candidatos (Geral · Scout).
 * Espelho 1:1 do `b2b-candidates.ui.js` (clinic-dashboard).
 *
 * Banner Scout · Summary · Filters · Stats · Lista priorizada (top DNA>=8 + resto)
 * Cada row tem score colorido, body com pills/meta/justification/fit/risks
 * e botões de acao contextuais (Aprovar/Abordar/Responder/Negociar/Promover/etc).
 *
 * Edge functions chamadas:
 *   - b2b-scout-scan (varredura)
 *   - b2b-candidate-evaluate (avaliar IA)
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@clinicai/supabase/browser'
import {
  scoreColor,
  candidateStatusLabel,
  CANDIDATE_STATUS_OPTIONS,
  SCOUT_CATEGORIES,
  fmtRelative,
} from '@/lib/b2b-ui-helpers'
import {
  setCandidateStatusAction,
  promoteCandidateAction,
} from './actions'
import { CandidateFormModal } from './CandidateFormModal'
import type {
  CandidateDTO,
  CandidateStatus,
  ConsumptionDTO,
  ScoutSummaryDTO,
} from '@clinicai/repositories'

interface Props {
  candidates: CandidateDTO[]
  consumption: ConsumptionDTO | null
  summary: ScoutSummaryDTO | null
  filterStatus: CandidateStatus | null
}

const TOOLTIP =
  'Scout = radar de leads. A IA procura parceiras potenciais dentro de categorias e raio geográfico, avalia cada uma contra o DNA da clínica (excelência, estética, propósito) e enfileira na Fila de Aprovação. Custo: ~R$ 0,08 por candidato avaliado.'

export function CandidatosClient(props: Props) {
  const { candidates, consumption, summary } = props
  const [showForm, setShowForm] = useState(false)
  const [scanCategory, setScanCategory] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  const enabled = !!consumption?.scout_enabled
  const consumed = Number(consumption?.total_brl || 0)
  const budget = Number(consumption?.budget_cap_brl || 100)
  const balance = Math.max(0, budget - consumed)
  const pct = Number(consumption?.pct_used || 0)
  const breakdown = consumption?.breakdown || {}
  const scans = breakdown.google_maps_scan?.count || 0
  const lastScan = consumption?.last_scan_at ? fmtRelative(consumption.last_scan_at) : null
  const capped = !!consumption?.capped

  // ─── Stats inline (acima da lista) ─────────────────────────────────
  const stats = useMemo(() => {
    if (!candidates.length) return null
    const byStatus: Record<string, number> = {}
    candidates.forEach((c) => {
      byStatus[c.contact_status] = (byStatus[c.contact_status] || 0) + 1
    })
    const total = candidates.length
    const parts: Array<{ label: string; n: number; bold?: boolean }> = [
      { label: 'candidatos', n: total, bold: true },
    ]
    const order: Array<[string, string]> = [
      ['new', 'novos'],
      ['approved', 'aprovados'],
      ['approached', 'abordados'],
      ['responded', 'responderam'],
      ['negotiating', 'negociando'],
      ['signed', 'fechados'],
    ]
    order.forEach(([k, lbl]) => {
      const n = byStatus[k] || 0
      if (n > 0) parts.push({ label: lbl, n })
    })
    const withScore = candidates.filter((c) => c.dna_score != null)
    let avgScore: string | null = null
    if (withScore.length) {
      const sum = withScore.reduce((acc, c) => acc + Number(c.dna_score || 0), 0)
      avgScore = (sum / withScore.length).toFixed(1)
    }
    return { parts, avgScore }
  }, [candidates])

  // ─── Priority bucket: top 3 com DNA>=8 + resto ─────────────────────
  const { priority, rest } = useMemo(() => {
    if (props.filterStatus) return { priority: [] as CandidateDTO[], rest: candidates }
    const pri = candidates
      .filter(
        (c) =>
          ['new', 'approved'].includes(c.contact_status) &&
          c.dna_score != null &&
          Number(c.dna_score) >= 8,
      )
      .slice(0, 3)
    const priIds = new Set(pri.map((c) => c.id))
    const rst = candidates.filter((c) => !priIds.has(c.id))
    return { priority: pri, rest: rst }
  }, [candidates, props.filterStatus])

  function refresh() {
    router.refresh()
  }

  function onFilterChange(value: string) {
    const params = new URLSearchParams(window.location.search)
    if (value) params.set('status', value)
    else params.delete('status')
    router.push(`/b2b/candidatos${params.toString() ? `?${params}` : ''}`)
  }

  async function onScan() {
    if (!scanCategory) {
      alert('Escolha uma categoria')
      return
    }
    const ok = window.confirm(
      `Disparar varredura da categoria "${scanCategory}"?\n\nCusto estimado: R$ 1,60 (Google Maps + ~15 candidatos × Claude).\nTempo: 30-90 segundos.`,
    )
    if (!ok) return

    setBusy('scan')
    try {
      const supabase = createBrowserClient()
      const { data, error } = await supabase.functions.invoke('b2b-scout-scan', {
        body: { category: scanCategory, limit: 15 },
      })
      if (error || !data?.ok) {
        alert(`Falha: ${error?.message || data?.error || 'desconhecida'}`)
        return
      }
      alert(
        `Varredura concluída · ${data.results} encontrados\n${data.created} candidatos criados · ${data.failed} falhas · R$ ${data.total_cost_brl}`,
      )
      refresh()
    } catch (e) {
      alert(`Erro: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  async function onEvaluate(id: string) {
    const ok = window.confirm('Avaliar DNA com IA?\n\nSó Claude, sem varredura. Custo: R$ 0,08.')
    if (!ok) return

    setBusy(`eval-${id}`)
    try {
      const supabase = createBrowserClient()
      const { data, error } = await supabase.functions.invoke('b2b-candidate-evaluate', {
        body: { candidate_id: id },
      })
      if (error || !data?.ok) {
        alert(`Falha: ${error?.message || data?.error || 'desconhecida'}`)
        return
      }
      refresh()
    } catch (e) {
      alert(`Erro: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }

  function onAction(id: string, action: CandidateStatus) {
    let notes: string | null = null
    if (action === 'declined' || action === 'archived') {
      notes = window.prompt('Motivo (opcional):') || null
      if (notes === '') notes = null
    }
    startTransition(async () => {
      const r = await setCandidateStatusAction(id, action, notes)
      if (!r.ok) alert(`Erro: ${r.error || 'falha'}`)
      else refresh()
    })
  }

  function onPromote(id: string) {
    const ok = window.confirm(
      'Promover a parceria?\n\nCria parceria nova no status "prospect" (precisa validar DNA depois).',
    )
    if (!ok) return
    startTransition(async () => {
      const r = await promoteCandidateAction(id)
      if (!r.ok) alert(`Erro: ${r.error || 'falha'}`)
      else {
        alert('Candidato promovido a parceria (prospect)')
        refresh()
      }
    })
  }

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <>
      {/* Banner Scout */}
      <div className="b2b-scout-banner">
        <div className="b2b-scout-banner-txt">
          {!enabled ? (
            <>
              <strong style={{ color: '#EF4444' }}>Scout desligado</strong>{' '}
              <span className="b2b-help-icon" title={TOOLTIP}>?</span>{' '}
              · ative no toggle do topo pra buscar candidatos.
            </>
          ) : capped ? (
            <>
              <strong style={{ color: '#EF4444' }}>Budget cap atingido</strong>{' '}
              <span className="b2b-help-icon" title={TOOLTIP}>?</span>{' '}
              · pausado até próximo mês.
            </>
          ) : (
            <>
              <strong style={{ color: '#10B981' }}>Scout ativo</strong>{' '}
              <span className="b2b-help-icon" title={TOOLTIP}>?</span>
            </>
          )}
          {enabled && (
            <div className="b2b-scout-stats">
              <span>
                {scans} varredura{scans === 1 ? '' : 's'}
              </span>
              <span>R$ {consumed.toFixed(2)} usados</span>
              <span>R$ {balance.toFixed(2)} saldo</span>
              <span>{pct}% do cap</span>
              {lastScan && <span>últ. {lastScan}</span>}
            </div>
          )}
        </div>
        <div className="b2b-scout-scan">
          <button
            type="button"
            className="b2b-btn"
            title="Adicionar candidato por indicação"
            onClick={() => setShowForm(true)}
          >
            + Adicionar
          </button>
          {enabled && !capped && (
            <>
              <select
                className="b2b-input"
                style={{ maxWidth: '240px' }}
                value={scanCategory}
                onChange={(e) => setScanCategory(e.target.value)}
              >
                <option value="">Escolher categoria…</option>
                {SCOUT_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    T{cat.tier} · {cat.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="b2b-btn b2b-btn-primary"
                onClick={onScan}
                disabled={busy === 'scan'}
              >
                {busy === 'scan' ? 'Varrendo…' : 'Varrer'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scout summary mini-dashboard */}
      {summary && summary.ok && (summary.candidates_30d > 0 || summary.converted_30d > 0) && (
        <div className="b2b-scout-summary">
          <div className="b2b-scout-summary-card">
            <div className="b2b-scout-summary-num">{summary.candidates_30d || 0}</div>
            <div className="b2b-scout-summary-lbl">Candidatos · 30d</div>
          </div>
          <div className="b2b-scout-summary-card">
            <div className="b2b-scout-summary-num">{summary.converted_30d || 0}</div>
            <div className="b2b-scout-summary-lbl">Convertidos em parceria</div>
          </div>
          <div className="b2b-scout-summary-card">
            <div className="b2b-scout-summary-num">
              {summary.conversion_rate_pct != null
                ? Number(summary.conversion_rate_pct).toFixed(1)
                : '0.0'}
              %
            </div>
            <div className="b2b-scout-summary-lbl">Taxa de conversão</div>
          </div>
          <div className="b2b-scout-summary-card">
            <div className="b2b-scout-summary-num">
              R$ {summary.cost_brl_30d != null ? Number(summary.cost_brl_30d).toFixed(2) : '0.00'}
            </div>
            <div className="b2b-scout-summary-lbl">Custo nos 30d</div>
          </div>
          {summary.top_category && (
            <div className="b2b-scout-summary-meta">
              Top categoria: <strong>{summary.top_category}</strong>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="b2b-cand-filters">
        <label className="b2b-field" style={{ margin: 0 }}>
          <span className="b2b-field-lbl">Status</span>
          <select
            className="b2b-input"
            style={{ minWidth: '160px' }}
            value={props.filterStatus || ''}
            onChange={(e) => onFilterChange(e.target.value)}
          >
            <option value="">Todos</option>
            {CANDIDATE_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Stats inline */}
      {stats && (
        <div className="b2b-cand-stats">
          {stats.parts.map((p, i) => (
            <span key={i}>
              {p.bold ? <strong>{p.n}</strong> : p.n} {p.label}
            </span>
          ))}
          {stats.avgScore && (
            <span>
              score médio <strong>{stats.avgScore}</strong>
            </span>
          )}
        </div>
      )}

      {/* Lista priorizada + resto */}
      {candidates.length === 0 ? (
        <div className="b2b-empty">
          Nenhum candidato ainda. Ative o scout e dispare uma varredura.
        </div>
      ) : (
        <>
          {priority.length > 0 && (
            <div className="b2b-cand-priority">
              <div className="b2b-cand-priority-hdr">
                Abordar hoje · top {priority.length} com DNA ≥ 8
              </div>
              <div className="b2b-cand-list">
                {priority.map((c) => (
                  <CandidateRow
                    key={c.id}
                    cand={c}
                    busy={busy}
                    pending={pending}
                    onAction={onAction}
                    onPromote={onPromote}
                    onEvaluate={onEvaluate}
                  />
                ))}
              </div>
            </div>
          )}
          {rest.length > 0 && (
            <>
              {priority.length > 0 && <div className="b2b-cand-rest-hdr">Demais candidatos</div>}
              <div className="b2b-cand-list">
                {rest.map((c) => (
                  <CandidateRow
                    key={c.id}
                    cand={c}
                    busy={busy}
                    pending={pending}
                    onAction={onAction}
                    onPromote={onPromote}
                    onEvaluate={onEvaluate}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Modal manual form */}
      {showForm && <CandidateFormModal onClose={() => setShowForm(false)} onAdded={refresh} />}
    </>
  )
}

function CandidateRow({
  cand,
  busy,
  pending,
  onAction,
  onPromote,
  onEvaluate,
}: {
  cand: CandidateDTO
  busy: string | null
  pending: boolean
  onAction: (id: string, status: CandidateStatus) => void
  onPromote: (id: string) => void
  onEvaluate: (id: string) => void
}) {
  const score = cand.dna_score != null ? Number(cand.dna_score).toFixed(1) : '—'
  const color = scoreColor(cand.dna_score)
  const isEvaluating = busy === `eval-${cand.id}`
  const disabled = pending || isEvaluating

  return (
    <div className="b2b-cand-row">
      <div className="b2b-cand-score" style={{ color }}>
        {score}
      </div>
      <div className="b2b-cand-body">
        <div className="b2b-cand-top">
          <strong>{cand.name}</strong>
          <span className="b2b-pill">{candidateStatusLabel(cand.contact_status)}</span>
          {cand.tier_target && (
            <span className="b2b-pill b2b-pill-tier">T{cand.tier_target}</span>
          )}
          <span className="b2b-pill">{cand.category}</span>
        </div>
        <div className="b2b-cand-meta">
          {cand.address && <span>{cand.address}</span>}
          {cand.phone && <span>{cand.phone}</span>}
          {cand.instagram_handle && <span>IG: {cand.instagram_handle}</span>}
          {cand.google_rating && (
            <span>
              ★ {cand.google_rating} ({cand.google_reviews || 0})
            </span>
          )}
        </div>
        {cand.dna_justification && <div className="b2b-cand-just">{cand.dna_justification}</div>}
        {cand.fit_reasons && cand.fit_reasons.length > 0 && (
          <div className="b2b-cand-reasons">
            <strong>Fit:</strong> {cand.fit_reasons.join(' · ')}
          </div>
        )}
        {cand.risk_flags && cand.risk_flags.length > 0 && (
          <div className="b2b-cand-risks">
            <strong>Riscos:</strong> {cand.risk_flags.join(' · ')}
          </div>
        )}
      </div>
      <div className="b2b-cand-actions">
        {cand.dna_score == null && (
          <button
            className="b2b-btn"
            disabled={disabled}
            title="Avaliar DNA com IA (custo R$ 0,08)"
            onClick={() => onEvaluate(cand.id)}
          >
            {isEvaluating ? 'Avaliando…' : 'Avaliar IA'}
          </button>
        )}
        {cand.contact_status === 'new' && (
          <button className="b2b-btn" disabled={disabled} onClick={() => onAction(cand.id, 'approved')}>
            Aprovar
          </button>
        )}
        {(cand.contact_status === 'approved' || cand.contact_status === 'new') && (
          <button className="b2b-btn" disabled={disabled} onClick={() => onAction(cand.id, 'approached')}>
            Abordar
          </button>
        )}
        {cand.contact_status === 'approached' && (
          <button className="b2b-btn" disabled={disabled} onClick={() => onAction(cand.id, 'responded')}>
            Respondeu
          </button>
        )}
        {(cand.contact_status === 'approached' || cand.contact_status === 'responded') && (
          <button className="b2b-btn" disabled={disabled} onClick={() => onAction(cand.id, 'negotiating')}>
            Negociando
          </button>
        )}
        {(cand.contact_status === 'negotiating' || cand.contact_status === 'responded') && (
          <button
            className="b2b-btn b2b-btn-primary"
            disabled={disabled}
            onClick={() => onPromote(cand.id)}
          >
            Promover
          </button>
        )}
        {['new', 'approved', 'approached', 'responded', 'negotiating'].includes(
          cand.contact_status,
        ) && (
          <button className="b2b-btn" disabled={disabled} onClick={() => onAction(cand.id, 'declined')}>
            Recusou
          </button>
        )}
        <button className="b2b-btn" disabled={disabled} onClick={() => onAction(cand.id, 'archived')}>
          Arquivar
        </button>
      </div>
    </div>
  )
}
