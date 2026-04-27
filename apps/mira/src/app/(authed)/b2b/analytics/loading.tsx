/**
 * Loading state · /b2b/analytics.
 *
 * Next.js convention · este loading.tsx renderiza enquanto o page.tsx
 * (Server Component que faz Promise.all em b2bAnalytics + financial +
 * benchmarks) está pendente. Substitui o fallback default branco do RSC.
 *
 * Layout luxury com Skeletons:
 *   - Header (eyebrow + título + subtítulo) skeleton text-line
 *   - Snapshot row · 6 KPI shimmer
 *   - Diagnóstico banner · card grande
 *   - 2 colunas de specific cards · 4 cards
 *
 * Não toca em page.tsx (outro agent edita o topo).
 */

import { Skeleton } from '@clinicai/ui'

export default function AnalyticsLoading() {
  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap" style={{ padding: '20px 24px' }}>
        {/* ── Header ────────────────────────────────────────── */}
        <header
          className="b2bm2-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
            marginBottom: 18,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <Skeleton variant="text-line" className="w-40" />
            <div style={{ height: 32, width: 220 }}>
              <Skeleton variant="text-line" className="h-7 w-56" />
            </div>
            <Skeleton variant="text-line" className="w-80" />
          </div>
          <Skeleton variant="card" />
        </header>

        {/* ── Diagnostic banner ─────────────────────────────── */}
        <div style={{ marginBottom: 12 }}>
          <Skeleton variant="card" className="w-full" />
        </div>

        {/* ── Snapshot row · 6 KPIs ─────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 8,
            padding: '12px 14px',
            background: 'rgba(201, 169, 110, 0.04)',
            border: '1px solid rgba(201, 169, 110, 0.2)',
            borderRadius: 10,
            marginBottom: 12,
          }}
        >
          <Skeleton variant="kpi" count={6} />
        </div>

        {/* ── Financeiro card ───────────────────────────────── */}
        <div style={{ marginBottom: 12 }}>
          <Skeleton variant="card" className="w-full" />
        </div>

        {/* ── Conversão · journey bar ───────────────────────── */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(201, 169, 110, 0.15)',
            borderRadius: 8,
            padding: '14px 16px',
            marginBottom: 12,
          }}
        >
          <Skeleton variant="text-line" className="w-48" />
          <div style={{ marginTop: 12 }}>
            <Skeleton variant="list" />
          </div>
        </div>

        {/* ── 2 colunas · cards específicos ────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
            gap: 8,
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(201, 169, 110, 0.15)',
                borderRadius: 8,
                padding: '14px 16px',
              }}
            >
              <Skeleton variant="text-line" className="w-32" />
              <div style={{ marginTop: 12 }}>
                <Skeleton variant="list" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
