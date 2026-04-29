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
      <h4 className="text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider flex items-center gap-2 mb-3">
        <Sparkles className="w-3 h-3 text-[hsl(var(--primary))]" /> Próxima ação
      </h4>
      {isLoading && actions.length === 0 ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-[hsl(var(--chat-bg))] animate-pulse border border-[hsl(var(--chat-border))]"
            />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))] italic">
          Sem sugestões no momento.
        </p>
      ) : (
        <div className="space-y-1.5">
          {actions.map((action, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPick(action)}
              className="w-full text-left px-3 py-2 rounded-lg bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] hover:border-[hsl(var(--primary))]/50 hover:bg-[hsl(var(--primary))]/5 transition-colors group"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
                      {action.verb}
                    </span>
                    <span className="text-xs text-[hsl(var(--foreground))] truncate">
                      {action.target}
                    </span>
                  </div>
                  {action.rationale && (
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5 line-clamp-2 leading-snug">
                      {action.rationale}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[hsl(var(--muted-foreground))] opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
