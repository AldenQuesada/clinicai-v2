/**
 * MesaBoard · BLOCO 3.2B · grid de seções por bucket.
 *
 * Modos:
 *   - activeBucket === 'all': mostra 7 seções compactas, max 12 cards cada
 *     (limitPerBucket=12 vindo do page.tsx) · ideal pra panorama operacional
 *     da secretária.
 *   - activeBucket === '<bucket>': mostra 1 seção grande com até 50 cards.
 *
 * Server component · sem state · responsivo via Tailwind.
 */

import Link from 'next/link'
import { EmptyState } from '@clinicai/ui'
import type { MesaBucket, MesaBucketResult } from '@clinicai/repositories'
import { MesaCardItem } from './mesa-card'

interface Props {
  buckets: MesaBucketResult[]
  activeBucket: MesaBucket | 'all'
  grandTotal: number
}

const BUCKET_DESCRIPTION: Record<MesaBucket, string> = {
  lead: 'Pipeline de captação · sem appointment, sem patient, sem orçamento',
  agendado: 'Têm appointment ativo · pré-consulta da secretária',
  paciente: 'Já viraram pacientes · fidelização e retorno',
  orcamento: 'Têm orçamento aberto · follow-up comercial',
  paciente_orcamento: 'Pacientes com orçamento adicional · cross-sell',
  perdido: 'Lifecycle perdido · candidatos a recuperação',
  arquivado: 'Lifecycle arquivado · histórico (read-only no MVP)',
}

const BUCKET_HUES: Record<MesaBucket, string> = {
  lead: 'border-[var(--primary)]/30',
  agendado: 'border-sky-500/30',
  paciente: 'border-emerald-500/30',
  orcamento: 'border-blue-500/30',
  paciente_orcamento: 'border-teal-500/30',
  perdido: 'border-rose-500/30',
  arquivado: 'border-[var(--border)]',
}

export function MesaBoard({ buckets, activeBucket, grandTotal }: Props) {
  // Single-bucket mode · 1 seção grande
  if (activeBucket !== 'all') {
    const target = buckets.find((b) => b.bucket === activeBucket)
    if (!target) return null
    return (
      <section
        className={`rounded-md border bg-[var(--card)] p-3 ${BUCKET_HUES[activeBucket]}`}
      >
        <header className="mb-3 flex items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display-uppercase text-sm tracking-widest text-[var(--foreground)]">
              {target.label}
            </h2>
            <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">
              {BUCKET_DESCRIPTION[activeBucket]}
            </p>
          </div>
          <span className="text-xs text-[var(--muted-foreground)]">
            {target.total} {target.total === 1 ? 'lead' : 'leads'}
            {target.cards.length < target.total ? (
              <span className="ml-1 text-[10px]">
                (mostrando {target.cards.length})
              </span>
            ) : null}
          </span>
        </header>
        {target.cards.length === 0 ? (
          <EmptyState
            variant={activeBucket === 'lead' ? 'leads' : 'generic'}
            title="Sem cards neste bucket"
            message="Ajuste os filtros ou tente outro bucket no topo."
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {target.cards.map((c) => (
              <MesaCardItem key={c.leadId} card={c} />
            ))}
          </div>
        )}
      </section>
    )
  }

  // Multi-bucket mode · 7 seções compactas
  if (grandTotal === 0) {
    return (
      <EmptyState
        variant="leads"
        title="Mesa vazia"
        message="Nenhum lead bate com o recorte atual. Limpe os filtros ou comece um novo lead."
        action={{ label: 'Ir para Kanban', href: '/crm/kanban' }}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {buckets.map((stat) => (
        <BucketSection
          key={stat.bucket}
          stat={stat}
        />
      ))}
    </div>
  )
}

function BucketSection({ stat }: { stat: MesaBucketResult }) {
  const hue = BUCKET_HUES[stat.bucket]
  return (
    <section
      className={`flex flex-col gap-2 rounded-md border bg-[var(--card)] p-3 ${hue}`}
    >
      <header className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display-uppercase text-xs tracking-widest text-[var(--foreground)]">
            {stat.label}
          </h3>
          <p className="mt-0.5 truncate text-[10px] text-[var(--muted-foreground)]">
            {BUCKET_DESCRIPTION[stat.bucket]}
          </p>
        </div>
        <Link
          href={`/crm/mesa-operacional?bucket=${stat.bucket}`}
          className="shrink-0 text-[11px] text-[var(--primary)] hover:underline"
        >
          ver todos ({stat.total})
        </Link>
      </header>
      {stat.cards.length === 0 ? (
        <p className="rounded border border-dashed border-[var(--border)] px-2 py-3 text-center text-[11px] text-[var(--muted-foreground)]">
          Sem cards neste bucket.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {stat.cards.map((c) => (
            <MesaCardItem key={c.leadId} card={c} />
          ))}
        </div>
      )}
    </section>
  )
}
