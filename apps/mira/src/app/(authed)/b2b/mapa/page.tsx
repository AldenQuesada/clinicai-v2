/**
 * /b2b/mapa · REPLICA 1:1 do `b2b-map.ui.js` (tab Mapa).
 *
 * Server component carrega geo list via repo.
 * MapClient renderiza Leaflet on-demand (CDN dinâmico).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { MapClient } from './MapClient'

export const dynamic = 'force-dynamic'

export default async function MapaPage() {
  const { repos } = await loadMiraServerContext()
  const points = await repos.b2bGeo.list().catch(() => [])
  const hasPoints = points.some((p) => p.lat != null && p.lng != null)

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div className="b2b-map-wrap">
          <div className="b2b-map-hdr">
            <div>
              <div className="b2b-sec-title" style={{ margin: 0 }}>
                Mapa vivo · parcerias em Maringá
              </div>
              <div className="b2b-map-legend">
                <span>
                  <i style={{ background: '#10B981' }} />
                  Saudável
                </span>
                <span>
                  <i style={{ background: '#F59E0B' }} />
                  Atenção
                </span>
                <span>
                  <i style={{ background: '#EF4444' }} />
                  Crítica
                </span>
                <span>
                  <i style={{ background: '#94A3B8' }} />
                  Sem dado
                </span>
              </div>
            </div>
            <div className="b2b-map-hint">Tamanho = Tier · Clique para abrir detalhe</div>
          </div>

          {hasPoints ? (
            <MapClient points={points} />
          ) : (
            <div className="b2b-map-empty">
              Nenhuma parceria com coordenadas ainda.
              <br />
              Edite uma parceria e preencha latitude/longitude pra aparecer aqui.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
