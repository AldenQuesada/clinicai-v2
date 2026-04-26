/**
 * /b2b/config/* · layout shell ESPELHO 1:1 do `b2b-config.shell.ui.js`.
 *
 * Wrapper bcfg-wrap · header com descricao da subtab + body. As 5 sub-tabs
 * (Admins, Padroes, Saude, Auditoria, Sobre) ja sao renderizadas pela
 * AppHeader · este layout so adiciona a moldura comum.
 *
 * 2026-04-26 · paths em FULL_WIDTH_PATHS (regras, meta) ignoram bcfg-wrap
 * (860px max) porque renderizam 2 blocos lado a lado e precisam de
 * 1200px de wrap proprio.
 */

import { headers } from 'next/headers'

const TAB_DESCS: Record<string, string> = {
  '/b2b/config/admins':
    'Phones autorizados a agir como admin no WhatsApp da Mira',
  '/b2b/config/padroes':
    'Valores default aplicados a cada nova parceria',
  '/b2b/config/tiers':
    'Labels, cores e defaults configuraveis dos 3 tiers (1/2/3) — herdados ao cadastrar parceria',
  '/b2b/config/funnel':
    'Benchmarks de step-rate do funil (delivered → opened → scheduled → redeemed → purchased) usados em /b2b/analytics',
  '/b2b/config/playbooks':
    'Templates aplicados pelo botão "+ Aplicar Playbook" em cada parceria · 3 kinds (onboarding, retenção, renovação)',
  '/b2b/config/saude':
    'Snapshot de dispatch, insights, vouchers, contagens',
  '/b2b/config/auditoria':
    'Últimas 30 alterações registradas no sistema',
  '/b2b/config/sobre':
    'Links úteis + metadata do sistema',
}

/** Paths que renderizam fusoes 2-col · saem do bcfg-wrap pra ter wrap maior. */
const FULL_WIDTH_PATHS = new Set<string>([
  '/b2b/config/regras',
  '/b2b/config/meta',
])

export default async function B2BConfigLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const h = await headers()
  // x-pathname é injetado pelo middleware (req headers); x-invoke-path é
  // legado de versoes anteriores do Next que nao funciona em Next 16.
  const raw = h.get('x-pathname') ?? h.get('x-invoke-path') ?? ''
  const path = raw.split('?')[0] || ''

  // Paths 2-col renderizam direto sem bcfg-wrap (cada page tem wrap proprio)
  if (FULL_WIDTH_PATHS.has(path)) {
    return (
      <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
        <div className="px-6 py-6">{children}</div>
      </main>
    )
  }

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
