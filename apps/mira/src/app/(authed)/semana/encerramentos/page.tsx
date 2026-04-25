/**
 * /semana/encerramentos · gestao de parcerias encerradas + sugestoes de
 * encerramento.
 *
 * Mostra:
 *   - Encerradas (status=closed) · botao Reativar
 *   - Sugestoes (status=active mas zero attribution 90d) · botao Encerrar
 *     soft (vai pra closed, nao deleta dado)
 */

import Link from 'next/link'
import { RotateCcw, X, ArrowRight } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { reactivatePartnershipAction, closePartnershipAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function EncerramentosPage() {
  const { ctx, repos } = await loadMiraServerContext()

  const [closed, activePartners] = await Promise.all([
    repos.b2bPartnerships.list(ctx.clinic_id, { status: 'closed' }),
    repos.b2bPartnerships.list(ctx.clinic_id, { status: 'active' }),
  ])

  // Sugestoes de encerramento: ativas com zero attribution nos ultimos 90d
  const since90 = Date.now() - 90 * 24 * 60 * 60 * 1000
  const suggestions = await Promise.all(
    activePartners.map(async (p) => {
      const attribs = await repos.b2bAttributions.listByPartnership(p.id, 50)
      const recent = attribs.filter((a) => new Date(a.createdAt).getTime() >= since90)
      return { partnership: p, recentCount: recent.length, totalCount: attribs.length }
    }),
  ).then((arr) => arr.filter((x) => x.recentCount === 0))

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[920px] mx-auto px-6 py-6 flex flex-col gap-5">
        <div className="pb-2 border-b border-white/8">
          <span className="eyebrow text-[#C9A96E]">Semana · Encerramentos</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
            Manutenção da carteira
          </h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Reative o que voltou a fazer sentido · feche o que parou de performar.
          </p>
        </div>

        {/* Sugestoes de encerramento */}
        {suggestions.length > 0 && (
          <section className="rounded-lg border border-[#F59E0B]/22 bg-[#F59E0B]/[0.04] p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="eyebrow text-[#F59E0B]">
                ⚠ Sugestões de encerramento ({suggestions.length})
              </span>
            </div>
            <p className="text-[11px] text-[#9CA3AF]">
              Parcerias ativas com <strong>zero atribuições nos últimos 90 dias</strong> · vale
              avaliar se ainda fazem sentido na carteira.
            </p>
            <div className="flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <article
                  key={s.partnership.id}
                  className="rounded-md border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] text-[#F5F0E8] truncate">
                      {s.partnership.name}
                    </div>
                    <div className="eyebrow text-[#9CA3AF] mt-0.5">
                      {s.partnership.pillar || 'sem pilar'} · histórico total:{' '}
                      {s.totalCount} atribuição{s.totalCount === 1 ? '' : 'ões'}
                    </div>
                  </div>
                  <Link
                    href={`/partnerships/${s.partnership.id}`}
                    className="text-[10px] uppercase tracking-[1px] text-[#9CA3AF] hover:text-[#C9A96E]"
                  >
                    Ver
                  </Link>
                  <form action={closePartnershipAction}>
                    <input type="hidden" name="id" value={s.partnership.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-[1px] border border-[#FCA5A5]/30 text-[#FCA5A5] hover:bg-[#EF4444]/10 transition-colors"
                    >
                      <X className="w-3 h-3" />
                      Encerrar
                    </button>
                  </form>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* Encerradas */}
        <section className="flex flex-col gap-2">
          <span className="eyebrow text-[#9CA3AF]">Encerradas ({closed.length})</span>
          {closed.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
              Nenhuma parceria encerrada · carteira limpa.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {closed.map((p) => (
                <article
                  key={p.id}
                  className="rounded-lg border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] text-[#9CA3AF] truncate">{p.name}</div>
                    <div className="eyebrow text-[#6B7280] mt-0.5">
                      {p.pillar || 'sem pilar'}
                    </div>
                  </div>
                  <Link
                    href={`/partnerships/${p.id}`}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[1px] text-[#6B7280] hover:text-[#C9A96E]"
                  >
                    Detalhe
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                  <form action={reactivatePartnershipAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-[1px] border border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/10 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reativar
                    </button>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
