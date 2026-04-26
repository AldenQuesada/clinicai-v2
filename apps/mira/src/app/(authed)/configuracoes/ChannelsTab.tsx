/**
 * Tab Canais · 2 blocos lado a lado (pedido Alden 2026-04-26).
 *
 * ESQUERDA · Canais (mira_channels) · cada funcao escolhe qual WA number
 *   envia atraves de um dropdown · sem hardcode no codigo.
 * DIREITA  · Numeros WhatsApp (wa_numbers) · lista de todos os numeros
 *   cadastrados na clinica com status, label, instance, type.
 *
 * Mapping function_key → titulo amigavel + descricao vive aqui (FUNCTION_LABELS).
 * Edicao restrita a owner/admin.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { updateChannelAction } from './actions'
import { WaNumbersPanel } from './WaNumbersPanel'

interface FunctionMeta {
  title: string
  desc: string
}

const FUNCTION_LABELS: Record<string, FunctionMeta> = {
  partner_onboarding: {
    title: 'Mira, welcome B2B',
    desc: 'Mira envia welcome + audio quando parceria vira active',
  },
  partner_voucher_req: {
    title: 'Mira, recebe pedido voucher',
    desc: 'Parceiro manda audio/texto pra Mira pedindo voucher',
  },
  partner_response: {
    title: 'Mira, responde ao parceiro',
    desc: 'Confirmacoes, follow-ups, orientacoes ao parceiro',
  },
  vpi_partner: {
    title: 'Lara, VPI (parceira B2C 100%)',
    desc: 'Lara fala com convidadas das parcerias VPI',
  },
  mih_recipient_voucher: {
    title: 'Mih, recebe pedido voucher convidada',
    desc: 'Convidada manda mensagem solicitando voucher',
  },
  mira_admin_outbound: {
    title: 'Mira, mensagens internas',
    desc: 'Disparos proativos pros profissionais autorizados (digests, alertas)',
  },
}

function functionMeta(key: string): FunctionMeta {
  return (
    FUNCTION_LABELS[key] || {
      title: key,
      desc: 'Funcao do sistema · sem descricao customizada',
    }
  )
}

export async function ChannelsTab() {
  const { ctx, repos } = await loadMiraServerContext()
  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)
  const [channels, waNumbers] = await Promise.all([
    repos.miraChannels.list(ctx.clinic_id),
    repos.waNumbers.list(ctx.clinic_id),
  ])

  // Numeros ativos disponiveis pra dropdown (filtra apenas com phone valido)
  const activeWaNumbers = waNumbers.filter(
    (n) => n.isActive && n.phone && n.phone.length >= 10,
  )

  // Index pra resolver wa_number_id → label/instance no painel direito
  const waById = new Map(waNumbers.map((n) => [n.id, n]))

  if (channels.length === 0 && waNumbers.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
        Nenhum canal nem numero WhatsApp configurado.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
          Canais Mira e Secretaria
        </h2>
        <p className="text-[11px] text-[#9CA3AF] mt-0.5">
          Cada funcao abaixo eh executada por um numero WhatsApp. Voce escolhe
          de qual numero sai cada tipo de mensagem, sem precisar alterar codigo.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {/* ESQUERDA · Canais com dropdown de WA number */}
        <section className="flex flex-col gap-2.5 min-w-0">
          {channels.map((c) => {
            const meta = functionMeta(c.functionKey)
            const currentWa = c.waNumberId ? waById.get(c.waNumberId) : null
            return (
              <form
                key={c.id}
                action={updateChannelAction}
                className="bg-white/[0.02] border border-white/10 rounded-lg p-3.5 flex flex-col gap-2.5"
              >
                <input type="hidden" name="id" value={c.id} />
                <input
                  type="hidden"
                  name="isActive"
                  value={c.isActive ? 'true' : 'false'}
                />
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-[#F5F0E8]">
                      {meta.title}
                    </div>
                    <div className="text-[10.5px] text-[#9CA3AF] mt-0.5">
                      {meta.desc}
                    </div>
                  </div>
                  <span
                    className="shrink-0 px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-[1.1px] bg-[#C9A96E]/15 text-[#C9A96E] font-mono"
                    title={c.functionKey}
                  >
                    {c.functionKey}
                  </span>
                </header>

                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    name="waNumberId"
                    defaultValue={c.waNumberId ?? ''}
                    disabled={!canManage}
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs focus:outline-none focus:border-[#C9A96E]/50 disabled:opacity-50 font-mono"
                  >
                    <option value="">— escolha um numero —</option>
                    {activeWaNumbers.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.phone} · {n.label || 'sem label'}
                      </option>
                    ))}
                  </select>
                  {canManage && (
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
                    >
                      Salvar
                    </button>
                  )}
                </div>

                {currentWa && (
                  <div className="text-[9.5px] text-[#6B7280] font-mono">
                    instance: {currentWa.phoneNumberId ?? '—'}
                    {!c.isActive && (
                      <span className="ml-2 text-[#F59E0B]">· canal inativo</span>
                    )}
                  </div>
                )}
              </form>
            )
          })}

          {channels.length === 0 && (
            <div className="text-[11px] text-[#9CA3AF] py-4 text-center italic">
              Nenhum canal seedado em mira_channels.
            </div>
          )}
        </section>

        {/* DIREITA · CRUD de wa_numbers via mig 800-31 RPCs */}
        <WaNumbersPanel rows={waNumbers} />
      </div>
    </div>
  )
}
