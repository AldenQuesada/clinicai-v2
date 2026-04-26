/**
 * /b2b/config/sobre · espelho 1:1 de `b2b-config-about.ui.js`.
 *
 * Links úteis + metadata do sistema. Sem estado nem interactividade.
 */

import { SobreLoadedAt } from './SobreLoadedAt'

export const dynamic = 'force-dynamic'

const PAINEL_URL = process.env.NEXT_PUBLIC_PAINEL_URL || 'https://painel.miriandpaula.com.br'

const LINKS = [
  { href: PAINEL_URL, label: 'Painel CRM (clinic-dashboard)', icon: '🏠', external: true },
  { href: '/b2b/analytics', label: 'Analytics B2B', icon: '📊', external: false },
  {
    href: PAINEL_URL + '/parceiro.html',
    label: 'Painel parceira (base)',
    icon: '🔗',
    external: true,
  },
  {
    href: 'https://github.com/AldenQuesada/clinicai-v2',
    label: 'Repositório GitHub',
    icon: '💻',
    external: true,
  },
] as const

const SUPABASE_PROJECT = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || 'oqboitkpcvuaudouwvkl'

export default function ConfigSobrePage() {
  return (
    <div className="bcfg-body">
      <div className="bcfg-section-sub">Links úteis</div>
      <div className="bcfg-links">
        {LINKS.map((l) => (
          <a
            key={l.href}
            className="bcfg-link"
            href={l.href}
            target={l.external ? '_blank' : undefined}
            rel={l.external ? 'noopener' : undefined}
          >
            <span>{l.icon}</span>
            <span>{l.label}</span>
            {l.external ? <small className="bcfg-dim">↗</small> : null}
          </a>
        ))}
      </div>

      <div className="bcfg-section-sub">Sobre o sistema</div>
      <div className="bcfg-about">
        <div className="bcfg-about-row">
          <span>Projeto</span>
          <strong>ClinicAI · clinicai-v2 (Mira app)</strong>
        </div>
        <div className="bcfg-about-row">
          <span>Clínica</span>
          <strong>Mirian de Paula</strong>
        </div>
        <div className="bcfg-about-row">
          <span>Ambiente</span>
          <strong>{process.env.NODE_ENV === 'production' ? 'produção' : process.env.NODE_ENV || 'desenvolvimento'}</strong>
        </div>
        <div className="bcfg-about-row">
          <span>Supabase project</span>
          <strong>{SUPABASE_PROJECT}</strong>
        </div>
        <div className="bcfg-about-row">
          <span>Dashboard carregado em</span>
          <SobreLoadedAt />
        </div>
      </div>
    </div>
  )
}
