/**
 * /hoje/conversas · queue de conversas WhatsApp ativas.
 *
 * Server component · lista conversas com status 'active' ou 'paused' da
 * clinica, ordenadas por last_message_at DESC. Cada linha mostra nome,
 * telefone, snippet da ultima mensagem, tempo relativo e status pill.
 *
 * Detalhe da thread NAO existe ainda · este rota e read-only por enquanto.
 */

import { MessageCircle, Pause, Bot } from 'lucide-react'
import { formatPhoneBR } from '@clinicai/utils'
import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}min`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

export default async function ConversasPage() {
  const { ctx, repos } = await loadMiraServerContext()
  const conversations = await repos.conversations.listByStatus(ctx.clinic_id, 'active')

  const aiEnabled = conversations.filter((c) => c.aiEnabled).length
  const aiPaused = conversations.length - aiEnabled

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[920px] mx-auto px-6 py-6 flex flex-col gap-4">
        <div className="pb-2 border-b border-white/10">
          <span className="eyebrow text-[#C9A96E]">Hoje · Conversas</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">Queue WhatsApp</h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Conversas ativas e em pausa · ordenadas por última mensagem.
          </p>
        </div>

        {/* KPIs rapidos */}
        <div className="grid grid-cols-3 gap-3">
          <KpiCard label="Total ativas" value={conversations.length} accent="#C9A96E" />
          <KpiCard label="IA respondendo" value={aiEnabled} accent="#10B981" />
          <KpiCard label="IA pausada" value={aiPaused} accent="#F59E0B" />
        </div>

        {/* Lista */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-3.5 h-3.5 text-[#C9A96E]" />
            <span className="eyebrow text-[#9CA3AF]">
              Conversas ({conversations.length})
            </span>
          </div>

          {conversations.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
              Nenhuma conversa ativa · Mira sem demanda nova.
            </div>
          ) : (
            conversations.map((c) => (
              <article
                key={c.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3"
              >
                {/* Status indicator */}
                <div className="shrink-0">
                  {c.aiEnabled ? (
                    <div title="IA ativa" className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
                  ) : (
                    <div title="IA pausada" className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
                  )}
                </div>

                {/* Nome + telefone */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12.5px] text-[#F5F0E8] font-medium truncate">
                      {c.displayName || 'Sem nome'}
                    </span>
                    <span className="font-mono text-[10px] text-[#9CA3AF] shrink-0">
                      {formatPhoneBR(c.phone)}
                    </span>
                  </div>
                  {c.lastMessageText && (
                    <div className="text-[11px] text-[#9CA3AF] truncate mt-0.5">
                      {c.lastMessageText}
                    </div>
                  )}
                </div>

                {/* Pills + timestamp */}
                <div className="flex items-center gap-2 shrink-0">
                  {c.status === 'paused' && (
                    <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[1px] px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B]">
                      <Pause className="w-2.5 h-2.5" />
                      pausada
                    </span>
                  )}
                  {!c.aiEnabled && (
                    <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[1px] px-1.5 py-0.5 rounded bg-white/5 text-[#9CA3AF]">
                      <Bot className="w-2.5 h-2.5" />
                      manual
                    </span>
                  )}
                  <span className="eyebrow text-[#6B7280]">{fmtRelative(c.lastMessageAt)}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </main>
  )
}

function KpiCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="font-display text-3xl leading-none" style={{ color: accent }}>
        {value}
      </div>
      <div className="eyebrow text-[#9CA3AF] mt-2">{label}</div>
    </div>
  )
}
