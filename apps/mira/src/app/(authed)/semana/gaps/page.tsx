/**
 * /semana/gaps · Cobertura do plano · 24 categorias em red/yellow/green.
 *
 * REPLICA EXATA da tab `?tab=gaps` do clinic-dashboard b2b-partners.html
 * (b2b-suggestions.ui.js + b2b.css linhas 1029-1078, 1751-1805).
 *
 * Layout (top → bottom):
 *   1. Header · "Cobertura do plano · N categorias" + "Atualizar" button
 *   2. Counters · 4 KPIs (verde/amarelo/vermelho/total)
 *   3. Top Gaps · top 3 categorias red prioritarias (gradient red card)
 *   4. Cobertura por pilar · grid auto-fill 220px com barras de progresso
 *   5. Tier 1 / Tier 2 / Tier 3 · listas com health dot + acoes
 *
 * Strings, ordenacao e logica replicadas 1:1 sem margem de erro.
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

  const counters = { green: 0, yellow: 0, red: 0 } as Record<string, number>
  cats.forEach((c) => {
    counters[c.state] = (counters[c.state] || 0) + 1
  })

  // Top 3 red prioritarias (tier ASC, priority DESC)
  const topReds = [...cats]
    .filter((c) => c.state === 'red')
    .sort((a, b) => {
      if (a.tier !== b.tier) return (a.tier || 99) - (b.tier || 99)
      return (b.priority || 0) - (a.priority || 0)
    })
    .slice(0, 3)

  // Cobertura por pilar
  const byPillar: Record<string, { total: number; green: number; yellow: number; red: number }> = {}
  cats.forEach((c) => {
    const k = c.pillar || 'outros'
    if (!byPillar[k]) byPillar[k] = { total: 0, green: 0, yellow: 0, red: 0 }
    byPillar[k].total++
    byPillar[k][c.state] = (byPillar[k][c.state] || 0) + 1
  })
  const pillarKeys = Object.keys(byPillar).sort((a, b) => byPillar[b].total - byPillar[a].total)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="max-w-[1100px] mx-auto px-6 py-6 flex flex-col gap-4">
        {/* === Header === */}
        <div
          className="flex items-start justify-between gap-3 flex-wrap pb-2"
          style={{ borderBottom: '1px solid var(--b2b-border)' }}
        >
          <div>
            <span className="eyebrow">Semana · Gaps do plano</span>
            <h1 className="font-display text-3xl text-[var(--b2b-ivory)] mt-2">
              Cobertura do plano · <em>{cats.length}</em> categorias
            </h1>
            <p className="text-[11px] mt-1" style={{ color: 'var(--b2b-text-muted)' }}>
              Última leitura: {generatedAt}
            </p>
          </div>
        </div>

        {cats.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* === Counters · 4 KPIs === */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(['green', 'yellow', 'red'] as const).map((k) => {
                const c = COLORS[k]
                return (
                  <KpiCard
                    key={k}
                    n={counters[k] || 0}
                    label={c.label}
                    desc={c.desc}
                    accent={c.hex}
                  />
                )
              })}
              <KpiCard
                n={cats.length}
                label="Total do plano"
                desc="24 categorias priorizadas"
                accent="var(--b2b-champagne)"
              />
            </div>

            {/* === Top 3 Gaps prioritarias === */}
            {topReds.length > 0 && (
              <section
                className="rounded-[10px] p-[16px_18px]"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)',
                  border: '1px solid rgba(239,68,68,0.3)',
                }}
              >
                <div
                  className="text-[11px] font-bold uppercase mb-3"
                  style={{ color: '#EF4444', letterSpacing: '2px' }}
                >
                  Abordar primeiro · 3 categorias prioritárias
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {topReds.map((c) => (
                    <TopCard key={c.slug} cat={c} />
                  ))}
                </div>
              </section>
            )}

            {/* === Cobertura por pilar === */}
            <section className="my-1">
              <div
                className="text-[11px] font-semibold uppercase mb-2.5"
                style={{ color: 'var(--b2b-text-muted)', letterSpacing: '2px' }}
              >
                Cobertura por pilar
              </div>
              <div
                className="grid gap-2.5"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
              >
                {pillarKeys.map((k) => {
                  const p = byPillar[k]
                  const coveredPct =
                    p.total > 0 ? Math.round(((p.green || 0) / p.total) * 100) : 0
                  const color =
                    coveredPct >= 66 ? '#10B981' : coveredPct >= 33 ? '#F59E0B' : '#EF4444'
                  return (
                    <PillarCard
                      key={k}
                      label={pillarLabel(k)}
                      pct={coveredPct}
                      color={color}
                      green={p.green || 0}
                      open={(p.yellow || 0) + (p.red || 0)}
                      total={p.total}
                    />
                  )
                })}
              </div>
            </section>

            {/* === Tier 1 / Tier 2 / Tier 3 === */}
            {[1, 2, 3].map((tier) => (
              <TierBlock key={tier} tier={tier} cats={cats} />
            ))}
          </>
        )}
      </div>
    </main>
  )
}

