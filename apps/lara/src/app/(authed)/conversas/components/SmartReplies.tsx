/**
 * SmartReplies · 3 chips clicaveis acima do textarea (W-03).
 *
 * Click → preenche textarea com a sugestao · user pode editar antes de enviar.
 * Loading state mostra skeleton sutil.
 *
 * SmartReplies B (2026-05-07) · feedback discreto pra erro/vazio + retry.
 *  - Loading antes de qualquer fetch terminar → skeletons.
 *  - Erro (rede, 5xx, parse) → chip cinza com "Tentar novamente".
 *  - Erro de quota (402) → chip cinza com texto específico, sem retry
 *    (re-tentar não resolve quota).
 *  - Vazio depois de fetch real (hasFetched=true · zero replies · sem erro)
 *    → hint cinza claro "Sem sugestões úteis pra essa conversa".
 *  - Vazio ANTES do primeiro fetch terminar (hasFetched=false) → null silente.
 *  Operadora sempre sabe se a IA ainda está pensando, falhou ou não tem nada
 *  útil pra dizer · sem poluir composer com erro vermelho.
 */

import { Sparkles, RotateCw, AlertCircle } from 'lucide-react'

interface Props {
  replies: string[]
  isLoading: boolean
  /** Disparado quando user clica num chip · preenche textarea pra editar+enviar */
  onPick: (text: string) => void
  /** SmartReplies B · mensagem traduzida do useCopilot · null = sem erro */
  error?: string | null
  /** SmartReplies B · true após primeira tentativa real terminar (sucesso ou erro) */
  hasFetched?: boolean
  /** SmartReplies B · refetch · usado pelo botão "Tentar novamente" */
  onRetry?: () => void
}

export function SmartReplies({
  replies,
  isLoading,
  onPick,
  error = null,
  hasFetched = false,
  onRetry,
}: Props) {
  // 1. Erro · prioridade máxima · mostra mesmo se ainda loading (estado de retry)
  if (error) {
    // Quota exhausted · retry não resolve · só informa
    const isQuota = error.toLowerCase().includes('limite')
    return (
      <div className="flex items-center gap-2 mb-3 px-3 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
        <AlertCircle className="w-3 h-3 text-white/60 shrink-0" strokeWidth={2} />
        <span className="text-[11px] text-white/70 truncate">{error}</span>
        {!isQuota && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={isLoading}
            className="ml-auto text-[11px] text-white/80 hover:text-white inline-flex items-center gap-1 underline underline-offset-2 decoration-dotted disabled:opacity-50 disabled:cursor-wait"
          >
            <RotateCw className={`w-2.5 h-2.5 ${isLoading ? 'animate-spin' : ''}`} strokeWidth={2} />
            Tentar novamente
          </button>
        )}
      </div>
    )
  }

  // 2. Loading · skeleton acima do composer
  if (isLoading && replies.length === 0) {
    return (
      <div className="flex items-center gap-2.5 mb-3 overflow-x-auto custom-scrollbar pb-1">
        <Sparkles className="w-3 h-3 text-[hsl(var(--primary))] shrink-0" strokeWidth={1.5} />
        <span className="font-meta uppercase text-[9.5px] tracking-[0.16em] text-white/50 shrink-0 mr-1">
          Gerando sugestões
        </span>
        <div className="h-7 w-36 rounded-full bg-white/[0.04] animate-pulse shrink-0" />
        <div className="h-7 w-44 rounded-full bg-white/[0.04] animate-pulse shrink-0" />
        <div className="h-7 w-40 rounded-full bg-white/[0.04] animate-pulse shrink-0" />
      </div>
    )
  }

  // 3. Tem replies · render normal
  if (replies.length > 0) {
    return (
      <div className="flex items-center gap-2.5 mb-3 overflow-x-auto custom-scrollbar pb-1">
        <Sparkles className="w-3 h-3 text-[hsl(var(--primary))] shrink-0" strokeWidth={1.5} />
        {replies.map((reply, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(reply)}
            title={reply}
            className="shrink-0 px-3 py-1.5 rounded-full text-[11px] bg-[hsl(var(--primary))]/[0.08] text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/[0.18] hover:bg-[hsl(var(--primary))]/15 hover:border-[hsl(var(--primary))]/30 transition-colors font-normal whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ maxWidth: '220px' }}
          >
            {reply}
          </button>
        ))}
      </div>
    )
  }

  // 4. Vazio depois de fetch real · hint discreto · só após hasFetched=true
  // pra evitar piscar "sem sugestões" antes da IA terminar.
  if (hasFetched) {
    return (
      <div className="flex items-center gap-2 mb-3 px-3 py-1.5 rounded-md bg-white/[0.02] border border-white/[0.05]">
        <Sparkles className="w-3 h-3 text-white/40 shrink-0" strokeWidth={1.5} />
        <span className="text-[11px] text-white/50 italic truncate">
          Sem sugestões úteis pra essa conversa
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-auto text-[11px] text-white/60 hover:text-white/90 inline-flex items-center gap-1 underline underline-offset-2 decoration-dotted"
          >
            <RotateCw className="w-2.5 h-2.5" strokeWidth={2} />
            Atualizar
          </button>
        )}
      </div>
    )
  }

  // 5. Sem dados ainda E sem fetch terminado · permanece silencioso
  return null
}
