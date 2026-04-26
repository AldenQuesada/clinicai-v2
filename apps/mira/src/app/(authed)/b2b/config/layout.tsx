/**
 * /b2b/config/* · layout shell ESPELHO 1:1 do `b2b-config.shell.ui.js`.
 *
 * Wrapper bcfg-wrap · header com descricao da subtab + body. As 5 sub-tabs
 * (Admins, Padroes, Saude, Auditoria, Sobre) ja sao renderizadas pela
 * AppHeader · este layout so adiciona a moldura comum.
 */

import { headers } from 'next/headers'

const TAB_DESCS: Record<string, string> = {
  '/b2b/config/admins':
    'Phones autorizados a agir como admin no WhatsApp da Mira',
  '/b2b/config/padroes':
    'Valores default aplicados a cada nova parceria',
  '/b2b/config/saude':
    'Snapshot de dispatch, insights, vouchers, contagens',
  '/b2b/config/auditoria':
    'Últimas 30 alterações registradas no sistema',
  '/b2b/config/sobre':
    'Links úteis + metadata do sistema',
}

export default async function B2BConfigLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const h = await headers()
  const raw = h.get('x-invoke-path') ?? h.get('x-pathname') ?? ''
  const path = new URL(raw, 'http://x').pathname
  const desc = TAB_DESCS[path] || ''

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div className="bcfg-wrap">
          {desc ? (
            <div className="bcfg-active-head">
              <span className="bcfg-dim">{desc}</span>
            </div>
          ) : null}
          <div className="bcfg-active-body">{children}</div>
        </div>
      </div>
    </main>
  )
}
