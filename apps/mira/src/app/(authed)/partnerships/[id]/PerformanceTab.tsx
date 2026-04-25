/**
 * Tab "Performance" · classificacao rolling 90d.
 *
 * Logica MEMORY (reference_b2b_thresholds): rolling 90d count de attributions
 * → bucket (novo / ideal / otimo / aceitavel / abaixo / critico / inativa).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import type { B2BPartnershipDTO } from '@clinicai/repositories'

interface Bucket {
  key: 'novo' | 'ideal' | 'otimo' | 'aceitavel' | 'abaixo' | 'critico' | 'inativa'
  label: string
  pillClass: string
  description: string
}

const BUCKETS: Record<Bucket['key'], Bucket> = {
  novo: { key: 'novo', label: 'Novo', pillClass: 'bg-[#C9A96E]/18 text-[#C9A96E]', description: 'Em ramp-up · ativada há menos de 30 dias' },
  ideal: { key: 'ideal', label: 'Ideal', pillClass: 'bg-[#10B981]/15 text-[#10B981]', description: '6+ leads em 90 dias · meta atingida' },
  otimo: { key: 'otimo', label: 'Ótimo', pillClass: 'bg-[#10B981]/15 text-[#10B981]', description: '4-5 leads em 90 dias' },
  aceitavel: { key: 'aceitavel', label: 'Aceitável', pillClass: 'bg-[#F59E0B]/15 text-[#F59E0B]', description: '2-3 leads em 90 dias' },
  abaixo: { key: 'abaixo', label: 'Abaixo', pillClass: 'bg-[#F59E0B]/15 text-[#F59E0B]', description: '1 lead em 90 dias · revisar' },
  critico: { key: 'critico', label: 'Crítico', pillClass: 'bg-[#EF4444]/15 text-[#FCA5A5]', description: 'Zero conversão em 90 dias · acionar' },
  inativa: { key: 'inativa', label: 'Inativa', pillClass: 'bg-white/8 text-[#9CA3AF]', description: 'Nunca produziu lead' },
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

  const recentList = recent90d.slice(0, 10)

  return (
    <div className="flex flex-col gap-3">
      {/* Classificacao · health card */}
      <Section title="Classificação rolling 90 dias">
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3.5 flex items-center gap-3">
          <span className={`shrink-0 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[1.2px] ${bucket.pillClass}`}>
            {bucket.label}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#F5F5F5]">{bucket.description}</p>
            <p className="text-[10.5px] text-[#9CA3AF] mt-0.5 font-mono">
              {count90d} {count90d === 1 ? 'lead' : 'leads'} · {daysSinceActivation} dias desde criação
            </p>
          </div>
        </div>
      </Section>

      {/* Atribuicoes recentes */}
      <Section title={`Últimas atribuições · ${recentList.length}`}>
        {recentList.length === 0 ? (
          <div className="rounded-lg border border-white/8 bg-white/[0.02] p-5 text-center text-xs text-[#9CA3AF]">
            Nenhuma atribuição registrada ainda.
          </div>
        ) : (
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3.5 py-1.5 flex flex-col">
            {recentList.map((a, i) => (
              <div
                key={a.id}
                className={`flex items-center justify-between py-2 ${
                  i === recentList.length - 1 ? '' : 'border-b border-dashed border-white/8'
                }`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[#F5F5F5] font-mono text-[11px]">{a.attributionType}</span>
                  <span className="text-[9px] uppercase tracking-[1.2px] text-[#6B7280]">
                    weight {a.weight}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-[1.2px] text-[#9CA3AF] font-mono">
                  {fmt(a.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
        {title}
      </h3>
      {children}
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
