/**
 * Tab Channels · lista mira_channels (function_key → wa_number_id + Evolution).
 * Edicao inline restrita a owner/admin.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { updateChannelAction } from './actions'

export async function ChannelsTab() {
  const { ctx, repos } = await loadMiraServerContext()
  const channels = await repos.miraChannels.list(ctx.clinic_id)
  const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)

  if (channels.length === 0) {
    return (
      <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Nenhum canal configurado em <code>mira_channels</code> · seeds da P0 cobrem
        <code className="mx-1">mira_admin_outbound</code>,<code className="mx-1">mih_recipient_voucher</code>.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {channels.map((c) => (
        <details
          key={c.id}
          className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]"
        >
          <summary className="cursor-pointer px-4 py-3 flex items-center justify-between gap-3 hover:bg-[hsl(var(--muted))]/20 rounded-card transition-colors">
            <div className="flex-1">
              <div className="font-display-uppercase text-xs tracking-widest text-[hsl(var(--primary))]">
                {c.functionKey}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mt-1">
                instance: {c.evolutionInstance ?? '—'} · wa_number_id: {c.waNumberId ?? '—'}
              </div>
            </div>
            <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-pill ${
              c.isActive
                ? 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]'
                : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
            }`}>
              {c.isActive ? 'Ativo' : 'Inativo'}
            </span>
          </summary>

          <form action={updateChannelAction} className="p-4 border-t border-[hsl(var(--chat-border))] space-y-3">
            <input type="hidden" name="id" value={c.id} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field
                label="Evolution Instance"
                name="evolutionInstance"
                defaultValue={c.evolutionInstance ?? ''}
                disabled={!canManage}
              />
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                  Ativo
                </label>
                <select
                  name="isActive"
                  defaultValue={c.isActive ? 'true' : 'false'}
                  disabled={!canManage}
                  className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] disabled:opacity-50"
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
                Notes
              </label>
              <textarea
                name="notes"
                defaultValue={c.notes ?? ''}
                disabled={!canManage}
                rows={2}
                className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] disabled:opacity-50 resize-y"
              />
            </div>

            {canManage && (
              <button
                type="submit"
                className="px-5 py-2 rounded-pill text-[10px] uppercase tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all"
              >
                Salvar
              </button>
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
}: {
  label: string
  name: string
  defaultValue: string
  disabled?: boolean
}) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-2">
        {label}
      </label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] disabled:opacity-50 font-mono text-xs"
      />
    </div>
  )
}
