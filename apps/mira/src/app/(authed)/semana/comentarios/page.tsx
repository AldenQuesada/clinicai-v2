/**
 * /semana/comentarios · feed cronologico de comentarios cross-parcerias.
 *
 * Auditoria gap #K · workflow de time/agencia. RPC b2b_comments_list +
 * b2b_comment_add + b2b_comment_delete ja em prod (clinic-dashboard mig 0300).
 *
 * UI:
 *   - Form rapido no topo: select parceria + textarea body + botao "Comentar"
 *   - Lista de comentarios desc · partnership name como link clicavel,
 *     timestamp relativo, autor, body
 *   - Cada item tem botao "remover" (host/admin)
 */

import Link from 'next/link'
import { MessageSquare, Trash2 } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { addCommentAction, deleteCommentAction } from './actions'

export const dynamic = 'force-dynamic'

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s atrás`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}min atrás`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d atrás`
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

export default async function ComentariosPage() {
  const { ctx, repos } = await loadMiraServerContext()

  const [partnerships, comments] = await Promise.all([
    repos.b2bPartnerships.list(ctx.clinic_id, {}),
    repos.b2bPartnerships.listRecentComments(ctx.clinic_id, 100),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[820px] mx-auto px-6 py-6 flex flex-col gap-4">
        <div className="pb-2 border-b border-white/10">
          <span className="eyebrow text-[#C9A96E]">Semana · Comentários</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
            Notas internas e contexto
          </h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Histórico de negociações, ligações, decisões. Visível para todo o time da clínica.
          </p>
        </div>

        {/* Form rápido */}
        <form
          action={addCommentAction}
          className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] p-4 flex flex-col gap-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2 flex flex-col gap-1.5">
              <label className="eyebrow text-[#9CA3AF]">Parceria</label>
              <select
                name="partnership_id"
                required
                defaultValue=""
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
              >
                <option value="" disabled>
                  Selecionar parceria…
                </option>
                {partnerships.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="eyebrow text-[#9CA3AF]">Autor (opcional)</label>
              <input
                name="author_name"
                placeholder="Mirian / Paula / Alden"
                className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] focus:outline-none focus:border-[#C9A96E]/50"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="eyebrow text-[#9CA3AF]">Comentário</label>
            <textarea
              name="body"
              required
              rows={3}
              placeholder="Falei com a Ana hoje, ela vai trazer 5 alunas pro voucher de olheiras esse mês."
              className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] resize-y focus:outline-none focus:border-[#C9A96E]/50"
            />
          </div>
          <div className="flex items-center pt-1">
            <button
              type="submit"
              disabled={partnerships.length === 0}
              className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors disabled:opacity-40"
            >
              Comentar
            </button>
          </div>
        </form>

        {/* Feed */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-3.5 h-3.5 text-[#C9A96E]" />
            <span className="eyebrow text-[#9CA3AF]">Histórico ({comments.length})</span>
          </div>

          {comments.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
              Nenhum comentário ainda · seja o primeiro a registrar contexto.
            </div>
          ) : (
            comments.map((c) => (
              <article
                key={c.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex flex-col gap-2"
              >
                <header className="flex items-center justify-between gap-2">
                  <Link
                    href={`/partnerships/${c.partnershipId}`}
                    className="text-[12px] font-medium text-[#C9A96E] hover:text-[#D4B785] truncate"
                  >
                    {c.partnershipName}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="eyebrow text-[#6B7280]">
                      {c.authorName ? `${c.authorName} · ` : ''}
                      {fmtRelative(c.createdAt)}
                    </span>
                    <form action={deleteCommentAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button
                        type="submit"
                        title="Remover comentário"
                        className="p-1 rounded text-[#6B7280] hover:text-[#FCA5A5] hover:bg-white/5 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </form>
                  </div>
                </header>
                <p className="text-[12.5px] text-[#F5F0E8] whitespace-pre-wrap leading-snug">
                  {c.body}
                </p>
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  )
}
