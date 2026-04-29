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
    <div className="flex items-center gap-1.5 mb-2 overflow-x-auto custom-scrollbar pb-1">
      <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--primary))] shrink-0" />
      {isLoading && replies.length === 0 ? (
        <>
          <div className="h-7 w-32 rounded-full bg-[hsl(var(--chat-bg))] animate-pulse shrink-0" />
          <div className="h-7 w-40 rounded-full bg-[hsl(var(--chat-bg))] animate-pulse shrink-0" />
          <div className="h-7 w-36 rounded-full bg-[hsl(var(--chat-bg))] animate-pulse shrink-0" />
        </>
      ) : (
        replies.map((reply, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(reply)}
            title={reply}
            className="shrink-0 px-3 py-1.5 rounded-full text-[11px] bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/20 hover:bg-[hsl(var(--primary))]/20 hover:border-[hsl(var(--primary))]/40 transition-colors max-w-[260px] truncate"
          >
            {reply}
          </button>
        ))
      )}
    </div>
  )
}
