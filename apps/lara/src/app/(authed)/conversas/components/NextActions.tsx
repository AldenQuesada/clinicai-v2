/**
 * NextActions · 3 acoes sugeridas pela IA com ESCALA DE CORES por importancia.
 *
 * #1 (top) · primary forte · bg champagne/[0.10] + border 30% · ring sutil
 * #2 (med) · primary medio · bg champagne/[0.05] + border /[0.15]
 * #3 (low) · neutral muted · bg white/[0.02] + border /[0.04] · sem accent
 *
 * Click copia "verb target" pro textarea (atendente edita e envia).
 */

import { Sparkles, ChevronRight } from 'lucide-react'

interface Action {
  verb: string
  target: string
  rationale: string
}

interface Props {
  actions: Action[]
  isLoading: boolean
  onPick: (action: Action) => void
}

/** Estilo do card por rank (0..N) · escala decrescente de saturacao. */
function rankStyle(rank: number): React.CSSProperties {
  if (rank === 0) {
    return {
      background: 'rgba(201, 169, 110, 0.10)',
      border: '1px solid rgba(201, 169, 110, 0.30)',
      boxShadow: '0 0 0 1px rgba(201, 169, 110, 0.12)',
    }
  }
  if (rank === 1) {
    return {
      background: 'rgba(201, 169, 110, 0.04)',
      border: '1px solid rgba(245, 240, 232, 0.10)',
    }
  }
  return {
    background: 'rgba(255, 255, 255, 0.015)',
    border: '1px solid rgba(245, 240, 232, 0.04)',
  }
}

function rankVerbColor(rank: number): string {
  if (rank === 0) return '#C9A96E'
  if (rank === 1) return 'rgba(201, 169, 110, 0.7)'
  return 'rgba(245, 240, 232, 0.55)'
}

function rankBadge(rank: number): React.CSSProperties {
  const colors = [
    { bg: 'rgba(201, 169, 110, 0.18)', color: '#C9A96E' },        // #1 forte
    { bg: 'rgba(201, 169, 110, 0.08)', color: 'rgba(201, 169, 110, 0.7)' }, // #2 medio
    { bg: 'rgba(255, 255, 255, 0.04)', color: 'rgba(245, 240, 232, 0.5)' }, // #3 neutro
  ]
  const c = colors[rank] ?? colors[2]
  return {
    fontFamily: 'Montserrat, sans-serif',
    fontSize: 8.5,
    fontWeight: 600,
    letterSpacing: '0.08em',
    width: 18,
    height: 18,
    borderRadius: 9,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: c.bg,
    color: c.color,
    flexShrink: 0,
  }
}

export function NextActions({ actions, isLoading, onPick }: Props) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em] flex items-center gap-2 mb-3">
        <Sparkles className="w-3 h-3 text-[hsl(var(--primary))]" strokeWidth={1.5} /> Próximas ações
      </h4>
      {isLoading && actions.length === 0 ? (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-12 rounded-md bg-white/[0.02] animate-pulse border border-white/[0.04]"
            />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))] italic font-display opacity-70">
          Lara ainda analisando…
        </p>
      ) : (
        <div className="space-y-1.5">
          {actions.slice(0, 3).map((action, rank) => (
            <button
              key={rank}
              type="button"
              onClick={() => onPick(action)}
              style={rankStyle(rank)}
              className="w-full text-left px-3 py-2 rounded-md hover:opacity-90 transition-all group flex items-start gap-2.5"
            >
              {/* Badge numerico de prioridade · cor escalonada */}
              <span style={rankBadge(rank)}>{rank + 1}</span>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span
                    className="font-meta uppercase tracking-[0.16em]"
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 600,
                      color: rankVerbColor(rank),
                    }}
                  >
                    {action.verb}
                  </span>
                  <span
                    className="text-[12px] truncate"
                    style={{
                      color: rank === 0
                        ? 'hsl(var(--foreground))'
                        : rank === 1
                          ? 'rgba(245, 240, 232, 0.85)'
                          : 'rgba(245, 240, 232, 0.6)',
                    }}
                  >
                    {action.target}
                  </span>
                </div>
                {action.rationale && (
                  <p
                    className="text-[10.5px] mt-1 line-clamp-2 leading-snug"
                    style={{
                      color: rank === 2
                        ? 'rgba(245, 240, 232, 0.4)'
                        : 'rgba(245, 240, 232, 0.55)',
                    }}
                  >
                    {action.rationale}
                  </p>
                )}
              </div>
              <ChevronRight
                className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity mt-1.5 shrink-0"
                strokeWidth={1.5}
                style={{ color: rankVerbColor(rank) }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
