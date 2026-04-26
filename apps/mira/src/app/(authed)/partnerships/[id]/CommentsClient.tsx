'use client'

/**
 * CommentsClient · espelho 1:1 de `b2b-comments.ui.js`.
 *
 * Lista de cards + textarea + botao Postar. Mention highlighter @nome.
 * Ctrl/Cmd+Enter posta. Soft-delete via owner/admin.
 *
 * Visual luxury · b2b-card pra rows + b2b-card-gold pro form.
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
        style={{ color: 'var(--b2b-champagne)', fontWeight: 500 }}
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
        <div className="b2b-empty">
          Nenhum comentário ainda. Seja o primeiro a registrar contexto.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {initialItems.map((c) => (
            <div key={c.id} className="b2b-card">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[11.5px]">
                  <span className="font-semibold" style={{ color: 'var(--b2b-ivory)' }}>
                    {c.author_name || <em style={{ opacity: 0.6 }}>sem autor</em>}
                  </span>
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: 'var(--b2b-text-muted)' }}
                    title={fmtAbs(c.created_at)}
                  >
                    {fmtRelative(c.created_at)}
                  </span>
                </div>
                {canDelete ? (
                  <button
                    type="button"
                    className="text-[14px] leading-none"
                    style={{ color: 'var(--b2b-text-muted)' }}
                    onClick={() => onDelete(c.id)}
                    disabled={pending}
                    title="Remover"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div
                className="text-[13px] whitespace-pre-wrap"
                style={{ color: 'var(--b2b-ivory)', lineHeight: 1.55 }}
              >
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
      <div className="b2b-card b2b-card-gold">
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
          className="b2b-input"
          style={{ resize: 'vertical', minHeight: 64 }}
          disabled={pending}
        />
        <div className="flex items-center justify-between gap-2 mt-1">
          <span className="text-[10px] uppercase tracking-[1.4px] text-[var(--b2b-text-muted)]">
            Ctrl/Cmd+Enter para enviar
          </span>
          <button
            type="button"
            className="b2b-btn b2b-btn-primary"
            onClick={onPost}
            disabled={pending}
          >
            {pending ? 'Postando…' : 'Postar'}
          </button>
        </div>
      </div>

      {feedback ? <div className="b2b-feedback">{feedback}</div> : null}
    </div>
  )
}
