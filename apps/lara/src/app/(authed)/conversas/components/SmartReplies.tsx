/**
 * SmartReplies · 3 chips clicaveis acima do textarea (W-03).
 *
 * Click → preenche textarea com a sugestao · user pode editar antes de enviar.
 * Sumiu se nao tem replies · loading state mostra skeleton sutil.
 */

import { Sparkles } from 'lucide-react'

interface Props {
  replies: string[]
  isLoading: boolean
  /** Disparado quando user clica num chip · preenche textarea pra editar+enviar */
  onPick: (text: string) => void
}

export function SmartReplies({ replies, isLoading, onPick }: Props) {
  if (!isLoading && replies.length === 0) return null

  return (
    <div className="flex items-center gap-2 mb-2.5 overflow-x-auto custom-scrollbar pb-1">
      <Sparkles className="w-3 h-3 text-[hsl(var(--primary))] shrink-0" strokeWidth={1.5} />
      {isLoading && replies.length === 0 ? (
        <>
          <div className="h-6 w-32 rounded-full bg-white/[0.04] animate-pulse shrink-0" />
          <div className="h-6 w-40 rounded-full bg-white/[0.04] animate-pulse shrink-0" />
          <div className="h-6 w-36 rounded-full bg-white/[0.04] animate-pulse shrink-0" />
        </>
      ) : (
        replies.map((reply, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(reply)}
            title={reply}
            className="shrink-0 px-3 py-1.5 rounded-full text-[11px] bg-[hsl(var(--primary))]/[0.08] text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/[0.18] hover:bg-[hsl(var(--primary))]/15 hover:border-[hsl(var(--primary))]/30 transition-colors max-w-[260px] truncate font-normal"
          >
            {reply}
          </button>
        ))
      )}
    </div>
  )
}
