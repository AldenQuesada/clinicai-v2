/**
 * B2BHero · brand banner global "Círculo Mirian de Paula" + slot pra actions.
 *
 * Versao 2 (2026-04-26 ajuste Alden): hero fica no topo a esquerda · search/
 * bell/+novo/avatar viram children no b2b-header-ctrl (direita) na MESMA
 * linha · sem linha separadora · sem container.
 *
 * Padrao 1:1 do `b2b-shell.ui.js` linhas 106-115:
 *   <header class="b2b-header">
 *     <div class="b2b-header-top">
 *       <div class="b2b-header-left">
 *         <div class="b2b-eyebrow">Círculo Mirian de Paula</div>
 *         <h1 class="b2b-title">Programa de <em>parcerias B2B</em></h1>
 *       </div>
 *       <div class="b2b-header-ctrl">{children}</div>
 *     </div>
 *   </header>
 */

export function B2BHero({ children }: { children?: React.ReactNode }) {
  return (
    <div className="b2b-hero-wrap">
      <header className="b2b-header b2b-header-no-line">
        <div className="b2b-header-top">
          <div className="b2b-header-left">
            <div className="b2b-eyebrow">Círculo Mirian de Paula</div>
            <h1 className="b2b-title">
              Programa de <em>parcerias B2B</em>
            </h1>
          </div>
          {children ? (
            <div className="b2b-header-ctrl">{children}</div>
          ) : null}
        </div>
      </header>
    </div>
  )
}
