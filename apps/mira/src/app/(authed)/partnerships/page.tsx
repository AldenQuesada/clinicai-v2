/**
 * Partnerships · lista admin densa · Server Component.
 *
 * Filtros: status (active/paused/dna_check/closed/all), pillar.
 * ADR-012 · usa B2BPartnershipRepository.list.
 *
 * Visual mirror mira-config antigo · status pills `.bcfg-pill` style,
 * row pattern bg-white/[0.02] + border-white/8 + rounded-lg.
 *
 * Click linha → /partnerships/[id] (4 abas).
 */

import Link from 'next/link'
import {
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

const STATUS_PILL: Record<string, string> = {
  active: 'bg-[#10B981]/15 text-[#10B981]',
  paused: 'bg-[#F59E0B]/15 text-[#F59E0B]',
  dna_check: 'bg-[#C9A96E]/18 text-[#C9A96E]',
  prospect: 'bg-white/8 text-[#9CA3AF]',
  contract: 'bg-white/8 text-[#9CA3AF]',
  closed: 'bg-white/8 text-[#6B7280]',
  review: 'bg-[#F59E0B]/15 text-[#F59E0B]',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa',
  paused: 'Pausada',
  dna_check: 'DNA',
  prospect: 'Prospect',
  contract: 'Contrato',
  closed: 'Encerrada',
  review: 'Review',
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

  const counts = list.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[960px] mx-auto px-6 py-6 flex flex-col gap-3">
        {/* Header denso */}
        <div className="flex items-center justify-between pb-2 border-b border-white/8">
          <div>
            <h1 className="text-base font-semibold text-[#F5F5F5]">Parcerias</h1>
            <p className="text-[11px] text-[#9CA3AF] mt-0.5">
              {list.length} parceria{list.length === 1 ? '' : 's'} no recorte
            </p>
          </div>
        </div>

        {/* Status pills · denso */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#6B7280] mr-1">
            Status
          </span>
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-[1px] transition-colors ${
                  isActive
                    ? 'bg-[#C9A96E]/18 text-[#C9A96E] border border-[#C9A96E]/30'
                    : 'bg-white/[0.02] text-[#9CA3AF] border border-white/8 hover:border-white/14 hover:text-[#F5F5F5]'
                }`}
              >
                {opt.label}
                <span
                  className={`text-[9px] font-bold ${
                    isActive ? 'text-[#C9A96E]' : 'text-[#6B7280]'
                  }`}
                >
                  {count}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Pillar filter · gold tinted form */}
        {pillars.length > 0 && (
          <form className="rounded-lg border border-[#C9A96E]/22 bg-[#C9A96E]/[0.04] px-3.5 py-3 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-[1px] text-[#9CA3AF]">
              Pilar
            </span>
            <input type="hidden" name="status" value={params.status || ''} />
            <select
              name="pillar"
              defaultValue={params.pillar || ''}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.02] border border-white/8 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#C9A96E]/50"
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
              className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785] transition-colors"
            >
              Aplicar
            </button>
          </form>
        )}

        {/* Lista densa · row pattern */}
        {list.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-1.5">
            {list.map((p) => {
              const pill = STATUS_PILL[p.status] ?? STATUS_PILL.prospect
              const label = STATUS_LABEL[p.status] ?? p.status
              return (
                <Link
                  key={p.id}
                  href={`/partnerships/${p.id}`}
                  className="group grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3.5 py-3 bg-white/[0.02] border border-white/8 rounded-lg hover:border-white/14 transition-colors"
                >
                  <div className="min-w-0 flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[#F5F5F5] group-hover:text-[#C9A96E] transition-colors truncate">
                        {p.name}
                      </span>
                      <span className="inline-block text-[9px] font-bold uppercase tracking-[1.2px] px-1.5 py-0.5 rounded bg-[#C9A96E]/18 text-[#C9A96E]">
                        {p.pillar}
                      </span>
                      {p.tier !== null && p.tier !== undefined && (
                        <span className="text-[9px] uppercase tracking-[1.2px] text-[#6B7280] font-mono">
                          T{p.tier}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-[#9CA3AF] flex-wrap">
                      {p.contactName && (
                        <ContactLine icon={<User className="w-3 h-3" />} value={p.contactName} />
                      )}
                      {p.contactPhone && (
                        <ContactLine icon={<Phone className="w-3 h-3" />} value={p.contactPhone} mono />
                      )}
                      {p.contactEmail && (
                        <ContactLine icon={<Mail className="w-3 h-3" />} value={p.contactEmail} />
                      )}
                      {p.contactInstagram && (
                        <ContactLine icon={<AtSign className="w-3 h-3" />} value={p.contactInstagram} />
                      )}
                      {!p.contactName &&
                        !p.contactPhone &&
                        !p.contactEmail &&
                        !p.contactInstagram && (
                          <span className="text-[10px] uppercase tracking-[1.2px] text-[#6B7280]">
                            Sem contato
                          </span>
                        )}
                    </div>
                  </div>

                  <span
                    className={`shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] ${pill}`}
                  >
                    {label}
                  </span>

                  <ChevronRight className="w-4 h-4 text-[#6B7280] group-hover:text-[#C9A96E] group-hover:translate-x-0.5 transition-all" />
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

function ContactLine({ icon, value, mono }: { icon: React.ReactNode; value: string; mono?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 truncate">
      <span className="text-[#6B7280] shrink-0">{icon}</span>
      <span className={`truncate ${mono ? 'font-mono text-[10.5px]' : ''}`}>{value}</span>
    </span>
  )
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.02] p-8 text-center flex flex-col gap-2">
      <p className="text-sm text-[#F5F5F5]">Nenhuma parceria com esses filtros.</p>
      <p className="text-[11px] text-[#9CA3AF] max-w-md mx-auto">
        Limpe os filtros ou cadastre uma nova parceria via Mira no WhatsApp ·
        envie um áudio com o nome e a Mira inicia o DNA check.
      </p>
    </div>
  )
}
