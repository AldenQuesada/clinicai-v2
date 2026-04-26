/**
 * Tab Pessoas · 2 blocos lado a lado (pedido Alden 2026-04-26).
 *
 * ESQUERDA · Admins · b2b_admin_phones (phones autorizados a aprovar B2B)
 * DIREITA  · Profissionais · wa_numbers professional_private (acesso Mira via WA)
 *
 * Substitui /b2b/config/admins e antigo /configuracoes?tab=professionals.
 *
 * Server fetch paralelo · cada bloco usa seu Client Component existente
 * (AdminsClient, ProfessionalsClient) sem reescrever.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { AdminsClient } from '../b2b/config/admins/AdminsClient'
import { ProfessionalsClient } from './ProfessionalsClient'

export async function PessoasTab() {
  const { ctx, repos } = await loadMiraServerContext()
  const [adminPhones, numbers, professionals, quotasToday] = await Promise.all([
    repos.b2bAdminPhones.list().catch(() => []),
    repos.waNumbers.listProfessionalPrivate(ctx.clinic_id).catch(() => []),
    repos.professionalProfiles.listActiveWithPhone().catch(() => []),
    repos.waNumbers.queriesByProfessionalToday().catch(() => ({})),
  ])

  return (
    <div
      className="cfg-pessoas-grid"
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
            🛡 Admins · aprovacao B2B
          </h3>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            Phones autorizados a criar/aprovar parcerias (b2b_admin_phones)
          </p>
        </header>
        <AdminsClient initial={adminPhones} />
      </section>

      <section className="bg-white/[0.02] border border-white/10 rounded-lg p-4 flex flex-col gap-3 min-w-0">
        <header>
          <h3 className="text-[12px] font-bold uppercase tracking-[1.4px] text-[#C9A96E]">
            👥 Profissionais · acesso Mira
          </h3>
          <p className="text-[10px] text-[#6B7280] mt-0.5">
            WhatsApp dos profissionais com acesso ao chat Mira (wa_numbers)
          </p>
        </header>
        <ProfessionalsClient
          initialNumbers={numbers}
          professionals={professionals}
          quotasToday={quotasToday}
        />
      </section>
    </div>
  )
}
