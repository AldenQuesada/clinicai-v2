/**
 * /semana/gaps · REPLICA 1:1 do `b2b-suggestions.ui.js` (tab Gaps).
 *
 * Strings, classes CSS (.b2b-sug-*), agrupamento e thresholds identicos
 * ao original. RPC b2b_suggestions_snapshot retorna 24 categorias do
 * plano com state (red/yellow/green) baseado em parcerias + candidatos.
 */

import Link from 'next/link'
import { loadMiraServerContext } from '@/lib/server-context'
import type { SuggestionCategory } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

const COLORS = {
  red: { hex: '#EF4444', label: 'Vazio', desc: 'Sem parceria nem candidato' },
  yellow: { hex: '#F59E0B', label: 'Em triagem', desc: 'Tem candidatos, sem parceria' },
  green: { hex: '#10B981', label: 'Coberto', desc: 'Já tem parceria ativa' },
} as const

const PILLAR_LABELS: Record<string, string> = {
  imagem: 'Imagem',
  evento: 'Evento',
  institucional: 'Institucional',
  fitness: 'Fitness',
  alimentacao: 'Alimentação',
  saude: 'Saúde',
  status: 'Status',
  rede: 'Rede',
  outros: 'Outros',
}

function pillarLabel(p: string): string {
  return PILLAR_LABELS[p] || p
}

const TIER_LABELS: Record<number, string> = {
  1: 'Tier 1 — abrir agora',
  2: 'Tier 2 — 60-90 dias',
  3: 'Tier 3 — latente',
}

export default async function GapsPage() {
  const { repos } = await loadMiraServerContext()
  const snap = await repos.b2bSuggestions.snapshot()
  const cats = snap.categories
  const generatedAt = snap.generatedAt
    ? new Date(snap.generatedAt).toLocaleString('pt-BR')
    : '—'

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div className="b2b-sug-head">
          <div>
            <div className="b2b-list-count">
              Cobertura do plano · {cats.length} categorias
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--b2b-text-muted)',
                marginTop: '2px',
              }}
            >
              Última leitura: {generatedAt}
            </div>
          </div>
          <Link href="/semana/gaps" className="b2b-btn">
            Atualizar
          </Link>
        </div>

        {cats.length === 0 ? (
          <div className="b2b-empty">Sem dados.</div>
        ) : (
          <Body cats={cats} />
        )}
      </div>
    </main>
  )
}

