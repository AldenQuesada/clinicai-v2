/**
 * /semana/renovacoes · countdown de renovacoes proximas.
 *
 * Calculo: expiry = createdAt + (contractDurationMonths ?? 12 meses).
 * Buckets:
 *   - Vencidas (expiry no passado, ainda active)
 *   - 7 dias
 *   - 30 dias
 *   - 60 dias
 *
 * Sem migration nova · usa createdAt + contract_duration_months ja
 * existentes em b2b_partnerships.
 */

import Link from 'next/link'
import { CalendarClock, AlertTriangle, ArrowRight } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'

const DEFAULT_DURATION_MONTHS = 12

function computeExpiry(createdAt: string, durationMonths: number | null): Date {
  const months = durationMonths ?? DEFAULT_DURATION_MONTHS
  const d = new Date(createdAt)
  d.setMonth(d.getMonth() + months)
  return d
}

function daysUntil(date: Date): number {
  const ms = date.getTime() - Date.now()
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  })
}

interface Renewal {
  id: string
  name: string
  pillar: string | null
  expiry: Date
  daysLeft: number
  durationMonths: number
  customDuration: boolean
}

export default async function RenovacoesPage() {
  const { ctx, repos } = await loadMiraServerContext()

  // Pega partnerships em status que faz sentido renovar
  const candidates = await repos.b2bPartnerships.list(ctx.clinic_id, {})
  const renewable = candidates.filter((p) =>
    ['active', 'review', 'contract', 'paused'].includes(p.status),
  )

  const renewals: Renewal[] = renewable.map((p) => {
    const expiry = computeExpiry(p.createdAt, p.contractDurationMonths)
    return {
      id: p.id,
      name: p.name,
      pillar: p.pillar,
      expiry,
      daysLeft: daysUntil(expiry),
      durationMonths: p.contractDurationMonths ?? DEFAULT_DURATION_MONTHS,
      customDuration: p.contractDurationMonths != null,
    }
  })

  const overdue = renewals.filter((r) => r.daysLeft < 0).sort((a, b) => a.daysLeft - b.daysLeft)
  const in7 = renewals.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 7)
  const in30 = renewals.filter((r) => r.daysLeft > 7 && r.daysLeft <= 30)
  const in60 = renewals.filter((r) => r.daysLeft > 30 && r.daysLeft <= 60)
  const future = renewals.filter((r) => r.daysLeft > 60).sort((a, b) => a.daysLeft - b.daysLeft)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[920px] mx-auto px-6 py-6 flex flex-col gap-5">
        <div className="pb-2 border-b border-white/8">
          <span className="eyebrow text-[#C9A96E]">Semana · Renovações</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
            Contratos próximos do vencimento
          </h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Cálculo: data de cadastro + duração do contrato (default 12 meses quando não definido).
          </p>
        </div>

        {/* Resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Bucket label="Vencidas" count={overdue.length} accent="#EF4444" />
          <Bucket label="≤ 7 dias" count={in7.length} accent="#F59E0B" />
          <Bucket label="≤ 30 dias" count={in30.length} accent="#C9A96E" />
          <Bucket label="≤ 60 dias" count={in60.length} accent="#9CA3AF" />
        </div>

        {/* Vencidas */}
        {overdue.length > 0 && (
          <Section title="Vencidas · ação imediata" accent="#EF4444" icon={<AlertTriangle className="w-4 h-4" />}>
            {overdue.map((r) => (
              <RenewalRow key={r.id} renewal={r} severity="overdue" />
            ))}
          </Section>
        )}

        {/* 7 dias */}
        {in7.length > 0 && (
          <Section title="Vencendo em até 7 dias" accent="#F59E0B" icon={<CalendarClock className="w-4 h-4" />}>
            {in7.map((r) => (
              <RenewalRow key={r.id} renewal={r} severity="soon" />
            ))}
          </Section>
        )}

        {/* 30 dias */}
        {in30.length > 0 && (
          <Section title="Vencendo em até 30 dias" accent="#C9A96E" icon={<CalendarClock className="w-4 h-4" />}>
            {in30.map((r) => (
              <RenewalRow key={r.id} renewal={r} severity="medium" />
            ))}
          </Section>
        )}

        {/* 60 dias */}
        {in60.length > 0 && (
          <Section title="Vencendo em até 60 dias" accent="#9CA3AF" icon={<CalendarClock className="w-4 h-4" />}>
            {in60.map((r) => (
              <RenewalRow key={r.id} renewal={r} severity="far" />
            ))}
          </Section>
        )}

        {/* Empty state se nenhum bucket urgente */}
        {overdue.length === 0 && in7.length === 0 && in30.length === 0 && in60.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6 text-center text-xs text-[#9CA3AF]">
            Nenhuma renovação nos próximos 60 dias · {future.length} contratos longos.
          </div>
        )}
      </div>
    </main>
  )
}

function Section({
  title,
  accent,
  icon,
  children,
}: {
  title: string
  accent: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2" style={{ color: accent }}>
        {icon}
        <span className="eyebrow" style={{ color: accent }}>
          {title}
        </span>
      </div>
      <div className="rounded-lg border bg-white/[0.02] divide-y divide-white/8" style={{ borderColor: `${accent}30` }}>
        {children}
      </div>
    </section>
  )
}

function Bucket({ label, count, accent }: { label: string; count: number; accent: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="font-display text-3xl leading-none" style={{ color: count > 0 ? accent : '#6B7280' }}>
        {count}
      </div>
      <div className="eyebrow text-[#9CA3AF] mt-2">{label}</div>
    </div>
  )
}

function RenewalRow({
  renewal,
  severity,
}: {
  renewal: Renewal
  severity: 'overdue' | 'soon' | 'medium' | 'far'
}) {
  const accent =
    severity === 'overdue'
      ? '#EF4444'
      : severity === 'soon'
        ? '#F59E0B'
        : severity === 'medium'
          ? '#C9A96E'
          : '#9CA3AF'
  const daysLabel =
    renewal.daysLeft < 0
      ? `${Math.abs(renewal.daysLeft)}d atraso`
      : renewal.daysLeft === 0
        ? 'hoje'
        : `${renewal.daysLeft}d`

  return (
    <Link
      href={`/partnerships/${renewal.id}`}
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-[#F5F0E8] truncate">{renewal.name}</div>
        <div className="eyebrow text-[#9CA3AF] mt-0.5">
          {renewal.pillar || 'sem pilar'} · contrato {renewal.durationMonths}m
          {!renewal.customDuration && (
            <span className="text-[#6B7280]"> (default)</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono text-[12px] font-bold" style={{ color: accent }}>
          {daysLabel}
        </div>
        <div className="eyebrow text-[#6B7280] mt-0.5">{fmtDate(renewal.expiry)}</div>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
    </Link>
  )
}