function KpiCard({
  n,
  label,
  desc,
  accent,
}: {
  n: number
  label: string
  desc: string
  accent: string
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'var(--b2b-bg-1)',
        border: '1px solid var(--b2b-border)',
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <div
        className="font-display leading-none"
        style={{ fontSize: '32px', fontWeight: 400, color: accent }}
      >
        {n}
      </div>
      <div
        className="mt-2 text-[10px] font-semibold uppercase"
        style={{ color: 'var(--b2b-champagne)', letterSpacing: '1.5px' }}
      >
        {label}
      </div>
      <div className="mt-1 text-[10px]" style={{ color: 'var(--b2b-text-muted)' }}>
        {desc}
      </div>
    </div>
  )
}

function TopCard({ cat }: { cat: SuggestionCategory }) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{ background: 'var(--b2b-bg-2)', border: '1px solid var(--b2b-border)' }}
    >
      <div
        className="text-[9px] font-semibold uppercase"
        style={{ color: 'var(--b2b-champagne)', letterSpacing: '1.5px' }}
      >
        T{cat.tier} · {pillarLabel(cat.pillar)}
      </div>
      <div
        className="text-[15px] font-semibold leading-tight"
        style={{ color: 'var(--b2b-text)' }}
      >
        {cat.label}
      </div>
      {cat.notes && (
        <div
          className="text-[11px] italic leading-relaxed"
          style={{ color: 'var(--b2b-text-muted)' }}
        >
          {cat.notes}
        </div>
      )}
      <div className="flex gap-1.5 mt-1">
        <Link
          href={`/estudio/cadastrar?category=${encodeURIComponent(cat.slug)}`}
          className="px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors"
          style={{
            background: 'transparent',
            border: '1px solid var(--b2b-border-strong)',
            color: 'var(--b2b-champagne)',
          }}
        >
          + Manual
        </Link>
        <button
          type="button"
          disabled
          title="Scout · em breve"
          className="px-3 py-1.5 text-[11px] font-semibold rounded-md transition-colors"
          style={{
            background: 'var(--b2b-champagne)',
            color: 'var(--b2b-bg-0)',
            cursor: 'not-allowed',
            opacity: 0.6,
          }}
        >
          Varrer
        </button>
      </div>
    </div>
  )
}