function Body({ cats }: { cats: SuggestionCategory[] }) {
  const counts = { green: 0, yellow: 0, red: 0 } as Record<string, number>
  cats.forEach((c) => {
    counts[c.state] = (counts[c.state] || 0) + 1
  })

  const topReds = [...cats]
    .filter((c) => c.state === 'red')
    .sort((a, b) => {
      if (a.tier !== b.tier) return (a.tier || 99) - (b.tier || 99)
      return (b.priority || 0) - (a.priority || 0)
    })
    .slice(0, 3)

  const byPillar: Record<string, { total: number; green: number; yellow: number; red: number }> = {}
  cats.forEach((c) => {
    const k = c.pillar || 'outros'
    if (!byPillar[k]) byPillar[k] = { total: 0, green: 0, yellow: 0, red: 0 }
    byPillar[k].total++
    byPillar[k][c.state] = (byPillar[k][c.state] || 0) + 1
  })
  const pillarKeys = Object.keys(byPillar).sort((a, b) => byPillar[b].total - byPillar[a].total)

  return (
    <>
      {/* Counters */}
      <div className="b2b-sug-counters">
        {(['green', 'yellow', 'red'] as const).map((k) => {
          const c = COLORS[k]
          return (
            <div
              key={k}
              className="b2b-sug-kpi"
              style={{ borderLeft: `3px solid ${c.hex}` }}
            >
              <div className="b2b-sug-kpi-n" style={{ color: c.hex }}>
                {counts[k] || 0}
              </div>
              <div className="b2b-sug-kpi-l">{c.label}</div>
              <div className="b2b-sug-kpi-d">{c.desc}</div>
            </div>
          )
        })}
        <div className="b2b-sug-kpi">
          <div className="b2b-sug-kpi-n">{cats.length}</div>
          <div className="b2b-sug-kpi-l">Total do plano</div>
          <div className="b2b-sug-kpi-d">24 categorias priorizadas</div>
        </div>
      </div>

      {/* Top Gaps */}
      {topReds.length > 0 && (
        <div className="b2b-sug-toplist">
          <div className="b2b-sug-toplist-hdr">
            Abordar primeiro · 3 categorias prioritárias
          </div>
          <div className="b2b-sug-toplist-grid">
            {topReds.map((c) => (
              <div key={c.slug} className="b2b-sug-top-card">
                <div className="b2b-sug-top-pill">
                  T{c.tier} · {pillarLabel(c.pillar)}
                </div>
                <div className="b2b-sug-top-name">{c.label}</div>
                {c.notes && <div className="b2b-sug-top-notes">{c.notes}</div>}
                <div className="b2b-sug-top-acts">
                  <Link href="/b2b/candidatos" className="b2b-btn">
                    + Manual
                  </Link>
                  <button
                    type="button"
                    className="b2b-btn b2b-btn-primary"
                    disabled
                    title="Scout · em breve"
                  >
                    Varrer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cobertura por pilar */}
      <div className="b2b-sug-pillars">
        <div className="b2b-sug-pillars-hdr">Cobertura por pilar</div>
        <div className="b2b-sug-pillars-grid">
          {pillarKeys.map((k) => {
            const p = byPillar[k]
            const coveredPct = p.total > 0 ? Math.round(((p.green || 0) / p.total) * 100) : 0
            const color =
              coveredPct >= 66 ? '#10B981' : coveredPct >= 33 ? '#F59E0B' : '#EF4444'
            return (
              <div key={k} className="b2b-sug-pillar-card">
                <div className="b2b-sug-pillar-top">
                  <strong>{pillarLabel(k)}</strong>
                  <span style={{ color }}>{coveredPct}%</span>
                </div>
                <div className="b2b-sug-pillar-bar">
                  <div style={{ width: `${coveredPct}%`, background: color }} />
                </div>
                <div className="b2b-sug-pillar-meta">
                  {p.green || 0} cobertas · {(p.yellow || 0) + (p.red || 0)} em aberto · {p.total} total
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tier 1 / 2 / 3 */}
      {[1, 2, 3].map((tier) => (
        <TierBlock key={tier} tier={tier} cats={cats} />
      ))}
    </>
  )
}

function TierBlock({ tier, cats }: { tier: number; cats: SuggestionCategory[] }) {
  const tierCats = cats
    .filter((c) => c.tier === tier)
    .sort((a, b) => {
      const order: Record<string, number> = { red: 0, yellow: 1, green: 2 }
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state]
      return b.priority - a.priority
    })
  if (!tierCats.length) return null

  return (
    <div className="b2b-sug-tier">
      <div className="b2b-sug-tier-hdr">
        {TIER_LABELS[tier]} · {tierCats.length}
      </div>
      {tierCats.map((c) => (
        <SugRow key={c.slug} cat={c} />
      ))}
    </div>
  )
}

function SugRow({ cat }: { cat: SuggestionCategory }) {
  const color = COLORS[cat.state] || COLORS.red
  const score = cat.bestCandidateScore != null ? cat.bestCandidateScore.toFixed(1) : null

  return (
    <div className="b2b-sug-row">
      <span className="b2b-sug-dot" style={{ background: color.hex }} />
      <div className="b2b-sug-body">
        <div className="b2b-sug-top">
          <strong>{cat.label}</strong>
          <span className="b2b-pill b2b-pill-tier">T{cat.tier}</span>
          <span className="b2b-pill">{pillarLabel(cat.pillar)}</span>
        </div>
        <div className="b2b-sug-meta">
          {cat.notes || ''}
          {score && <> · melhor candidato DNA {score}</>}
        </div>
      </div>
      <div className="b2b-sug-acts">
        {cat.state === 'red' && (
          <>
            <Link href="/b2b/candidatos" className="b2b-btn">
              + Manual
            </Link>
            <button
              type="button"
              className="b2b-btn b2b-btn-primary"
              disabled
              title="Scout · em breve"
            >
              Varrer
            </button>
          </>
        )}
        {cat.state === 'yellow' && (
          <Link href="/b2b/candidatos" className="b2b-btn">
            Triar ({cat.openCandidates})
          </Link>
        )}
        {cat.state === 'green' && (
          <span className="b2b-sug-ok">{cat.activePartnerships} parc.</span>
        )}
      </div>
    </div>
  )
}
