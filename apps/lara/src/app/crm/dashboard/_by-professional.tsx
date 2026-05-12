/**
 * ByProfessionalTable · server component · tabela com aggregates por profissional.
 * Inclui linha "zero" para profissionais ativos sem appointments no período.
 */

import { Card, CardHeader, CardTitle, CardContent } from '@clinicai/ui'
import type { CrmDashboardByProfessional } from '@clinicai/repositories'

interface Props {
  rows: CrmDashboardByProfessional[]
}

export function ByProfessionalTable({ rows }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agendamentos por profissional</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--muted-foreground)]">
            Nenhum profissional com agenda habilitada · habilite em /configuracoes
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                  <th className="py-2 pr-3">Profissional</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">Agendado</th>
                  <th className="py-2 pr-3 text-right">Confirm/Atend</th>
                  <th className="py-2 pr-3 text-right">Finalizado</th>
                  <th className="py-2 pr-3 text-right">No-show</th>
                  <th className="py-2 pr-3 text-right">Cancelado</th>
                  <th className="py-2 pr-3 text-right">Bloqueado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.professionalId}
                    className="border-b border-[var(--border)]/40 hover:bg-[var(--color-border-soft)]/30"
                  >
                    <td className="py-2 pr-3">
                      <div className="font-semibold text-[var(--foreground)]">
                        {r.displayName}
                      </div>
                      {r.specialty && (
                        <div className="text-[10px] text-[var(--muted-foreground)]">
                          {r.specialty}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">{r.total}</td>
                    <td className="py-2 pr-3 text-right">{r.agendado}</td>
                    <td className="py-2 pr-3 text-right">{r.confirmado}</td>
                    <td className="py-2 pr-3 text-right text-emerald-700 dark:text-emerald-300">
                      {r.finalizado}
                    </td>
                    <td className="py-2 pr-3 text-right text-[var(--destructive)]">
                      {r.noShow}
                    </td>
                    <td className="py-2 pr-3 text-right text-[var(--destructive)]">
                      {r.cancelado}
                    </td>
                    <td className="py-2 pr-3 text-right text-[var(--muted-foreground)]">
                      {r.bloqueado}
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
