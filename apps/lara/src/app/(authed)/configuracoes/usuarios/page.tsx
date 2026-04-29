/**
 * /configuracoes/usuarios · Server Component.
 *
 * Port do clinic-dashboard "users-admin" pra Next.js + React.
 * Lista membros + KPIs + convites pendentes · acoes via UsersAdminClient.
 */

import { redirect } from 'next/navigation'
import { loadServerReposContext } from '@/lib/repos'
import { can } from '@/lib/permissions'
import type {
  StaffMemberDTO,
  PendingInviteDTO,
  StaffRole,
} from '@clinicai/repositories'
import { UsersAdminClient } from './UsersAdminClient'

export const dynamic = 'force-dynamic'

interface PageData {
  staff: StaffMemberDTO[]
  invites: PendingInviteDTO[]
  myUserId: string | null
  myRole: StaffRole | null
}

async function loadData(): Promise<PageData> {
  try {
    const { ctx, repos } = await loadServerReposContext()
    const role = (ctx.role ?? null) as StaffRole | null

    if (!can(role, 'users:view')) {
      return { staff: [], invites: [], myUserId: ctx.user_id ?? null, myRole: role }
    }

    const [staffRes, invitesRes] = await Promise.all([
      repos.users.listStaff(),
      can(role, 'invites:revoke')
        ? repos.users.listPendingInvites()
        : Promise.resolve({ ok: true, data: [], error: null }),
    ])

    return {
      staff: staffRes.ok ? staffRes.data ?? [] : [],
      invites: invitesRes.ok ? invitesRes.data ?? [] : [],
      myUserId: ctx.user_id ?? null,
      myRole: role,
    }
  } catch (e) {
    console.error('[/configuracoes/usuarios] loadData failed:', (e as Error).message)
    return { staff: [], invites: [], myUserId: null, myRole: null }
  }
}

export default async function UsuariosPage() {
  const { staff, invites, myUserId, myRole } = await loadData()

  if (!can(myRole, 'users:view')) {
    redirect('/dashboard')
  }

  const activeStaff = staff.filter((m) => m.isActive)
  const inactiveStaff = staff.filter((m) => !m.isActive)
  const ownerCount = staff.filter((m) => m.isActive && m.role === 'owner').length

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[var(--b2b-bg-0)]">
      <div className="b2b-page-container">
        <div className="mb-8">
          <p className="eyebrow mb-3">Painel · Lara</p>
          <h1 className="font-display text-[40px] leading-tight text-[var(--b2b-ivory)]">
            Equipe e <em>permissões</em>
          </h1>
          <p className="text-[13px] text-[var(--b2b-text-dim)] italic mt-2 max-w-2xl">
            Quem entra no sistema · que nível de acesso · quais convites estão pendentes.
            Owner controla roles · admin gerencia equipe.
          </p>
        </div>

        <div className="b2b-kpi-grid">
          <div className="b2b-kpi">
            <div className="b2b-kpi-num">{activeStaff.length}</div>
            <div className="b2b-kpi-lbl">Ativos</div>
          </div>
          <div className="b2b-kpi">
            <div className="b2b-kpi-num">{invites.length}</div>
            <div className="b2b-kpi-lbl">Convites pendentes</div>
          </div>
          <div className="b2b-kpi">
            <div className="b2b-kpi-num">{ownerCount}</div>
            <div className="b2b-kpi-lbl">Proprietárias</div>
          </div>
          <div className="b2b-kpi">
            <div className="b2b-kpi-num">{inactiveStaff.length}</div>
            <div className="b2b-kpi-lbl">Inativos</div>
          </div>
        </div>

        <UsersAdminClient
          activeStaff={activeStaff}
          inactiveStaff={inactiveStaff}
          invites={invites}
          myUserId={myUserId}
          myRole={myRole}
        />
      </div>
    </main>
  )
}
