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
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div className="mb-8">
          <Link
            href="/configuracoes/usuarios"
            className="inline-flex items-center gap-1.5 text-[11px] tracking-[0.18em] uppercase text-[var(--b2b-text-muted)] hover:text-[var(--b2b-champagne)] transition-colors mb-4"
          >
            <ArrowLeft className="w-3 h-3" />
            Voltar para usuários
          </Link>
          <p className="eyebrow mb-3">Painel · Lara</p>
          <h1 className="font-display text-[40px] leading-tight text-[var(--b2b-ivory)]">
            Permissões por <em>módulo</em>
          </h1>
          <p className="text-[13px] text-[var(--b2b-text-dim)] italic mt-2 max-w-2xl">
            Controle quais funcionalidades cada nível de acesso pode ver. Mudanças aplicam ao
            recarregar. Overrides por usuário sobrepõem a matriz por role.
          </p>
        </div>

        <PermissionsMatrixClient
          initialOverrides={overrides}
          editableMembers={editableMembers}
        />
      </div>
    </main>
  )
}
