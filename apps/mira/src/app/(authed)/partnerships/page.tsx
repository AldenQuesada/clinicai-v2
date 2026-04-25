/**
 * Partnerships · lista premium em cards · Server Component.
 *
 * Filtros: status (active/paused/dna_check/closed/all), pillar.
 * ADR-012 · usa B2BPartnershipRepository.list.
 *
 * Click linha → /partnerships/[id] (4 abas: Detalhe / Vouchers / Performance / Health).
 */

import Link from 'next/link'
import {
  Handshake,
  Filter,
  ChevronRight,
  Mail,
  Phone,
  AtSign,
  User,
} from 'lucide-react'
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

  // Counts por status pra status-pills com numero
  const counts = list.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8 bg-[hsl(var(--chat-bg))]">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start gap-4">
          <div className="p-3 rounded-card bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] shadow-luxury-sm">
            <Handshake className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-light">
              <span className="font-cursive-italic text-[hsl(var(--primary))]">Parcerias</span>
            </h1>
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              {list.length} parceria{list.length === 1 ? '' : 's'} no recorte · clique pra abrir detalhe
            </p>
          </div>
        </div>

        {/* Status pills + filter form */}
        <form className="mb-6 rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-[hsl(var(--muted-foreground))] mr-1" />
            <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] font-display-uppercase">
              Status
            </label>
            {STATUS_OPTIONS.map((opt) => {
              const isActive = (params.status || '') === opt.value
              const count = opt.value === '' ? list.length : (counts[opt.value] ?? 0)
              const href = opt.value
                ? `/partnerships?status=${opt.value}${params.pillar ? `&pillar=${params.pillar}` : ''}`
                : params.pillar
                ? `/partnerships?pillar=${params.pillar}`
                : '/partnerships'
              return (
                <Link
                  key={opt.value || 'all'}
                  href={href}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-[10px] uppercase tracking-widest transition-all ${
                    isActive
                      ? 'bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))] border border-[hsl(var(--primary))]/30'
                      : 'bg-[hsl(var(--chat-bg))] text-[hsl(var(--muted-foreground))] border border-[hsl(var(--chat-border))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--primary))]/40'
                  }`}
                >
                  {opt.label}
                  <span
                    className={`text-[9px] font-bold px-1 ${
                      isActive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))]'
                    }`}
                  >
                    {count}
                  </span>
                </Link>
              )
            })}
          </div>

          {pillars.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-[hsl(var(--chat-border))]">
              <label className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] font-display-uppercase">
                Pilar
              </label>
              <input type="hidden" name="status" value={params.status || ''} />
              <select
                name="pillar"
                defaultValue={params.pillar || ''}
                className="px-3 py-1.5 rounded-md bg-[hsl(var(--chat-bg))] border border-[hsl(var(--chat-border))] text-xs text-[hsl(var(--foreground))] focus:outline-none focus:border-[hsl(var(--primary))]"
              >
                <option value="">Todos</option>
                {pillars.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-pill text-[10px] uppercase tracking-widest bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-all font-display-uppercase"
              >
                Aplicar
              </button>
            </div>
          )}
        </form>

        {/* Lista de cards */}
        {list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {list.map((p) => {
              const badge = STATUS_BADGE[p.status] ?? STATUS_BADGE.prospect
              return (
                <Link
                  key={p.id}
                  href={`/partnerships/${p.id}`}
                  className="group rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5 hover:border-[hsl(var(--primary))]/40 hover:shadow-luxury-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-medium text-[hsl(var(--foreground))] group-hover:text-[hsl(var(--primary))] transition-colors truncate">
                        {p.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className="inline-block text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-pill bg-[hsl(var(--accent))]/15 text-[hsl(var(--primary))]">
                          {p.pillar}
                        </span>
                        {p.tier !== null && p.tier !== undefined && (
                          <span className="text-[9px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                            Tier {p.tier}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 inline-block px-2.5 py-1 rounded-pill text-[10px] uppercase tracking-widest font-display-uppercase ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {/* Contato preview */}
                  <div className="space-y-1.5 text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--chat-border))] pt-3">
                    {p.contactName && (
                      <ContactLine icon={<User className="w-3 h-3" />} value={p.contactName} />
                    )}
                    {p.contactPhone && (
                      <ContactLine icon={<Phone className="w-3 h-3" />} value={p.contactPhone} />
                    )}
                    {p.contactEmail && (
                      <ContactLine icon={<Mail className="w-3 h-3" />} value={p.contactEmail} />
                    )}
                    {p.contactInstagram && (
                      <ContactLine
                        icon={<AtSign className="w-3 h-3" />}
                        value={p.contactInstagram}
                      />
                    )}
                    {!p.contactName &&
                      !p.contactPhone &&
                      !p.contactEmail &&
                      !p.contactInstagram && (
                        <div className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]/60">
                          Sem contato cadastrado
                        </div>
                      )}
                  </div>

                  {/* CTA chevron */}
                  <div className="mt-3 flex items-center justify-end text-[10px] uppercase tracking-widest text-[hsl(var(--primary))] opacity-60 group-hover:opacity-100 transition-opacity">
                    Abrir
                    <ChevronRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

function ContactLine({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 truncate">
      <span className="text-[hsl(var(--primary))] shrink-0">{icon}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-12 text-center flex flex-col items-center gap-3">
      <Handshake className="w-12 h-12 text-[hsl(var(--muted-foreground))]/40" />
      <p className="text-sm text-[hsl(var(--foreground))]">
        Nenhuma parceria com esses filtros.
      </p>
      <p className="text-xs text-[hsl(var(--muted-foreground))] max-w-xs">
        Limpe os filtros ou cadastre uma nova parceria via Mira no WhatsApp ·
        envie um áudio com o nome e a Mira inicia o DNA check.
      </p>
    </div>
  )
}
