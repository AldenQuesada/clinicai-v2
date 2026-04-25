/**
 * Tab Profissionais · lista wa_numbers (admins autorizados).
 *
 * P1: read-only · CRUD via clinic-dashboard. Visual mirror b2b-config
 * `.bcfg-admin-row` linha 116 · row denso ao inves de table.
 */

import { loadMiraServerContext } from '@/lib/server-context'

export async function ProfessionalsTab() {
  const { ctx, repos } = await loadMiraServerContext()
  const numbers = await repos.waNumbers.list(ctx.clinic_id)

  if (numbers.length === 0) {
    return (
      <div className="rounded-lg border border-white/8 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
        Nenhum número WhatsApp cadastrado em <code className="font-mono text-[#C9A96E]">wa_numbers</code> ·
        Mira não tem admins autorizados ainda.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      {numbers.map((n) => (
        <div
          key={n.id}
          className={`grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3.5 py-2.5 bg-white/[0.02] border border-white/8 rounded-lg hover:border-white/14 transition-colors ${
            n.isActive ? '' : 'opacity-60'
          }`}
        >
          <div className="min-w-0 flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-[#F5F5F5] truncate">
              {n.label || '—'}
            </span>
            <div className="flex items-center gap-3 text-[11px] text-[#9CA3AF] flex-wrap font-mono">
              <span>{n.phone}</span>
              {n.phoneNumberId && (
                <span className="text-[10.5px] text-[#6B7280]">id: {n.phoneNumberId}</span>
              )}
            </div>
          </div>

          <span
            className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] ${
              n.isActive
                ? 'bg-[#10B981]/15 text-[#10B981]'
                : 'bg-white/8 text-[#9CA3AF]'
            }`}
          >
            {n.isActive ? 'Ativo' : 'Inativo'}
          </span>

          <span className="text-[10px] uppercase tracking-[1.2px] text-[#6B7280] font-mono whitespace-nowrap">
            {fmt(n.createdAt)}
          </span>
        </div>
      ))}

      <div className="text-[10px] uppercase tracking-[1.2px] text-[#6B7280] mt-1 px-1">
        CRUD owner via clinic-dashboard · Mira reflete automaticamente.
      </div>
    </div>
  )
}

function fmt(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch {
    return iso
  }
}
