/**
 * Tab "Performance" · classificacao rolling 90d.
 *
 * Logica MEMORY (reference_b2b_thresholds): rolling 90d count de attributions
 * → bucket (novo / ideal / otimo / aceitavel / abaixo / critico / inativa).
 *
 * Definicao Alden:
 *   - novo: < 30d desde activation, ainda em ramp-up
 *   - ideal: >= 6 leads / 90d
 *   - otimo: 4-5 leads / 90d
 *   - aceitavel: 2-3 leads / 90d
 *   - abaixo: 1 lead / 90d
 *   - critico: 0 leads em 90d (mas teve atividade antes)
 *   - inativa: nunca produziu
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type { B2BPartnershipDTO } from '@clinicai/repositories'

interface Bucket {
  key: 'novo' | 'ideal' | 'otimo' | 'aceitavel' | 'abaixo' | 'critico' | 'inativa'
  label: string
  color: string
  description: string
}

const BUCKETS: Record<Bucket['key'], Bucket> = {
  novo: { key: 'novo', label: 'Novo', color: 'bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]', description: 'Em ramp-up · ativada há menos de 30 dias' },
  ideal: { key: 'ideal', label: 'Ideal', color: 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]', description: '6+ leads em 90 dias · meta atingida' },
  otimo: { key: 'otimo', label: 'Ótimo', color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]', description: '4-5 leads em 90 dias' },
  aceitavel: { key: 'aceitavel', label: 'Aceitável', color: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]', description: '2-3 leads em 90 dias' },
  abaixo: { key: 'abaixo', label: 'Abaixo', color: 'bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]', description: '1 lead em 90 dias · revisar' },
  critico: { key: 'critico', label: 'Crítico', color: 'bg-[hsl(var(--danger))]/10 text-[hsl(var(--danger))]', description: 'Zero conversão em 90 dias · acionar' },
  inativa: { key: 'inativa', label: 'Inativa', color: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]', description: 'Nunca produziu lead' },
}

function classify(opts: {
  count90d: number
  hasEverProduced: boolean
  daysSinceActivation: number
}): Bucket {
  if (opts.daysSinceActivation < 30 && opts.count90d === 0) return BUCKETS.novo
  if (opts.count90d >= 6) return BUCKETS.ideal
  if (opts.count90d >= 4) return BUCKETS.otimo
  if (opts.count90d >= 2) return BUCKETS.aceitavel
  if (opts.count90d === 1) return BUCKETS.abaixo
  if (opts.hasEverProduced) return BUCKETS.critico
  return BUCKETS.inativa
}

export async function PerformanceTab({ partnership }: { partnership: B2BPartnershipDTO }) {
  const { repos } = await loadMiraServerContext()

  const [recent90d, allTime] = await Promise.all([
    repos.b2bAttributions.listByPartnership(partnership.id, 200),
    repos.b2bAttributions.listByPartnership(partnership.id, 1),
  ])

  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
  const count90d = recent90d.filter((a) => new Date(a.createdAt).getTime() >= ninetyDaysAgo).length
  const hasEverProduced = allTime.length > 0
  const daysSinceActivation = Math.floor(
    (Date.now() - new Date(partnership.createdAt).getTime()) / (24 * 60 * 60 * 1000),
  )

  const bucket = classify({ count90d, hasEverProduced, daysSinceActivation })

  // Ultimas conversoes
  const recentList = recent90d.slice(0, 10)

  return (
    <div className="space-y-6">
      <section className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
        <h3 className="text-xs font-display-uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-4">
          Classificação rolling 90 dias
        </h3>
        <div className="flex items-start gap-4">
          <div className={`px-4 py-2 rounded-pill text-xs uppercase tracking-widest font-bold ${bucket.color}`}>
            {bucket.label}
          </div>
          <div className="flex-1">
            <p className="text-sm text-[hsl(var(--foreground))]">{bucket.description}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">
              {count90d} {count90d === 1 ? 'lead' : 'leads'} · {daysSinceActivation} dias desde a criação
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-card border border-[hsl(var(--chat-border))] bg-[hsl(var(--chat-panel-bg))] p-5">
        <h3 className="text-xs font-display-uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-4">
          Últimas atribuições · {recentList.length}
        </h3>
        {recentList.length === 0 ? (
          <div className="text-sm text-[hsl(var(--muted-foreground))] py-3">
            Nenhuma atribuição registrada ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {recentList.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between border-b border-[hsl(var(--chat-border))] last:border-0 pb-2"
              >
                <div className="text-xs text-[hsl(var(--foreground))]">
                  {a.attributionType}
                  <span className="ml-2 text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                    weight {a.weight}
                  </span>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
                  {fmt(a.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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
