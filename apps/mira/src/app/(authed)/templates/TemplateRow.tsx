/**
 * TemplateRow · linha editavel inline pra b2b_comm_templates.
 *
 * Visual mirror b2b-config.css `.bcfg-admin-row` collapsed → `.bcfg-admin-form`
 * gold-tinted quando expandido. Server-rendered (form completo · sem JS).
 */

import { saveTemplateAction, deleteTemplateById } from './actions'
import { TemplateEditor } from './TemplateEditor'
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
      className={`rounded-lg border bg-white/[0.02] hover:border-white/14 transition-colors ${
        inactive ? 'border-white/10 opacity-60' : 'border-white/10'
      }`}
    >
      <summary className="cursor-pointer px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] rounded-lg transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] font-bold text-[#C9A96E]">
              {template.eventKey}
            </span>
            {isOverride && (
              <span className="text-[9px] font-bold uppercase tracking-[1.2px] px-1.5 py-0.5 rounded bg-[#F59E0B]/15 text-[#F59E0B]">
                Override
              </span>
            )}
            {inactive && (
              <span className="text-[9px] font-bold uppercase tracking-[1.2px] px-1.5 py-0.5 rounded bg-white/10 text-[#9CA3AF]">
                Inativo
              </span>
            )}
          </div>
          <div className="text-[10px] uppercase tracking-[1.2px] text-[#6B7280] mt-1 font-mono">
            {template.recipientRole} · {template.channel} · prio {template.priority} · {template.senderInstance}
          </div>
        </div>
        <div className="text-[10px] uppercase tracking-[1.2px] text-[#6B7280] font-mono shrink-0">
          {fmt(template.updatedAt)}
        </div>
      </summary>

      <form
        action={saveTemplateAction}
        className="px-3.5 pb-3.5 pt-3 flex flex-col gap-3 border-t border-[#C9A96E]/15 bg-[#C9A96E]/[0.04] rounded-b-lg"
      >
        <input type="hidden" name="id" value={template.id} />

        <TemplateEditor
          defaultText={template.textTemplate ?? ''}
          defaultAudio={template.audioScript ?? ''}
          idPrefix={`tpl-${template.id}`}
          disabled={!canManage}
        />

        <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-white/10">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
              Canal
            </label>
            <select
              name="channel"
              defaultValue={template.channel}
              disabled={!canManage}
              className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] disabled:opacity-50"
            >
              {CHANNEL_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
              Ativo
            </label>
            <select
              name="isActive"
              defaultValue={template.isActive ? 'true' : 'false'}
              disabled={!canManage}
              className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/10 text-xs text-[#F5F0E8] disabled:opacity-50"
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
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
        className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] border border-[#EF4444]/30 text-[#FCA5A5] hover:bg-[#EF4444]/8 transition-colors"
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
