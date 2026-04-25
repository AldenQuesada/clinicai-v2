/**
 * TemplateRow · linha editavel inline pra b2b_comm_templates.
 * Server-rendered (form completo) · funciona sem JS no client.
 */

import { saveTemplateAction, deleteTemplateById } from './actions'
import type { B2BCommTemplateDTO } from '@clinicai/repositories'

const CHANNEL_OPTIONS = [
  { value: 'text', label: 'Texto' },
  { value: 'audio', label: 'Áudio' },
  { value: 'both', label: 'Ambos' },
]

export function TemplateRow({
  template,
  canManage,
}: {
  template: B2BCommTemplateDTO
  canManage: boolean
}) {
  const isOverride = template.partnershipId !== null
  const inactive = !template.isActive

  return (
    <details
      className={`rounded-card border bg-[hsl(var(--chat-panel-bg))] ${
        inactive
          ? 'border-[hsl(var(--chat-border))] opacity-60'
          : 'border-[hsl(var(--chat-border))]'
      }`}
    >
      <summary className="cursor-pointer px-4 py-3 flex items-center justify-between gap-3 hover:bg-[hsl(var(--muted))]/20 rounded-card transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-display-uppercase text-xs tracking-widest text-[hsl(var(--primary))]">
              {template.eventKey}
            </span>
            {isOverride && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-pill bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]">
                Override
              </span>
            )}
            {inactive && (
              <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-pill bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                Inativo
              </span>
            )}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mt-1">
            {template.recipientRole} · {template.channel} · prio {template.priority} · {template.senderInstance}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] shrink-0">
          {fmt(template.updatedAt)}
        </div>
      </summary>

      <form action={saveTemplateAction} className="p-4 border-t border-[hsl(var(--chat-border))] space-y-3">
        <input type="hidden" name="id" value={template.id} />

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-1">
            Texto (text_template)
          </label>
          <textarea
            name="textTemplate"
            rows={5}
            defaultValue={template.textTemplate ?? ''}
            disabled={!canManage}
            className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] disabled:opacity-50 resize-y font-mono text-xs"
          />
        </div>

        <div>
          <label className="block text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-1">
            Audio Script (audio_script)
          </label>
          <textarea
            name="audioScript"
            rows={3}
            defaultValue={template.audioScript ?? ''}
            disabled={!canManage}
            className="w-full px-3 py-2 rounded-md border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-bg))] text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))] disabled:opacity-50 resize-y font-mono text-xs"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Canal</label>
          <select
            name="channel"
            defaultValue={template.channel}
            disabled={!canManage}
            className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-sm disabled:opacity-50"
          >
            {CHANNEL_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] ml-2">
            Ativo
          </label>
          <select
            name="isActive"
            defaultValue={template.isActive ? 'true' : 'false'}
            disabled={!canManage}
            className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-sm disabled:opacity-50"
          >
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </div>

        {canManage && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-pill text-[10px] uppercase tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all"
            >
              Salvar
            </button>
            <DeleteForm id={template.id} />
          </div>
        )}
      </form>
    </details>
  )
}

function DeleteForm({ id }: { id: string }) {
  return (
    <form action={deleteTemplateById}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="px-3 py-2 rounded-pill text-[10px] uppercase tracking-widest border border-[hsl(var(--danger))]/30 text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/10 transition-colors"
      >
        Desativar
      </button>
    </form>
  )
}

function fmt(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return ''
  }
}
