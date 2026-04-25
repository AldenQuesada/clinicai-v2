/**
 * /estudio/lgpd · controles LGPD compliance.
 *
 * RPCs em prod (clinic-dashboard mig 0769):
 *   - b2b_partnership_anonymize(id, reason) · substitui PII por placeholder
 *   - b2b_partnership_export_data(id) · export full JSON
 *
 * UI mostra parcerias encerradas (closed) como sugestoes pra anonimizar.
 * Acao irreversivel · forca confirmacao com motivo (min 5 chars).
 */

import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import { anonymizePartnershipAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function LgpdPage() {
  const { ctx, repos } = await loadMiraServerContext()

  const closed = await repos.b2bPartnerships.list(ctx.clinic_id, { status: 'closed' })

  // Filtra fora as ja anonimizadas (nome comeca com "Parceria anonimizada")
  const candidates = closed.filter((p) => !p.name.startsWith('Parceria anonimizada'))
  const alreadyAnon = closed.filter((p) => p.name.startsWith('Parceria anonimizada'))

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[820px] mx-auto px-6 py-6 flex flex-col gap-5">
        <div className="pb-2 border-b border-white/10">
          <span className="eyebrow text-[#C9A96E]">Estúdio · LGPD</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">Compliance e privacidade</h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Solicitações de exclusão (LGPD art. 18) · anonimização irreversível mantém ID e
            agregados, substitui PII por placeholders.
          </p>
        </div>

        {/* Aviso */}
        <div className="rounded-lg border border-[#FCA5A5]/30 bg-[#FCA5A5]/[0.04] p-4 flex gap-3 items-start">
          <ShieldAlert className="w-5 h-5 text-[#FCA5A5] shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="text-[12.5px] font-semibold text-[#FCA5A5]">Atenção · ação irreversível</div>
            <p className="text-[11px] text-[#9CA3AF] mt-1">
              A anonimização <strong>não pode ser desfeita</strong>. Nome, contato (telefone,
              email, instagram, site) e narrative_quote são substituídos por placeholders. Métricas
              agregadas (vouchers, attributions, comments) são preservadas. O motivo informado fica
              registrado em audit_log para rastreabilidade.
            </p>
          </div>
        </div>

        {/* Candidatas a anonimizar */}
        <section className="flex flex-col gap-2">
          <span className="eyebrow text-[#9CA3AF]">
            Encerradas elegíveis ({candidates.length})
          </span>
          {candidates.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
              Nenhuma parceria encerrada elegível · só parcerias com status=closed aparecem aqui.
            </div>
          ) : (
            candidates.map((p) => (
              <details
                key={p.id}
                className="rounded-lg border border-white/10 bg-white/[0.02] hover:border-[#FCA5A5]/30 transition-colors"
              >
                <summary className="cursor-pointer px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-[12.5px] text-[#F5F0E8] truncate">{p.name}</span>
                    {p.pillar && (
                      <div className="eyebrow text-[#6B7280] mt-0.5">{p.pillar}</div>
                    )}
                  </div>
                  <span className="eyebrow text-[#FCA5A5]">anonimizar →</span>
                </summary>

                <form
                  action={anonymizePartnershipAction}
                  className="px-3.5 pb-3.5 pt-3 flex flex-col gap-3 border-t border-[#FCA5A5]/15 bg-[#FCA5A5]/[0.04] rounded-b-lg"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <div className="flex flex-col gap-1.5">
                    <label className="eyebrow text-[#9CA3AF]">
                      Motivo da anonimização <span className="text-[#FCA5A5] ml-1">*</span>
                    </label>
                    <textarea
                      name="reason"
                      required
                      minLength={5}
                      rows={2}
                      placeholder="ex: solicitação LGPD art. 18 V via email · 2026-04-25"
                      className="w-full px-2.5 py-1.5 rounded-md bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] resize-y focus:outline-none focus:border-[#FCA5A5]/50"
                    />
                    <span className="text-[10px] text-[#6B7280]">
                      Mínimo 5 caracteres · vai pro audit_log com action=lgpd_anonymize
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[1px] bg-[#FCA5A5] text-[#1A1814] hover:bg-[#F5797A] transition-colors w-fit"
                  >
                    Confirmar anonimização irreversível
                  </button>
                </form>
              </details>
            ))
          )}
        </section>

        {/* Já anonimizadas */}
        {alreadyAnon.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
              <span className="eyebrow text-[#9CA3AF]">
                Já anonimizadas ({alreadyAnon.length})
              </span>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] divide-y divide-white/10">
              {alreadyAnon.map((p) => (
                <div key={p.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-[11.5px] text-[#9CA3AF] font-mono">{p.name}</span>
                  <span className="eyebrow text-[#10B981]">PII removida</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
