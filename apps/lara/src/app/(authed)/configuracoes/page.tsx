/**
 * /configuracoes · pagina unica com tabs externas (espelho 1:1 legacy).
 *
 * Estrutura legacy clinic-dashboard `page-settings-clinic`:
 *   8 abas: Dados | Equipe | Tecnologias | Salas | Injetaveis | Procedimentos
 *           | Usuarios | Permissoes
 *
 * Lara adicionou +1 ('lara') pra config IA (modelo/budget/limites) que
 * legado nao tem · marcamos visualmente diferente (separador) pra deixar
 * claro que e exclusivo Lara.
 *
 * Selecao via ?tab=X · default 'clinic'. Rotas antigas (/configuracoes/clinica,
 * /configuracoes/usuarios, /configuracoes/usuarios/permissoes) redirecionam
 * pra cá com tab apropriada (ver redirect.ts em cada rota).
 */

import { redirect } from 'next/navigation'
import {
  Home,
  Users,
  Monitor,
  Grid,
  Droplet,
  List,
  Shield,
  Lock,
  Sparkles,
  Construction,
} from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { can, type StaffRole } from '@/lib/permissions'
import type {
  StaffMemberDTO,
  PendingInviteDTO,
  ModulePermissionRow,
} from '@clinicai/repositories'
import { PageContainer } from '@/components/page/PageContainer'
import { PageHero } from '@/components/page/PageHero'
import { ClinicSettingsClient } from './clinica/ClinicSettingsClient'
import { loadClinicSettingsAction } from './clinica/actions'
import { emptyClinicSettings, type ClinicSettingsData } from './clinica/types'
import { UsersAdminClient } from './usuarios/UsersAdminClient'
import { PermissionsMatrixClient } from './usuarios/permissoes/PermissionsMatrixClient'
import { LaraConfigTab } from './LaraConfigTab'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'clinic', label: 'Dados da Clínica', icon: Home },
  { key: 'team', label: 'Equipe', icon: Users },
  { key: 'technologies', label: 'Tecnologias', icon: Monitor },
  { key: 'rooms', label: 'Salas', icon: Grid },
  { key: 'injectables', label: 'Injetáveis', icon: Droplet },
  { key: 'procedures', label: 'Procedimentos', icon: List },
  { key: 'users', label: 'Usuários', icon: Shield },
  { key: 'permissions', label: 'Permissões', icon: Lock },
  { key: 'lara', label: 'Lara IA', icon: Sparkles },
] as const

type TabKey = (typeof TABS)[number]['key']

function pickTab(raw: string | undefined): TabKey {
  const valid = TABS.map((t) => t.key) as readonly string[]
  if (raw && valid.includes(raw)) return raw as TabKey
  return 'clinic'
}

interface PageData {
  role: StaffRole | null
  // Clinica tab
  clinicData: ClinicSettingsData
  clinicErrorMsg: string | null
  // Users tab
  staff: StaffMemberDTO[]
  invites: PendingInviteDTO[]
  myUserId: string | null
  // Permissions tab
  matrixOverrides: ModulePermissionRow[]
}

