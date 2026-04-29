/**
 * CopilotSummary · banner TLDR no topo do MessageArea (W-02).
 *
 * Visual: card champagne sutil · 1 linha de texto + botao refresh.
 */

import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react'

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
    <div className="border-b border-[hsl(var(--chat-border))] bg-[hsl(var(--primary))]/5 px-6 py-2.5 flex items-start gap-3">
      <Sparkles className="w-4 h-4 text-[hsl(var(--primary))] mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        {error ? (
          <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--danger))]">
            <AlertCircle className="w-3 h-3" />
            <span className="truncate">{error}</span>
          </div>
        ) : isLoading && !summary ? (
          <span className="text-xs text-[hsl(var(--muted-foreground))] italic">
            Lara analisando o lead...
          </span>
        ) : (
          <span className="text-xs text-[hsl(var(--foreground))] leading-relaxed">
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
        className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))] transition-colors disabled:opacity-50 shrink-0"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}
