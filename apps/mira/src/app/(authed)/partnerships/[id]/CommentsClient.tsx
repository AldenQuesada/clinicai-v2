'use client'

/**
 * CommentsClient · espelho 1:1 de `b2b-comments.ui.js`.
 *
 * Lista de cards + textarea + botao Postar. Mention highlighter @nome.
 * Ctrl/Cmd+Enter posta. Soft-delete via owner/admin.
 */

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { addCommentAction, removeCommentAction } from './actions'
import type { PartnershipComment } from '@clinicai/repositories'

function fmtRelative(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const diff = Math.floor((Date.now() - d.getTime()) / 1000)
    if (diff < 60) return 'agora'
    if (diff < 3600) return Math.floor(diff / 60) + ' min'
    if (diff < 86400) return Math.floor(diff / 3600) + 'h'
    if (diff < 7 * 86400) return Math.floor(diff / 86400) + 'd'
    return d.toLocaleDateString('pt-BR')
  } catch {
    return ''
  }
}

function fmtAbs(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

// Mention highlighter @nome (alfanum+acento+hifen, min 2 chars)
function renderMentions(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const regex = /@([\wÀ-ÿ-]{2,})/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    parts.push(
      <span
        key={`m-${match.index}`}
        className="text-[#C9A96E] font-medium"
        data-mention={match[1].toLowerCase()}
      >
        @{match[1]}
      </span>,
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return parts
}

export function CommentsClient({
  partnershipId,
  initialItems,
  canDelete,
}: {
  partnershipId: string
  initialItems: PartnershipComment[]
  canDelete: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [body, setBody] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  function onPost() {
    const trimmed = body.trim()
    if (!trimmed) {
      setFeedback('Escreva algo antes de postar')
      return
    }
    startTransition(async () => {
      const r = await addCommentAction(partnershipId, trimmed)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setBody('')
      setFeedback('Comentário postado')
      router.refresh()
    })
  }

  function onDelete(commentId: string) {
    if (!confirm('Remover este comentário?')) return
    startTransition(async () => {
      const r = await removeCommentAction(commentId, partnershipId)
      if (!r.ok) {
        setFeedback(`Erro: ${r.error || 'falha'}`)
        return
      }
      setFeedback('Comentário removido')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Lista */}
      {initialItems.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-[12.5px] text-[#9CA3AF]">
          Nenhum comentário ainda. Seja o primeiro a registrar contexto.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {initialItems.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-3"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="font-bold text-[#F5F0E8]">
                    {c.author_name || (
                      <em className="opacity-60">sem autor</em>
                    )}
                  </span>
                  <span
                    className="text-[10px] text-[#9CA3AF] font-mono"
                    title={fmtAbs(c.created_at)}
                  >
                    {fmtRelative(c.created_at)}
                  </span>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    className="text-[#9CA3AF] hover:text-[#FCA5A5] text-[14px] leading-none"
                    onClick={() => onDelete(c.id)}
                    disabled={pending}
                    title="Remover"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div className="text-[13px] text-[#F5F0E8] whitespace-pre-wrap">
                {c.body.split('\n').map((line, i, arr) => (
                  <span key={i}>
                    {renderMentions(line)}
                    {i < arr.length - 1 ? <br /> : null}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      <div className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-2">
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              onPost()
            }
          }}
          placeholder="Escreva uma nota interna (contexto, ligação, decisão)…"
          className="w-full px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs focus:outline-none focus:border-[#C9A96E]/50 resize-y"
          disabled={pending}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-[1.2px] text-[#6B7280]">
            Ctrl/Cmd+Enter para enviar
          </span>
          <button
            type="button"
            className="px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors disabled:opacity-50"
            onClick={onPost}
            disabled={pending}
          >
            {pending ? 'Postando…' : 'Postar'}
          </button>
        </div>
      </div>

      {feedback ? (
        <div className="text-[11px] text-[#C9A96E] bg-[#C9A96E]/10 border border-[#C9A96E]/20 rounded px-3 py-2">
          {feedback}
        </div>
      ) : null}
    </div>
  )
}
