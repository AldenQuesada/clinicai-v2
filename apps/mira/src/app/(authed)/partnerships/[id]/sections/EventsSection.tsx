/**
 * EventsSection · sec 8 do modal admin legacy.
 *
 * Mirror de `_renderEvents(events)` em b2b-detail.ui.js (linha 291).
 * Tabela de exposicoes/eventos (palestras, posts, newsletters).
 *
 * Server Component · 1 RPC b2b_partnership_events_list.
 */

import { loadMiraServerContext } from '@/lib/server-context'

const EVENT_LABELS: Record<string, string> = {
  palestra: 'Palestra',
  evento_presencial: 'Evento presencial',
  email_blast: 'E-mail blast',
  post_exclusivo: 'Post exclusivo',
  mencao_stories: 'Mencao stories',
  newsletter: 'Newsletter',
  outro: 'Outro',
}

export async function EventsSection({ partnershipId }: { partnershipId: string }) {
  const { repos } = await loadMiraServerContext()
  const events = await repos.b2bPartnerships.listEvents(partnershipId)

  if (events.length === 0) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="b2b-sec-title">Eventos / exposicoes</h3>
        <div className="b2b-empty" style={{ padding: 12, fontStyle: 'italic' }}>
          Nenhum evento registrado ainda. Use a acao "Alcance do grupo" pra
          registrar palestras e exposicoes.
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="b2b-sec-title">Eventos / exposicoes</h3>
      <table className="b2b-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Titulo</th>
            <th>Data</th>
            <th>Alcance</th>
            <th>Leads</th>
            <th>Convs</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{EVENT_LABELS[e.event_type] || e.event_type}</td>
              <td>{e.title}</td>
              <td>{fmtDate(e.date)}</td>
              <td>{e.reach}</td>
              <td>{e.leads}</td>
              <td>{e.conversions ?? '—'}</td>
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