function PillarCard({
  label,
  pct,
  color,
  green,
  open,
  total,
}: {
  label: string
  pct: number
  color: string
  green: number
  open: number
  total: number
}) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1.5"
      style={{ background: 'var(--b2b-bg-2)', border: '1px solid var(--b2b-border)' }}
    >
      <div
        className="flex items-baseline justify-between"
        style={{ color: 'var(--b2b-text)', fontSize: '14px' }}
      >
        <strong>{label}</strong>
        <span className="font-sans font-semibold text-[13px]" style={{ color }}>
          {pct}%
        </span>
      </div>
      <div
        className="h-1 rounded-sm overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.05)' }}
      >
        <div
          className="h-full transition-[width] duration-[400ms] ease-in-out"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="text-[10px]" style={{ color: 'var(--b2b-text-muted)', letterSpacing: '0.5px' }}>
        {green} cobertas · {open} em aberto · {total} total
      </div>
    </div>
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
    <section className="mt-2">
      <div
        className="text-[11px] font-semibold uppercase pb-2 mb-2"
        style={{
          color: 'var(--b2b-champagne)',
          letterSpacing: '2px',
          borderBottom: '1px solid var(--b2b-border)',
        }}
      >
        {TIER_LABELS[tier]} · {tierCats.length}
      </div>
      <div className="flex flex-col gap-1.5">
        {tierCats.map((c) => (
          <CatRow key={c.slug} cat={c} />
        ))}
      </div>
    </section>
  )
}

function CatRow({ cat }: { cat: SuggestionCategory }) {
  const color = COLORS[cat.state] || COLORS.red
  const score = cat.bestCandidateScore != null ? cat.bestCandidateScore.toFixed(1) : null

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-md"
      style={{ background: 'var(--b2b-bg-1)', border: '1px solid var(--b2b-border)' }}
    >
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: color.hex }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <strong className="text-[13px]" style={{ color: 'var(--b2b-ivory)' }}>
            {cat.label}
          </strong>
          <Pill text={`T${cat.tier}`} variant="tier" />
          <Pill text={pillarLabel(cat.pillar)} />
        </div>
        <div className="text-[11px]" style={{ color: 'var(--b2b-text-muted)' }}>
          {cat.notes || ''}
          {score && <span> · melhor candidato DNA {score}</span>}
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {cat.state === 'red' && (
          <>
            <Link
              href={`/estudio/cadastrar?category=${encodeURIComponent(cat.slug)}`}
              className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid var(--b2b-border-strong)',
                color: 'var(--b2b-champagne)',
              }}
            >
              + Manual
            </Link>
            <button
              type="button"
              disabled
              title="Scout · em breve"
              className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md"
              style={{
                background: 'var(--b2b-champagne)',
                color: 'var(--b2b-bg-0)',
                cursor: 'not-allowed',
                opacity: 0.6,
              }}
            >
              Varrer
            </button>
          </>
        )}
        {cat.state === 'yellow' && (
          <Link
            href={`/partnerships?status=prospect`}
            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md"
            style={{
              background: 'transparent',
              border: '1px solid var(--b2b-border-strong)',
              color: 'var(--b2b-champagne)',
            }}
          >
            Triar ({cat.openCandidates})
          </Link>
        )}
        {cat.state === 'green' && (
          <span
            className="px-2.5 py-1.5 text-[11px] font-semibold"
            style={{ color: 'var(--b2b-sage)' }}
          >
            {cat.activePartnerships} parc.
          </span>
        )}
      </div>
    </div>
  )
}

function Pill({ text, variant }: { text: string; variant?: 'tier' }) {
  const isTier = variant === 'tier'
  return (
    <span
      className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
      style={{
        letterSpacing: '1.2px',
        background: isTier ? 'var(--b2b-champagne)' : 'rgba(201, 169, 110, 0.18)',
        color: isTier ? 'var(--b2b-bg-0)' : 'var(--b2b-champagne)',
      }}
    >
      {text}
    </span>
  )
}

function EmptyState() {
  return (
    <div
      className="rounded-lg p-8 text-center"
      style={{
        background: 'var(--b2b-bg-1)',
        border: '1px solid var(--b2b-border)',
      }}
    >
      <p
        className="font-display text-xl mb-2"
        style={{ color: 'var(--b2b-ivory)', fontStyle: 'italic' }}
      >
        Sem dados de cobertura
      </p>
      <p className="text-[12px]" style={{ color: 'var(--b2b-text-muted)' }}>
        RPC <code>b2b_suggestions_snapshot</code> não retornou categorias. Verifique se o
        plano de cobertura está populado em <code>b2b_categories</code>.
      </p>
    </div>
  )
}