async function loadDataForTab(tab: TabKey): Promise<PageData> {
  const empty: PageData = {
    role: null,
    clinicData: emptyClinicSettings(),
    clinicErrorMsg: null,
    staff: [],
    invites: [],
    myUserId: null,
    matrixOverrides: [],
  }

  try {
    const { ctx, repos } = await loadServerReposContext()
    const role = (ctx.role ?? null) as StaffRole | null
    empty.role = role
    empty.myUserId = ctx.user_id ?? null

    if (tab === 'clinic' && can(role, 'settings:view')) {
      const result = await loadClinicSettingsAction()
      if (result.ok && result.data) empty.clinicData = result.data
      else empty.clinicErrorMsg = result.error || null
    }

    if (tab === 'users' && can(role, 'users:view')) {
      const [staffRes, invitesRes] = await Promise.all([
        repos.users.listStaff(),
        can(role, 'invites:revoke')
          ? repos.users.listPendingInvites()
          : Promise.resolve({ ok: true, data: [], error: null }),
      ])
      empty.staff = staffRes.ok ? staffRes.data ?? [] : []
      empty.invites = invitesRes.ok ? invitesRes.data ?? [] : []
    }

    if (tab === 'permissions' && can(role, 'settings:edit')) {
      const res = await repos.users.getModulePermissions()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      empty.matrixOverrides = (res.ok ? (res.data as any) : []) ?? []
      // Tambem precisamos staff pra aba "customizar acesso por usuario"
      const staffRes = await repos.users.listStaff()
      empty.staff = staffRes.ok ? staffRes.data ?? [] : []
    }

    return empty
  } catch (e) {
    console.error('[/configuracoes] loadData failed:', (e as Error).message)
    return empty
  }
}

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const sp = await searchParams
  const tab = pickTab(sp.tab)
  const data = await loadDataForTab(tab)
  const role = data.role

  // Tabs visiveis por permissao (gate suave · clica em outra tab redireciona)
  const visibleTabs = TABS.filter((t) => {
    if (t.key === 'clinic') return can(role, 'settings:view')
    if (t.key === 'users') return can(role, 'users:view')
    if (t.key === 'permissions') return can(role, 'settings:edit')
    if (t.key === 'lara') return can(role, 'settings:edit')
    // team/technologies/rooms/injectables/procedures · placeholders
    // sempre visiveis pra mostrar a estrutura completa
    return true
  })

  return (
    <PageContainer variant="wide">
      <PageHero
        kicker="Painel · Configurações"
        title={
          <>
            Configurações da <em>clínica</em>
          </>
        }
        lede="Dados cadastrais, equipe, tecnologias, salas, injetáveis, procedimentos, usuários e permissões."
      />

      {/* Tabs externas · espelho 1:1 do legacy linha 744-753 */}
      <nav
        style={{
          display: 'flex',
          gap: 2,
          flexWrap: 'wrap',
          marginBottom: 28,
          borderBottom: '1px solid var(--b2b-border)',
        }}
        aria-label="Configurações da clínica"
      >
        {visibleTabs.map((t) => {
          const active = t.key === tab
          const Icon = t.icon
          return (
            <a
              key={t.key}
              href={`/configuracoes?tab=${t.key}`}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 14px',
                background: 'transparent',
                color: active ? 'var(--b2b-champagne)' : 'var(--b2b-text-muted)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontFamily: 'inherit',
                textDecoration: 'none',
                transition: 'color var(--lara-transition)',
              }}
            >
              <Icon size={12} strokeWidth={1.75} />
              {t.label}
              {active && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 12,
                    right: 12,
                    bottom: -1,
                    height: 1.5,
                    background: 'var(--b2b-champagne)',
                  }}
                />
              )}
            </a>
          )
        })}
      </nav>

      {/* Panel da tab ativa */}
      {tab === 'clinic' && <ClinicTabPanel data={data} role={role} />}
      {tab === 'team' && <ComingSoonPanel title="Equipe" desc="Cadastro de profissionais (médicos, terapeutas, recepcionistas) com vínculo a usuários do sistema." />}
      {tab === 'technologies' && <ComingSoonPanel title="Tecnologias" desc="Equipamentos e tratamentos disponíveis na clínica." />}
      {tab === 'rooms' && <ComingSoonPanel title="Salas" desc="Cadastro de salas/cabines de atendimento + agenda por sala." />}
      {tab === 'injectables' && <ComingSoonPanel title="Injetáveis" desc="Estoque e controle de injetáveis (toxina, ácido, biorremodelador)." />}
      {tab === 'procedures' && <ComingSoonPanel title="Procedimentos" desc="Catálogo de procedimentos com preços, duração e protocolos." />}
      {tab === 'users' && <UsersTabPanel data={data} role={role} />}
      {tab === 'permissions' && <PermissionsTabPanel data={data} role={role} />}
      {tab === 'lara' && <LaraConfigTab role={role} />}
    </PageContainer>
  )
}

