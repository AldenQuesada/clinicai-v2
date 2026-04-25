/**
 * Tab Professionals · lista wa_numbers (admins autorizados).
 *
 * P1: read-only · CRUD via clinic-dashboard (Alden cadastra phone_number_id
 * + label) e Mira reflete. UI futura (P2) pode expor edicao inline.
 */

import { loadMiraServerContext } from '@/lib/server-context'

export async function ProfessionalsTab() {
  const { ctx, repos } = await loadMiraServerContext()
  const numbers = await repos.waNumbers.list(ctx.clinic_id)

  if (numbers.length === 0) {
    return (
      <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Nenhum número WhatsApp cadastrado em <code>wa_numbers</code> · Mira não tem
        admins autorizados ainda.
      </div>
    )
  }

  return (
    <div className="rounded-card border border-[hsl(var(--chat-border))] overflow-hidden bg-[hsl(var(--chat-panel-bg))]">
      <table className="w-full text-sm">
        <thead className="bg-[hsl(var(--muted))]/30 border-b border-[hsl(var(--chat-border))]">
          <tr className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
            <th className="text-left px-4 py-3">Label</th>
            <th className="text-left px-4 py-3">Phone</th>
            <th className="text-left px-4 py-3">Phone Number ID</th>
            <th className="text-left px-4 py-3">Status</th>
            <th className="text-left px-4 py-3">Cadastrado</th>
          </tr>
        </thead>
        <tbody>
          {numbers.map((n) => (
            <tr key={n.id} className="border-b border-[hsl(var(--chat-border))] last:border-0">
              <td className="px-4 py-3 text-[hsl(var(--foreground))]">{n.label || '—'}</td>
              <td className="px-4 py-3 font-mono text-xs">{n.phone}</td>
              <td className="px-4 py-3 font-mono text-xs text-[hsl(var(--muted-foreground))]">{n.phoneNumberId || '—'}</td>
              <td className="px-4 py-3">
                {n.isActive ? (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-pill bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]">
                    Ativo
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-pill bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
                    Inativo
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">{fmt(n.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-3 text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--chat-border))]">
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
