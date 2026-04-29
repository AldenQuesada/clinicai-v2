/**
 * NextActions · 3 acoes sugeridas no painel direito (W-01).
 *
 * Cada action: { verb, target, rationale }.
 * Click copia uma frase pra textarea (atendente pode editar e enviar).
 *
 * Cores semanticas: verbos imperativos (Agendar/Enviar/Pedir) viram chips
 * accent · rationale em texto fino abaixo.
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
  /** Click no botao · template "{verb} {target}" copiado/preenchido em algum lugar */
  onPick: (action: Action) => void
}

export function NextActions({ actions, isLoading, onPick }: Props) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-[0.18em] flex items-center gap-2 mb-3">
        <Sparkles className="w-3 h-3 text-[hsl(var(--primary))]" strokeWidth={1.5} /> Próxima ação
      </h4>
      {isLoading && actions.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-white/[0.02] animate-pulse border border-white/[0.04]"
            />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <p className="text-[11px] text-[hsl(var(--muted-foreground))] italic font-display">
          Sem sugestões no momento.
        </p>
      ) : (
        <div className="space-y-1.5">
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(action)}
              className="w-full text-left px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-[hsl(var(--primary))]/40 hover:bg-[hsl(var(--primary))]/[0.04] transition-colors group"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary))]">
                      {action.verb}
                    </span>
                    <span className="text-[12px] text-[hsl(var(--foreground))] truncate">
                      {action.target}
                    </span>
                  </div>
                  {action.rationale && (
                    <p className="text-[10.5px] text-[hsl(var(--muted-foreground))] mt-1 line-clamp-2 leading-snug">
                      {action.rationale}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-3 h-3 text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" strokeWidth={1.5} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
