/**
 * CopilotSummary · banner TLDR no topo do MessageArea (W-02).
 *
 * Visual: card champagne sutil · 1 linha de texto + botao refresh.
 */

import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react'

const STROKE = 1.5;

interface Props {
  summary: string
  isLoading: boolean
  error: string | null
  generatedAt: string
  cached: boolean
  onRefresh: () => void
}

export function CopilotSummary({
  summary,
  isLoading,
  error,
  generatedAt,
  cached,
  onRefresh,
}: Props) {
  if (!summary && !isLoading && !error) return null

  return (
    <div className="border-b border-white/[0.06] bg-[hsl(var(--primary))]/[0.04] px-6 py-3 flex items-start gap-3">
      <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--primary))] mt-[3px] shrink-0" strokeWidth={STROKE} />
      <div className="flex-1 min-w-0">
        {error ? (
          <div className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--danger))]">
            <AlertCircle className="w-3 h-3" strokeWidth={STROKE} />
            <span className="truncate">{error}</span>
          </div>
        ) : isLoading && !summary ? (
          <span className="text-[11px] text-[hsl(var(--muted-foreground))] italic font-display">
            Lara analisando o lead...
          </span>
        ) : (
          <span className="text-[12px] text-[hsl(var(--foreground))] leading-relaxed">
            {summary}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isLoading}
        title={
          cached && generatedAt
            ? `Cache de ${new Date(generatedAt).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })} · clique pra regenerar`
            : 'Regenerar análise'
        }
        className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors disabled:opacity-50 shrink-0 mt-0.5"
      >
        <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={STROKE} />
      </button>
    </div>
  )
}
