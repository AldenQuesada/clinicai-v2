/**
 * /configuracoes/usuarios/permissoes · Server Component
 *
 * Port 1:1 do clinic-dashboard module-permissions.ui.js (matriz role x modulo)
 * + drawer de override por user (de users-admin.js _renderModuleDetail).
 *
 * Mesmas funcionalidades · mesmas regras · mesmas validacoes.
 */

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { can, type StaffRole } from '@/lib/permissions'
import type {
  StaffMemberDTO,
  ModulePermissionRow,
} from '@clinicai/repositories'
import { PageContainer } from '@/components/page/PageContainer'
import { PageHero } from '@/components/page/PageHero'
import { PermissionsMatrixClient } from './PermissionsMatrixClient'

export const dynamic = 'force-dynamic'

interface PageData {
  staff: StaffMemberDTO[]
  overrides: ModulePermissionRow[]
  myRole: StaffRole | null
}

async function loadData(): Promise<PageData> {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const role = (ctx.role ?? null) as StaffRole | null

    if (!can(role, 'settings:edit')) {
      return { staff: [], overrides: [], myRole: role }
    }

    const [staffRes, overridesRes] = await Promise.all([
      repos.users.listStaff(),
      repos.users.getModulePermissions(),
    ])

    return {
      staff: staffRes.ok ? staffRes.data ?? [] : [],
      overrides: overridesRes.ok ? overridesRes.data ?? [] : [],
      myRole: role,
    }
  } catch (e) {
    console.error('[/configuracoes/usuarios/permissoes] loadData failed:', (e as Error).message)
    return { staff: [], overrides: [], myRole: null }
  }
}

export default async function PermissoesPage() {
  const { staff, overrides, myRole } = await loadData()

  if (!can(myRole, 'settings:edit')) {
    redirect('/configuracoes/usuarios')
  }

  // Ordenar membros: ativos primeiro, owner por ultimo (ja exibido em banner)
  const editableMembers = staff
    .filter((m) => m.isActive && m.role !== 'owner')
    .sort((a, b) => {
      const an = `${a.firstName} ${a.lastName}`.trim() || a.email || ''
      const bn = `${b.firstName} ${b.lastName}`.trim() || b.email || ''
      return an.localeCompare(bn, 'pt-BR')
    })

  return (
    <PageContainer variant="narrow">
      <PageHero
        kicker="Configurações · Equipe"
        title={<>Matriz de <em>permissões</em></>}
        lede="Configure quais módulos cada role acessa. Owner sempre tem acesso total."
        actions={
          <Link
            href="/configuracoes/usuarios"
            className="b2b-btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft className="w-3 h-3" />
            Voltar
          </Link>
        }
      />

      <PermissionsMatrixClient
        initialOverrides={overrides}
        editableMembers={editableMembers}
      />
    </PageContainer>
  )
}
