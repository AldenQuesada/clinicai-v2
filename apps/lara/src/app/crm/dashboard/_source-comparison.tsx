/**
 * BLOCO 3.3 · Comparativo por origem · tabela responsiva.
 *
 * Agrupa leads por `source` + `source_type` no período. Mostra contagens
 * absolutas (agendado · paciente · orçamento · perdido) e percentuais
 * de agendamento, conversão e perda.
 *
 * Conversão = (paciente + orcamento) / total · pcts já vêm calculados
 * do repository.
 *
 * Server component · sem state · padrão card+tabela do dashboard.
 */

import { Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import type { CrmDashboardSourceRow } from '@clinicai/repositories'

interface Props {
  rows: CrmDashboardSourceRow[]
}

function displayLabel(value: string | null, fallback = '—'): string {
  if (!value || value === '(none)') return fallback
  return value
}

function pctStr(n: number): string {
  return `${n.toFixed(1)}%`
}

function pctTone(n: number, inverted = false): string {
  if (inverted) {
    if (n <= 5) return 'text-emerald-700 dark:text-emerald-300'
    if (n >= 20) return 'text-rose-700 dark:text-rose-300'
    return 'text-[var(--foreground)]'
  }
  if (n >= 50) return 'text-emerald-700 dark:text-emerald-300'
  if (n < 20) return 'text-[var(--muted-foreground)]'
  return 'text-[var(--foreground)]'
}

export function SourceComparison({ rows }: Props) {
  const total = rows.reduce((s, r) => s + r.total, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conversão por origem</CardTitle>
        <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
          {rows.length === 0
            ? 'Sem leads no período.'
            : `Top ${rows.length} origens · ${total.toLocaleString('pt-BR')} leads criados no recorte.`}
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="rounded border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">
            Nenhum lead bateu com o filtro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                  <th className="py-2 pr-3 font-medium">Origem</th>
                  <th className="py-2 pr-3 font-medium">Source type</th>
                  <th className="py-2 pr-3 text-right font-medium">Leads</th>
                  <th className="py-2 pr-3 text-right font-medium">Agendado</th>
                  <th className="py-2 pr-3 text-right font-medium">Paciente</th>
                  <th className="py-2 pr-3 text-right font-medium">Orçamento</th>
                  <th className="py-2 pr-3 text-right font-medium">Perdido</th>
                  <th className="py-2 pr-3 text-right font-medium">% Agendamento</th>
                  <th className="py-2 pr-3 text-right font-medium">% Conversão</th>
                  <th className="py-2 text-right font-medium">% Perda</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={`${r.source ?? '_'}::${r.sourceType ?? '_'}`}
                    className="border-b border-[var(--border)]/50 last:border-0 hover:bg-[var(--color-border-soft)]/30"
                  >
                    <td className="py-2 pr-3 font-medium text-[var(--foreground)]">
                      {displayLabel(r.source)}
                    </td>
                    <td className="py-2 pr-3 text-[var(--muted-foreground)]">
                      {displayLabel(r.sourceType)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.total}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.agendado}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.paciente}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.orcamento}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.perdido}</td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${pctTone(r.pctAgendamento)}`}>
                      {pctStr(r.pctAgendamento)}
                    </td>
                    <td className={`py-2 pr-3 text-right tabular-nums ${pctTone(r.pctConversao)}`}>
                      {pctStr(r.pctConversao)}
                    </td>
                    <td className={`py-2 text-right tabular-nums ${pctTone(r.pctPerda, true)}`}>
                      {pctStr(r.pctPerda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
