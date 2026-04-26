/**
 * B2BHero · brand banner global "Círculo Mirian de Paula".
 *
 * Replica EXATAMENTE o header do painel.miriandpaula.com.br/b2b-partners.html
 * (clinic-dashboard css/b2b.css linhas 37-52). Pedido Alden 2026-04-26: sempre
 * visivel, global · aparece abaixo do AppHeaderThin em todas as paginas Mira.
 *
 * HTML mirror 1:1 do b2b-shell.ui.js linhas 106-111:
 *   <header class="b2b-header">
 *     <div class="b2b-header-top">
 *       <div class="b2b-header-left">
 *         <div class="b2b-eyebrow">Círculo Mirian de Paula</div>
 *         <h1 class="b2b-title">Programa de <em>parcerias B2B</em></h1>
 *       </div>
 *     </div>
 *   </header>
 *
 * CSS vive em apps/mira/src/app/b2b-hero.css (importado pelo globals.css).
 * Wrap b2b-hero-wrap aplica padding match com b2b-page-container do original.
 */

export function B2BHero() {
  return (
    <div className="b2b-hero-wrap">
      <header className="b2b-header">
        <div className="b2b-header-top">
          <div className="b2b-header-left">
            <div className="b2b-eyebrow">Círculo Mirian de Paula</div>
            <h1 className="b2b-title">
              Programa de <em>parcerias B2B</em>
            </h1>
          </div>
        </div>
      </header>
    </div>
  )
}
