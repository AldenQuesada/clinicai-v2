/**
 * Tab Canais · lista mira_channels (function_key → wa_number_id + Evolution).
 *
 * Edicao inline restrita a owner/admin · expand → form gold-tinted
 * (mirror bcfg-admin-form).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { updateChannelAction } from './actions'

export async function ChannelsTab() {
  const { ctx, repos } = await loadMiraServerContext()
  const channels = await repos.miraChannels.list(ctx.clinic_id)
  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)

  if (channels.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
        Nenhum canal configurado em <code className="font-mono text-[#C9A96E]">mira_channels</code> ·
        seeds da P0 cobrem
        <code className="font-mono text-[#C9A96E] mx-1">mira_admin_outbound</code>,
        <code className="font-mono text-[#C9A96E] mx-1">mih_recipient_voucher</code>.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {channels.map((c) => (
        <details
          key={c.id}
          className="rounded-lg border border-white/10 bg-white/[0.02] hover:border-white/14 transition-colors"
        >
          <summary className="cursor-pointer px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] rounded-lg transition-colors">
            <div className="flex-1 min-w-0">
              <div className="font-mono text-[11px] font-bold text-[#C9A96E]">
                {c.functionKey}
              </div>
              <div className="text-[10px] uppercase tracking-[1.2px] text-[#6B7280] mt-1 font-mono">
                instance: {c.evolutionInstance ?? '—'} · wa_number_id: {c.waNumberId ?? '—'}
              </div>
            </div>
            <span
              className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] ${
                c.isActive
                  ? 'bg-[#10B981]/15 text-[#10B981]'
                  : 'bg-white/10 text-[#9CA3AF]'
              }`}
            >
              {c.isActive ? 'Ativo' : 'Inativo'}
            </span>
          </summary>

          <form
            action={updateChannelAction}
            className="px-3.5 pb-3.5 pt-1 flex flex-col gap-2.5 border-t border-[#C9A96E]/15 bg-[#C9A96E]/[0.04] rounded-b-lg"
          >
            <input type="hidden" name="id" value={c.id} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2.5">
              <Field
                label="Evolution Instance"
                name="evolutionInstance"
                defaultValue={c.evolutionInstance ?? ''}
                disabled={!canManage}
                mono
              />
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
                  Ativo
                </label>
                <select
                  name="isActive"
                  defaultValue={c.isActive ? 'true' : 'false'}
                  disabled={!canManage}
                  className="w-full px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs disabled:opacity-50"
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
                Notes
              </label>
              <textarea
                name="notes"
                defaultValue={c.notes ?? ''}
                disabled={!canManage}
                rows={2}
                className="w-full px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs disabled:opacity-50 resize-y"
              />
            </div>

            {canManage && (
              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
                >
                  Salvar
                </button>
              </div>
            )}
          </form>
        </details>
      ))}
    </div>
  )
}

function Field({
  label,
  name,
  defaultValue,
  disabled,
  mono,
}: {
  label: string
  name: string
  defaultValue: string
  disabled?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
        {label}
      </label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className={`w-full px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-[#F5F0E8] text-xs focus:outline-none focus:border-[#C9A96E]/50 disabled:opacity-50 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}
