/**
 * Cockpit · espelho 1:1 de `b2bm2-cockpit.widget.js`.
 *
 * Mostra meta 1 parceria/semana, streak e grid das ultimas 12 semanas.
 * Server Component puro · so renderiza dados ja carregados.
 */

import type { GrowthWeekly, GrowthWeek } from '@clinicai/repositories'

function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return ''
  }
}

function streakEmoji(n: number): string {
  if (n >= 5) return '🔥🔥🔥'
  if (n >= 3) return '🔥🔥'
  if (n >= 1) return '🔥'
  return '—'
}

export function Cockpit({ data }: { data: GrowthWeekly | null }) {
  if (!data || !data.ok) {
    return <div className="b2bm2-card b2bm2-empty">Sem dados de crescimento</div>
  }

  const cur = data.current_week || ({} as GrowthWeek)
  const meta = data.meta || 1
  const streak = data.streak || { current: 0, max_window: 0 }
  const hitState = cur.hit ? 'hit' : (cur.days_remaining ?? 999) <= 1 ? 'risk' : 'inprogress'
  const newCount = Number(cur.new_count || 0)
  const pct = Math.min(100, Math.round((newCount / meta) * 100))
  const barColor = cur.hit
    ? 'var(--m2-green, #10B981)'
    : (cur.days_remaining ?? 999) <= 1
    ? 'var(--m2-red, #EF4444)'
    : 'var(--m2-gold, #C9A96E)'

  return (
    <div className={`b2bm2-card b2bm2-cockpit b2bm2-cockpit-${hitState}`}>
      <div className="b2bm2-cockpit-hdr">
        <div>
          <div className="b2bm2-eyebrow">Semana atual</div>
          <div className="b2bm2-cockpit-range">
            {fmtDate(cur.start)} — {fmtDate(cur.end)}
          </div>
        </div>
        <div className="b2bm2-cockpit-streak" title="Streak semanal">
          <div className="b2bm2-streak-num">{streak.current}</div>
          <div className="b2bm2-streak-lbl">{streakEmoji(streak.current)} streak</div>
          <div className="b2bm2-streak-max">
            melhor nas últimas {streak.window_weeks || 12} sem: {streak.max_window}
          </div>
        </div>
      </div>

      <div className="b2bm2-cockpit-main">
        <div className="b2bm2-cockpit-big">
          <div className="b2bm2-big-n">
            {newCount} / {meta}
          </div>
          <div className="b2bm2-big-lbl">parceria(s) nova(s)</div>
        </div>
        <div className="b2bm2-cockpit-status">
          <div
            className="b2bm2-status-bar"
            style={{ ['--bar-color' as never]: barColor } as React.CSSProperties}
          >
            <div className="b2bm2-status-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="b2bm2-cockpit-meta">
            {cur.hit ? (
              <strong style={{ color: 'var(--m2-green, #10B981)' }}>✓ meta batida</strong>
            ) : (cur.days_remaining ?? 0) === 0 ? (
              <strong style={{ color: 'var(--m2-red, #EF4444)' }}>⏰ último dia</strong>
            ) : (
              <span>{cur.days_remaining} dia(s) restante(s)</span>
            )}{' · '}
            {cur.pct ?? 0}% da meta
          </div>
        </div>
      </div>

      <div className="b2bm2-cockpit-sub">Últimas {(data.weeks || []).length} semanas</div>
      <div className="b2bm2-wk-row">
        {(data.weeks || []).map((w) => {
          const cls =
            'b2bm2-wk' +
            (w.hit ? ' b2bm2-wk-hit' : '') +
            (w.is_current ? ' b2bm2-wk-current' : '')
          const title = `${fmtDate(w.start)} a ${fmtDate(w.end)} · ${w.count} nova(s)`
          return (
            <div key={w.start} className={cls} title={title}>
              <div className="b2bm2-wk-icon">
                {w.hit ? '✓' : w.is_current ? '⏳' : '✗'}
              </div>
              <div className="b2bm2-wk-count">{w.count}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