// ─── Panels ─────────────────────────────────────────────────────────────────

function ClinicTabPanel({ data, role }: { data: PageData; role: StaffRole | null }) {
  if (!can(role, 'settings:view')) {
    return <PermissionDenied />
  }
  const canEdit = can(role, 'settings:edit')
  const canEditOwner = can(role, 'settings:clinic-data')
  return (
    <>
      {data.clinicErrorMsg && <ErrorBanner msg={data.clinicErrorMsg} />}
      {!canEdit && <ReadOnlyBanner />}
      <ClinicSettingsClient
        initialData={data.clinicData}
        canEdit={canEdit}
        canEditOwner={canEditOwner}
      />
    </>
  )
}

function UsersTabPanel({ data, role }: { data: PageData; role: StaffRole | null }) {
  if (!can(role, 'users:view')) {
    return <PermissionDenied />
  }
  const activeStaff = data.staff.filter((m) => m.isActive)
  const inactiveStaff = data.staff.filter((m) => !m.isActive)
  return (
    <UsersAdminClient
      activeStaff={activeStaff}
      inactiveStaff={inactiveStaff}
      invites={data.invites}
      myUserId={data.myUserId}
      myRole={role}
    />
  )
}

function PermissionsTabPanel({ data, role }: { data: PageData; role: StaffRole | null }) {
  if (!can(role, 'settings:edit')) {
    return <PermissionDenied />
  }
  return (
    <PermissionsMatrixClient
      initialOverrides={data.matrixOverrides}
      editableMembers={data.staff.filter((m) => m.role !== 'owner')}
    />
  )
}

function ComingSoonPanel({ title, desc }: { title: string; desc: string }) {
  return (
    <div
      className="luxury-card"
      style={{
        padding: '60px 32px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <Construction size={32} style={{ color: 'var(--b2b-champagne)' }} />
      <h2
        className="font-display"
        style={{ fontSize: 24, color: 'var(--b2b-ivory)', lineHeight: 1.1 }}
      >
        {title} · <em style={{ color: 'var(--b2b-champagne)' }}>em breve</em>
      </h2>
      <p
        className="font-display"
        style={{
          fontSize: 14,
          fontStyle: 'italic',
          color: 'var(--b2b-text-dim)',
          maxWidth: 480,
          lineHeight: 1.6,
        }}
      >
        {desc}
      </p>
      <p
        style={{
          fontSize: 11,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: 'var(--b2b-text-muted)',
          marginTop: 6,
        }}
      >
        Port em commit dedicado
      </p>
    </div>
  )
}

function PermissionDenied() {
  return (
    <div
      className="luxury-card"
      style={{ padding: 32, textAlign: 'center' }}
    >
      <p
        className="font-display"
        style={{
          fontSize: 18,
          fontStyle: 'italic',
          color: 'var(--b2b-text-dim)',
        }}
      >
        Sem permissão pra ver esta aba.
      </p>
    </div>
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div
      style={{
        marginBottom: 16,
        padding: '10px 14px',
        background: 'rgba(217, 122, 122, 0.10)',
        color: 'var(--b2b-red)',
        borderLeft: '2px solid var(--b2b-red)',
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      {msg}
    </div>
  )
}

function ReadOnlyBanner() {
  return (
    <div
      style={{
        marginBottom: 20,
        padding: '12px 16px',
        background:
          'linear-gradient(135deg, rgba(201,169,110,0.06), rgba(201,169,110,0.02))',
        borderLeft: '2px solid var(--b2b-champagne)',
        fontSize: 13,
        fontFamily: 'Cormorant Garamond, serif',
        fontStyle: 'italic',
        color: 'var(--b2b-text-dim)',
        lineHeight: 1.5,
      }}
    >
      Modo de visualização · somente administradores podem editar as
      configurações.
    </div>
  )
}
