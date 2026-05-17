/**
 * MesaCard · BLOCO 3.2B · card denso da Mesa Operacional.
 *
 * 1 card por lead · campos visuais conforme bucket. Server component
 * (links puros, sem state cliente). Ações são links de navegação · zero
 * mutação neste bloco.
 *
 * Links suportados:
 *   - Lead detail:        /(authed)/leads/[leadId]
 *   - Appointment detail: /crm/agenda/[appointmentId]
 *   - Patient detail:     /crm/pacientes/[patientId]
 *   - Budget detail:      /crm/orcamentos/[budgetId]
 *   - Kanban:             /crm/kanban
 *   - tel:                tel:[phone]
 *   - WhatsApp:           https://wa.me/[phone] (sem mensagem auto)
 */

import Link from 'next/link'
import { Badge } from '@clinicai/ui'
import type { MesaCard as MesaCardType, MesaBucket } from '@clinicai/repositories'

interface Props {
  card: MesaCardType
}

const BUCKET_VARIANT: Record<
  MesaBucket,
  'primary' | 'info' | 'success' | 'neutral' | 'warning' | 'destructive'
> = {
  lead: 'primary',
  agendado: 'info',
  paciente: 'success',
  orcamento: 'info',
  paciente_orcamento: 'success',
  perdido: 'destructive',
  arquivado: 'neutral',
}

const BUCKET_SHORT: Record<MesaBucket, string> = {
  lead: 'Lead',
  agendado: 'Agendado',
  paciente: 'Paciente',
  orcamento: 'Orçamento',
  paciente_orcamento: 'Pac + Orç',
  perdido: 'Perdido',
  arquivado: 'Arquivado',
}

const TEMP_VARIANT: Record<string, 'destructive' | 'warning' | 'info'> = {
  hot: 'destructive',
  warm: 'warning',
  cold: 'info',
  morno: 'warning',
  quente: 'destructive',
  frio: 'info',
}

const TEMP_EMOJI: Record<string, string> = {
  hot: '🔥',
  warm: '⚡',
  cold: '❄',
  quente: '🔥',
  morno: '⚡',
  frio: '❄',
}

function sanitizePhone(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch {
    return iso
  }
}

function formatTime(time: string | null): string | null {
  if (!time) return null
  return time.slice(0, 5)
}

function formatCurrency(value: number | null): string | null {
  if (value == null) return null
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  })
}

