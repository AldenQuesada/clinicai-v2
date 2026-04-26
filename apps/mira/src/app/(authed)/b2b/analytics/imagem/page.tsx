/**
 * /b2b/analytics/imagem · subtab "Imagem" do b2bm2.shell.js.
 * Foco nas parcerias de imagem (is_image_partner=true) com cards detalhados.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { ImageFocus } from './ImageFocus'

export const dynamic = 'force-dynamic'

export default async function ImagemPage() {
  const { repos } = await loadMiraServerContext()
  const performance = await repos.b2bMetricsV2.partnerPerformance(90).catch(() => [])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2bm2-wrap">
        <header className="b2bm2-header">
          <div>
            <div className="b2bm2-eyebrow">Programa de parcerias B2B</div>
            <h1 className="b2bm2-title">Imagem</h1>
            <p className="b2bm2-sub">
              Parcerias que carregam a percepção pública da Dra. Mirian. Qualquer
              queda de performance aqui merece atenção imediata.
            </p>
          </div>
        </header>

        <ImageFocus rows={performance} />
      </div>
    </main>
  )
}
