/**
 * TargetsSection · sec 7 do modal admin legacy.
 *
 * Mirror de `_renderTargets(targets)` em b2b-detail.ui.js (linha 281).
 * Tabela de metas operacionais (vouchers_month, conversion_pct, nps_min, etc).
 *
 * Server Component · 1 RPC b2b_partnership_targets_list.
 */

import { loadMiraServerContext } from '@/lib/server-context'

const KIND_LABELS: Record<string, string> = {
  vouchers_month: 'Vouchers/mes',
  conversion_pct: 'Conversao (%)',
  nps_min: 'NPS minimo',
  contents_month: 'Conteudos/mes',
}

export async function TargetsSection({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const targets = await repos.b2bPartnerships.listTargets(partnershipId)

  if (targets.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="b2b-sec-title">Metas operacionais</h3>
        <div className="b2b-empty" style={{ padding: 12, fontStyle: 'italic' }}>
          Nenhuma meta cadastrada. Aplique o playbook pra criar metas padrao.
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="b2b-sec-title">Metas operacionais</h3>
      <table className="b2b-table">
        <thead>
          <tr>
            <th>Indicador</th>
            <th>Meta</th>
            <th>Origem</th>
            <th>Criada em</th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t.id}>
              <td>{KIND_LABELS[t.kind] || t.kind}</td>
              <td>{Number(t.target).toLocaleString('pt-BR')}</td>
              <td>{t.source ?? '—'}</td>
              <td>{fmtDate(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR')
  } catch {
    return iso
  }
}
