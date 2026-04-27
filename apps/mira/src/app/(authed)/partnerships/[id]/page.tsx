/**
 * Partnership detail · full page (URL direta · share).
 *
 * Quando user clica numa parceria do /partnerships, Next intercepta a
 * navegacao e renderiza @modal/(.)[id]/page.tsx (overlay sobre lista).
 * ESTA pagina renderiza quando:
 *   - URL acessada direto (paste · bookmark · reload)
 *   - Hard navigation (browser back/forward · email link · external)
 *
 * Conteudo compartilhado em PartnershipDetailLayout · ambos contextos
 * usam o mesmo (zero duplicacao).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'
import {
  PartnershipDetailLayout,
  VALID_TABS,
  type DetailTabKey,
} from './PartnershipDetailLayout'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function PartnershipDetailPage({ params, searchParams }: PageProps) {
  let id = ''
  let activeTab: DetailTabKey = 'detail'
  try {
    const p = await params
    id = p.id
    const sp = await searchParams
    console.log('[detail-page] start id=' + id + ' tab=' + (sp.tab || 'detail'))

    const { ctx, repos } = await loadMiraServerContext()
    console.log('[detail-page] ctx loaded clinic=' + ctx.clinic_id)

    const partnership = await repos.b2bPartnerships.getById(id)
    console.log('[detail-page] partnership ' + (partnership ? 'OK' : 'NULL'))

    if (!partnership || partnership.clinicId !== ctx.clinic_id) {
      notFound()
    }

    activeTab = sp.tab && VALID_TABS.includes(sp.tab) ? (sp.tab as DetailTabKey) : 'detail'
    const canManage = !ctx.role || ['owner', 'admin'].includes(ctx.role)

    const managers =
      activeTab === 'detail'
        ? await repos.b2bCollab.teamManagers().catch((e) => {
            console.error('[detail-page] teamManagers fail', (e as Error).message)
            return []
          })
        : []
    console.log('[detail-page] rendering tab=' + activeTab + ' managers=' + managers.length)

    return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="max-w-[1080px] mx-auto px-7 pt-7">
        <Link href="/partnerships" className="b2b-back-link mb-3">
          <ArrowLeft className="w-3 h-3" />
          Voltar
        </Link>
      </div>
      <PartnershipDetailLayout
        partnership={partnership}
        activeTab={activeTab}
        canManage={canManage}
        managers={managers.map((m) => m.name || m.email || 'sem-nome').filter(Boolean)}
      />
    </main>
  )
  } catch (err) {
    const e = err as Error
    console.error('[detail-page] CRASH', {
      id,
      tab: activeTab,
      message: e.message,
      name: e.name,
      stack: e.stack,
    })
    throw err
  }
}