export function MesaCardItem({ card }: Props) {
  const phoneDigits = sanitizePhone(card.phone)
  const dateStr = formatDate(card.scheduledDate)
  const timeStr = formatTime(card.startTime)
  const totalStr = formatCurrency(card.budgetTotal)
  const tempKey = (card.temperature ?? '').toLowerCase()
  const tempVariant = TEMP_VARIANT[tempKey]
  const tempEmoji = TEMP_EMOJI[tempKey] ?? null

  return (
    <article className="flex flex-col gap-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] p-2.5 transition-all hover:border-[var(--primary)]/50 hover:shadow-luxury-sm">
      {/* Header · nome + bucket badge + temperatura */}
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/leads/${card.leadId}`}
            className="block truncate text-sm font-semibold text-[var(--foreground)] hover:text-[var(--primary)]"
            title={card.name ?? ''}
          >
            {card.name?.trim() || '(sem nome)'}
          </Link>
          {card.phone ? (
            <p className="truncate text-[11px] text-[var(--muted-foreground)]">
              {card.phone}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={BUCKET_VARIANT[card.bucket]} size="sm">
            {BUCKET_SHORT[card.bucket]}
          </Badge>
          {tempVariant ? (
            <Badge variant={tempVariant} size="sm">
              {tempEmoji ? `${tempEmoji} ` : ''}
              {card.temperature}
            </Badge>
          ) : null}
        </div>
      </header>

      {/* Meta · profissional / procedimento / data-hora */}
      {(card.professionalName || card.procedureName || dateStr) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--muted-foreground)]">
          {dateStr || timeStr ? (
            <span className="font-medium text-[var(--foreground)]">
              {dateStr ?? ''}
              {dateStr && timeStr ? ' · ' : ''}
              {timeStr ?? ''}
            </span>
          ) : null}
          {card.professionalName ? (
            <span className="truncate">👤 {card.professionalName}</span>
          ) : null}
          {card.procedureName ? (
            <span className="truncate">💼 {card.procedureName}</span>
          ) : null}
        </div>
      )}

      {/* Orçamento · status + total */}
      {card.budgetId ? (
        <div className="flex items-center gap-2 text-[11px]">
          {card.budgetStatus ? (
            <span className="rounded bg-[var(--color-border-soft)]/40 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
              {card.budgetStatus}
            </span>
          ) : null}
          {totalStr ? (
            <span className="font-medium text-[var(--foreground)]">{totalStr}</span>
          ) : null}
        </div>
      ) : null}

      {/* Lost · mostra de qual phase veio se for perdido */}
      {card.bucket === 'perdido' && card.lostFromPhase ? (
        <p className="text-[10px] text-[var(--muted-foreground)]">
          Perdido em:{' '}
          <span className="font-medium text-rose-600 dark:text-rose-400">
            {card.lostFromPhase}
          </span>
        </p>
      ) : null}

      {/* Origem · só se tiver */}
      {card.source ? (
        <p className="text-[10px] text-[var(--muted-foreground)]">
          Origem: <span className="font-medium">{card.source}</span>
          {card.sourceType ? ` · ${card.sourceType}` : ''}
        </p>
      ) : null}

      {/* Footer · ações como links */}
      <footer className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
        <Link
          href={`/leads/${card.leadId}`}
          className="rounded border border-[var(--border)] px-1.5 py-0.5 font-display-uppercase tracking-widest text-[var(--foreground)] hover:bg-[var(--color-border-soft)]/40"
        >
          Lead
        </Link>
        {card.appointmentId ? (
          <Link
            href={`/crm/agenda/${card.appointmentId}`}
            className="rounded border border-[var(--border)] px-1.5 py-0.5 font-display-uppercase tracking-widest text-[var(--foreground)] hover:bg-[var(--color-border-soft)]/40"
          >
            Agenda
          </Link>
        ) : null}
        {card.patientId ? (
          <Link
            href={`/crm/pacientes/${card.patientId}`}
            className="rounded border border-[var(--border)] px-1.5 py-0.5 font-display-uppercase tracking-widest text-[var(--foreground)] hover:bg-[var(--color-border-soft)]/40"
          >
            Paciente
          </Link>
        ) : null}
        {card.budgetId ? (
          <Link
            href={`/crm/orcamentos/${card.budgetId}`}
            className="rounded border border-[var(--border)] px-1.5 py-0.5 font-display-uppercase tracking-widest text-[var(--foreground)] hover:bg-[var(--color-border-soft)]/40"
          >
            Orçamento
          </Link>
        ) : null}
        <Link
          href="/crm/kanban"
          className="rounded border border-[var(--border)] px-1.5 py-0.5 font-display-uppercase tracking-widest text-[var(--muted-foreground)] hover:bg-[var(--color-border-soft)]/40"
        >
          Kanban
        </Link>
        {phoneDigits ? (
          <>
            <a
              href={`tel:+${phoneDigits}`}
              className="rounded border border-[var(--border)] px-1.5 py-0.5 font-display-uppercase tracking-widest text-[var(--foreground)] hover:bg-[var(--color-border-soft)]/40"
              title="Ligar"
            >
              Ligar
            </a>
            <a
              href={`https://wa.me/${phoneDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-display-uppercase tracking-widest text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
              title="Abrir WhatsApp web"
            >
              WhatsApp
            </a>
          </>
        ) : null}
      </footer>
    </article>
  )
}
