/**
 * /b2b/config/meta · 2-col LGPD (esq) + Sobre (dir).
 *
 * Pedido Alden 2026-04-26 · fusao de governanca + about (dominios "meta"
 * do sistema · pouco uso, mas sempre acessivel). LGPD tem actions
 * destrutivas (anonymize) com confirmacao por motivo (>=5 chars) intacta.
 *
 * URLs antigas (/estudio/lgpd, /b2b/config/sobre) redirecionam pra ca.
 * Server Components (LgpdSection, SobreSection) renderizam cada lado.
 */

import { LgpdSection } from './LgpdSection'
import { SobreSection } from './SobreSection'

export const dynamic = 'force-dynamic'

export default function ConfigMetaPage() {
  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
      <div className="pb-2 border-b border-white/10">
        <span className="eyebrow text-[#C9A96E]">B2B · Configuração</span>
        <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">
          🗂 Meta · governança e about
        </h1>
        <p className="text-[11px] text-[#9CA3AF] mt-1">
          LGPD · ações irreversíveis (anonymize parcerias closed) · esquerda · e
          Sobre · links + metadata · direita.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <section className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex flex-col gap-3 min-w-0">
          <header>
            <h3 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
              ⚖️ LGPD · compliance
            </h3>
            <p className="text-[10px] text-[#6B7280] mt-0.5">
              Anonymize/export PII de parcerias closed · ação irreversível
            </p>
          </header>
          <LgpdSection />
        </section>

        <section className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex flex-col gap-3 min-w-0">
          <header>
            <h3 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
              ℹ️ Sobre · sistema
            </h3>
            <p className="text-[10px] text-[#6B7280] mt-0.5">
              Links úteis + metadata do app (versão, ambiente, supabase)
            </p>
          </header>
          <SobreSection />
        </section>
      </div>
    </div>
  )
}
