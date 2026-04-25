/**
 * /b2b/saude · REPLICA 1:1 do `b2b-health.ui.js` (tab Saúde).
 *
 * 4 KPIs (verde/amarelo/vermelho/sem dado) + lista crítica agrupada
 * (vermelhas e amarelas) + botão "Recalcular" via server action.
 */

import Link from 'next/link'
import { loadMiraServerContext } from '@/lib/server-context'
import { SaudeRecalcButton } from './SaudeClient'
import type { HealthSnapshot } from '@clinicai/repositories'

export const dynamic = 'force-dynamic'

const COLORS = {
  green: { hex: '#10B981', label: 'Verde', desc: 'Operando bem' },
  yellow: { hex: '#F59E0B', label: 'Amarelo', desc: 'Atenção' },
  red: { hex: '#EF4444', label: 'Vermelho', desc: 'Crítico' },
  unknown: { hex: '#9CA3AF', label: 'Sem dado', desc: 'Pausado/sem info' },
} as const

type ColorKey = keyof typeof COLORS

export default async function SaudePage() {
  const { repos } = await loadMiraServerContext()

  let snap: HealthSnapshot | null = null
  let error: string | null = null
  try {
    snap = await repos.b2bHealth.snapshot()
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        {error ? (
          <div className="b2b-empty b2b-empty-err">Erro: {error}</div>
        ) : !snap ? (
          <div className="b2b-empty">Sem dados.</div>
        ) : (
          <Body snap={snap} />
        )}
      </div>
    </main>
  )
}

function Body({ snap }: { snap: HealthSnapshot }) {
  const generated = snap.generated_at
    ? new Date(snap.generated_at).toLocaleString('pt-BR')
    : '—'
  const counts = snap.counts || { green: 0, yellow: 0, red: 0, unknown: 0 }
  const critical = snap.critical || []
  const red = critical.filter((p) => p.health_color === 'red')
  const yellow = critical.filter((p) => p.health_color === 'yellow')

  return (
    <>
      <div className="b2b-health-head">
        <div>
          <div className="b2b-list-count">
            Saúde do programa · {snap.total_active || 0} ativas
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--b2b-text-muted)',
              marginTop: '2px',
            }}
          >
            Última leitura: {generated}
          </div>
        </div>
        <SaudeRecalcButton />
      </div>

      <div className="b2b-health-counters">
        <CounterCard color="green" count={counts.green || 0} />
        <CounterCard color="yellow" count={counts.yellow || 0} />
        <CounterCard color="red" count={counts.red || 0} />
        <CounterCard color="unknown" count={counts.unknown || 0} small />
      </div>

      {critical.length === 0 ? (
        <div className="b2b-empty">
          Nenhuma parceria em atenção no momento. Todas verdes.
        </div>
      ) : (
        <>
          {red.length > 0 && (
            <div className="b2b-hgroup">
              <div className="b2b-hgroup-hdr" style={{ color: COLORS.red.hex }}>
                {red.length} vermelhas · ação imediata
              </div>
              {red.map((p) => (
                <CritRow key={p.id} p={p} />
              ))}
            </div>
          )}
          {yellow.length > 0 && (
            <div className="b2b-hgroup">
              <div className="b2b-hgroup-hdr" style={{ color: COLORS.yellow.hex }}>
                {yellow.length} amarelas · atenção
              </div>
              {yellow.map((p) => (
                <CritRow key={p.id} p={p} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}

function CounterCard({
  color,
  count,
  small,
}: {
  color: ColorKey
  count: number
  small?: boolean
}) {
  const c = COLORS[color]
  return (
    <div
      className={`b2b-hcard ${small ? 'b2b-hcard-small' : ''}`}
      style={{ borderLeft: `4px solid ${c.hex}` }}
    >
      <div className="b2b-hcard-count" style={{ color: c.hex }}>
        {count}
      </div>
      <div className="b2b-hcard-lbl">{c.label}</div>
      <div className="b2b-hcard-desc">{c.desc}</div>
    </div>
  )
}

function CritRow({ p }: { p: HealthSnapshot['critical'][number] }) {
  const c = COLORS[p.health_color] || COLORS.unknown
  return (
    <Link href={`/partnerships/${p.id}`} className="b2b-hrow">
      <span className="b2b-hrow-dot" style={{ background: c.hex }} />
      <div className="b2b-hrow-body">
        <div className="b2b-hrow-top">
          <strong>{p.name}</strong>
          {p.tier && <span className="b2b-pill b2b-pill-tier">T{p.tier}</span>}
          <span className="b2b-pill">{p.pillar || 'outros'}</span>
          <span className="b2b-pill">{p.status}</span>
        </div>
        <div className="b2b-hrow-meta">
          {p.dna_score != null ? `DNA ${Number(p.dna_score).toFixed(1)}` : 'DNA —'}
          {p.contact_name && ` · ${p.contact_name}`}
          {p.contact_phone && ` · ${p.contact_phone}`}
        </div>
      </div>
      <span className="b2b-hrow-arrow">→</span>
    </Link>
  )
}
