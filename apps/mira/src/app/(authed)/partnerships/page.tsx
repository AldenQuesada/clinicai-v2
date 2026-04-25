/**
 * Partnerships · lista com filtros · Server Component.
 *
 * Filtros: status (active/paused/dna_check/closed/all), pillar.
 * ADR-012 · usa B2BPartnershipRepository.list.
 *
 * Click linha → /partnerships/[id] (4 abas: Detalhe / Vouchers / Performance / Health).
 */

import Link from 'next/link'
import { Handshake, Filter, ChevronRight } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'active', label: 'Ativas' },
  { value: 'paused', label: 'Pausadas' },
  { value: 'dna_check', label: 'Aguardando' },
  { value: 'prospect', label: 'Prospect' },
  { value: 'closed', label: 'Encerradas' },
]

const STATUS_BADGE: Record<string, { bg: string; label: string }> = {
  active: { bg: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]', label: 'Ativa' },
  paused: { bg: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]', label: 'Pausada' },
  dna_check: { bg: 'bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]', label: 'DNA check' },
  prospect: { bg: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]', label: 'Prospect' },
  contract: { bg: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]', label: 'Contrato' },
  closed: { bg: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]', label: 'Encerrada' },
  review: { bg: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]', label: 'Em review' },
}

interface PageProps {
  searchParams: Promise<{ status?: string; pillar?: string }>
}

export default async function PartnershipsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const { ctx, repos } = await loadMiraServerContext()

  const list = await repos.b2bPartnerships.list(ctx.clinic_id, {
    status: params.status || undefined,
    pillar: params.pillar || undefined,
  })

  const pillars = Array.from(new Set(list.map((p) => p.pillar))).sort()

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
              <Handshake className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-light">
                <span className="font-cursive-italic text-[hsl(var(--primary))]">Parcerias</span>
              </h1>
              <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                {list.length} parceria{list.length === 1 ? '' : 's'} · clique pra abrir detalhe
              </p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <form className="mb-6 flex flex-wrap items-center gap-3 px-4 py-3 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))]">
          <Filter className="w-4 h-4 text-[hsl(var(--muted-foreground))]" />
          <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">Status</label>
          <select
            name="status"
            defaultValue={params.status || ''}
            className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-sm text-[hsl(var(--foreground))]"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] ml-2">Pilar</label>
          <select
            name="pillar"
            defaultValue={params.pillar || ''}
            className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-sm text-[hsl(var(--foreground))]"
          >
            <option value="">Todos</option>
            {pillars.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-pill text-[10px] uppercase tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all"
          >
            Aplicar
          </button>
        </form>

        {/* Lista */}
        {list.length === 0 ? (
          <div className="text-center py-16 text-sm text-[hsl(var(--muted-foreground))]">
            Nenhuma parceria com os filtros selecionados.
          </div>
        ) : (
          <div className="rounded-card border border-[hsl(var(--chat-border))] overflow-hidden bg-[hsl(var(--chat-panel-bg))]">
            <table className="w-full">
              <thead className="bg-[hsl(var(--muted))]/30 border-b border-[hsl(var(--chat-border))]">
                <tr className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                  <th className="text-left px-4 py-3">Nome</th>
                  <th className="text-left px-4 py-3">Pilar</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Tier</th>
                  <th className="text-left px-4 py-3">Contato</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.prospect
                  return (
                    <tr
                      key={p.id}
                      className="border-b border-[hsl(var(--chat-border))] last:border-0 hover:bg-[hsl(var(--muted))]/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-[hsl(var(--foreground))] font-medium">
                        <Link href={`/partnerships/${p.id}`} className="hover:text-[hsl(var(--primary))]">
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))] uppercase tracking-widest">
                        {p.pillar}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded-pill text-[10px] uppercase tracking-widest ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                        {p.tier ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
                        {p.contactName || '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/partnerships/${p.id}`}
                          className="inline-flex items-center text-[hsl(var(--primary))] hover:translate-x-0.5 transition-transform"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
