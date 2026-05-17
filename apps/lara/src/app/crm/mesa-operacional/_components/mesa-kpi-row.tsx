/**
 * MesaKpiRow · BLOCO 3.2B · 7 KPI cards · 1 por bucket.
 *
 * Cada card clicável filtra a Mesa pelo bucket (via URL searchParams).
 * Bucket ativo recebe destaque visual. Server component (Link puro).
 */

import Link from 'next/link'
import { MESA_BUCKETS, type MesaBucket, type MesaBucketResult } from '@clinicai/repositories'

interface Props {
  buckets: MesaBucketResult[]
  activeBucket: MesaBucket | 'all'
}

const BUCKET_TONE: Record<MesaBucket, { color: string; bg: string; border: string }> = {
  lead: {
    color: 'text-[var(--primary)]',
    bg: 'bg-[var(--primary)]/5',
    border: 'border-[var(--primary)]/30',
  },
  agendado: {
    color: 'text-sky-700 dark:text-sky-300',
    bg: 'bg-sky-500/5',
    border: 'border-sky-500/30',
  },
  paciente: {
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-500/5',
    border: 'border-emerald-500/30',
  },
  orcamento: {
    color: 'text-blue-700 dark:text-blue-300',
    bg: 'bg-blue-500/5',
    border: 'border-blue-500/30',
  },
  paciente_orcamento: {
    color: 'text-teal-700 dark:text-teal-300',
    bg: 'bg-teal-500/5',
    border: 'border-teal-500/30',
  },
  perdido: {
    color: 'text-rose-700 dark:text-rose-300',
    bg: 'bg-rose-500/5',
    border: 'border-rose-500/30',
  },
  arquivado: {
    color: 'text-[var(--muted-foreground)]',
    bg: 'bg-[var(--color-border-soft)]/20',
    border: 'border-[var(--border)]',
  },
}

const SHORT_LABEL: Record<MesaBucket, string> = {
  lead: 'Leads',
  agendado: 'Agendados',
  paciente: 'Pacientes',
  orcamento: 'Orçamentos',
  paciente_orcamento: 'Pac + Orç',
  perdido: 'Perdidos',
  arquivado: 'Arquivados',
}

export function MesaKpiRow({ buckets, activeBucket }: Props) {
  const byBucket = new Map(buckets.map((b) => [b.bucket, b]))

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {MESA_BUCKETS.map((b) => {
        const stat = byBucket.get(b)
        const tone = BUCKET_TONE[b]
        const isActive = activeBucket === b
        const total = stat?.total ?? 0
        return (
          <Link
            key={b}
            href={`/crm/mesa-operacional?bucket=${b}`}
            className={[
              'flex flex-col gap-1 rounded-md border p-2 transition-all hover:shadow-luxury-sm',
              tone.border,
              tone.bg,
              isActive ? 'ring-2 ring-[var(--primary)] ring-offset-1 ring-offset-[var(--background)]' : '',
            ].join(' ')}
          >
            <span className="text-[9px] font-display-uppercase tracking-widest text-[var(--muted-foreground)]">
              {SHORT_LABEL[b]}
            </span>
            <span className={`text-xl font-semibold ${tone.color}`}>{total}</span>
          </Link>
        )
      })}
    </div>
  )
}
