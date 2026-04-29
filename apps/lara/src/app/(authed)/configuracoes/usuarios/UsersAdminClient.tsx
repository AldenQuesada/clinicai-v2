'use client'

/**
 * UsersAdminClient · orquestra membros + convites + modais.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserPlus,
  Edit2,
  XCircle,
  RotateCw,
  X,
  Mail,
  Clock,
} from 'lucide-react'
import type {
  StaffMemberDTO,
  PendingInviteDTO,
} from '@clinicai/repositories'
import { can, ROLE_LABELS, ROLE_COLORS, type StaffRole } from '@/lib/permissions'
import {
  inviteStaffAction,
  updateRoleAction,
  deactivateStaffAction,
  activateStaffAction,
  revokeInviteAction,
  type InviteActionResult,
} from './actions'
import { InviteModal } from './InviteModal'
import { InviteSuccessModal } from './InviteSuccessModal'
import { ChangeRoleModal } from './ChangeRoleModal'
import { ConfirmModal } from './ConfirmModal'

type ConfirmKind =
  | { type: 'deactivate'; userId: string; userName: string }
  | { type: 'activate'; userId: string; userName: string }
  | { type: 'revoke'; inviteId: string; email: string }

export function UsersAdminClient({
  activeStaff,
  inactiveStaff,
  invites,
  myUserId,
  myRole,
}: {
  activeStaff: StaffMemberDTO[]
  inactiveStaff: StaffMemberDTO[]
  invites: PendingInviteDTO[]
  myUserId: string | null
  myRole: StaffRole | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState<InviteActionResult | null>(null)
  const [changeRole, setChangeRole] = useState<StaffMemberDTO | null>(null)
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)
  const [filterRole, setFilterRole] = useState<'all' | StaffRole>('all')
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)

  function showToast(msg: string, tone: 'ok' | 'err' = 'ok') {
    setToast({ msg, tone })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleInvite(formData: FormData) {
    const result = await inviteStaffAction(formData)
    if (!result.ok) {
      showToast(result.error || 'Falha ao convidar', 'err')
      return
    }
    setInviteOpen(false)
    setInviteSuccess(result)
    startTransition(() => router.refresh())
  }

  async function handleChangeRole(newRole: StaffRole) {
    if (!changeRole) return
    const result = await updateRoleAction(changeRole.id, newRole)
    if (!result.ok) {
      showToast(result.error || 'Falha ao atualizar role', 'err')
      return
    }
    setChangeRole(null)
    showToast('Nível de acesso atualizado')
    startTransition(() => router.refresh())
  }

  async function handleConfirm() {
    if (!confirm) return
    let result: { ok: boolean; error?: string }
    if (confirm.type === 'deactivate') {
      result = await deactivateStaffAction(confirm.userId)
    } else if (confirm.type === 'activate') {
      result = await activateStaffAction(confirm.userId)
    } else {
      result = await revokeInviteAction(confirm.inviteId)
    }
    if (!result.ok) {
      showToast(result.error || 'Falha na operação', 'err')
      return
    }
    setConfirm(null)
    showToast(
      confirm.type === 'deactivate'
        ? 'Acesso removido'
        : confirm.type === 'activate'
          ? 'Acesso reativado'
          : 'Convite revogado',
    )
    startTransition(() => router.refresh())
  }

  const filteredActive =
    filterRole === 'all' ? activeStaff : activeStaff.filter((m) => m.role === filterRole)

  const allRoles: StaffRole[] = ['owner', 'admin', 'therapist', 'receptionist', 'viewer']

  return (
    <>
      <div className="b2b-list-head">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <FilterPill
            active={filterRole === 'all'}
            onClick={() => setFilterRole('all')}
            label={`Todos (${activeStaff.length})`}
          />
          {allRoles.map((r) => {
            const count = activeStaff.filter((m) => m.role === r).length
            if (count === 0) return null
            return (
              <FilterPill
                key={r}
                active={filterRole === r}
                onClick={() => setFilterRole(r)}
                label={`${ROLE_LABELS[r]} (${count})`}
              />
            )
          })}
        </div>
        {can(myRole, 'users:invite') && (
          <div className="b2b-list-head-acts">
            <button
              type="button"
              className="b2b-btn b2b-btn-primary"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus className="w-3.5 h-3.5" />
              Convidar membro
            </button>
          </div>
        )}
      </div>

      {filteredActive.length === 0 ? (
        <div className="b2b-empty">
          {filterRole === 'all'
            ? 'Nenhum membro ativo · convide alguém pra começar'
            : `Nenhum membro com role ${ROLE_LABELS[filterRole as StaffRole]}`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filteredActive.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isMe={m.id === myUserId}
              myRole={myRole}
              onChangeRole={() => setChangeRole(m)}
              onDeactivate={() =>
                setConfirm({
                  type: 'deactivate',
                  userId: m.id,
                  userName: `${m.firstName} ${m.lastName}`.trim() || m.email || '',
                })
              }
            />
          ))}
        </div>
      )}

      {invites.length > 0 && (
        <details open style={{ marginTop: 32 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 11,
              letterSpacing: 2,
              textTransform: 'uppercase',
              fontWeight: 600,
              color: 'var(--b2b-champagne)',
              padding: '10px 0',
              listStyle: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Clock className="w-3.5 h-3.5" />
            Convites pendentes ({invites.length})
          </summary>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {invites.map((inv) => (
              <InviteRow
                key={inv.id}
                invite={inv}
                canRevoke={can(myRole, 'invites:revoke')}
                onRevoke={() =>
                  setConfirm({ type: 'revoke', inviteId: inv.id, email: inv.email })
                }
              />
            ))}
          </div>
        </details>
      )}

      {inactiveStaff.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary
            style={{
              cursor: 'pointer',
              fontSize: 11,
              letterSpacing: 2,
              textTransform: 'uppercase',
              fontWeight: 600,
              color: 'var(--b2b-text-muted)',
              padding: '10px 0',
              listStyle: 'none',
            }}
          >
            Inativos ({inactiveStaff.length})
          </summary>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginTop: 8,
              opacity: 0.5,
            }}
          >
            {inactiveStaff.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isMe={m.id === myUserId}
                myRole={myRole}
                onChangeRole={() => setChangeRole(m)}
                onDeactivate={() =>
                  setConfirm({
                    type: 'activate',
                    userId: m.id,
                    userName: `${m.firstName} ${m.lastName}`.trim() || m.email || '',
                  })
                }
              />
            ))}
          </div>
        </details>
      )}

      {inviteOpen && (
        <InviteModal
          myRole={myRole}
          onClose={() => setInviteOpen(false)}
          onSubmit={handleInvite}
        />
      )}

      {inviteSuccess && (
        <InviteSuccessModal result={inviteSuccess} onClose={() => setInviteSuccess(null)} />
      )}

      {changeRole && (
        <ChangeRoleModal
          member={changeRole}
          myRole={myRole}
          onClose={() => setChangeRole(null)}
          onSelect={handleChangeRole}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={
            confirm.type === 'deactivate'
              ? 'Remover acesso'
              : confirm.type === 'activate'
                ? 'Reativar acesso'
                : 'Revogar convite'
          }
          message={
            confirm.type === 'deactivate'
              ? `Remover acesso de ${confirm.userName}? Pode reativar depois.`
              : confirm.type === 'activate'
                ? `Reativar o acesso de ${confirm.userName}?`
                : `Revogar convite de ${confirm.email}? O link enviado deixa de funcionar.`
          }
          confirmLabel={
            confirm.type === 'deactivate'
              ? 'Remover'
              : confirm.type === 'activate'
                ? 'Reativar'
                : 'Revogar'
          }
          tone={confirm.type === 'activate' ? 'default' : 'danger'}
          onConfirm={handleConfirm}
          onClose={() => setConfirm(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '12px 16px',
            background:
              toast.tone === 'err' ? 'rgba(217,122,122,0.18)' : 'rgba(138,158,136,0.18)',
            border: `1px solid ${toast.tone === 'err' ? 'rgba(217,122,122,0.5)' : 'rgba(138,158,136,0.5)'}`,
            color: toast.tone === 'err' ? 'var(--b2b-red)' : 'var(--b2b-sage)',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            zIndex: 1100,
          }}
        >
          {toast.msg}
        </div>
      )}
    </>
  )
}

function FilterPill({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '6px 14px',
        fontSize: 11,
        letterSpacing: 0.5,
        fontWeight: 600,
        borderRadius: 16,
        cursor: 'pointer',
        border: '1px solid var(--b2b-border)',
        background: active ? 'var(--b2b-champagne)' : 'var(--b2b-bg-1)',
        color: active ? 'var(--b2b-bg-0)' : 'var(--b2b-text-dim)',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function MemberRow({
  member,
  isMe,
  myRole,
  onChangeRole,
  onDeactivate,
}: {
  member: StaffMemberDTO
  isMe: boolean
  myRole: StaffRole | null
  onChangeRole: () => void
  onDeactivate: () => void
}) {
  const initials = (member.firstName || member.email || 'U').slice(0, 1).toUpperCase()
  const fullName = `${member.firstName} ${member.lastName}`.trim() || member.email || 'Sem nome'
  const colors = ROLE_COLORS[member.role]

  const canChangeThisRole =
    can(myRole, 'users:change-role') && !isMe && (myRole === 'owner' || member.role !== 'owner')
  const canDeactivateThis =
    can(myRole, member.isActive ? 'users:deactivate' : 'users:reactivate') &&
    !isMe &&
    (myRole === 'owner' || member.role !== 'owner')

  return (
    <div
      className="luxury-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 16px',
      }}
    >
      <div className="b2b-avatar">{initials}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--b2b-ivory)' }}>
            {fullName}
          </span>
          {isMe && (
            <span
              className="b2b-pill"
              style={{
                background: 'rgba(201,169,110,0.10)',
                color: 'var(--b2b-champagne)',
                border: '1px solid var(--b2b-border)',
              }}
            >
              Você
            </span>
          )}
          <span
            className="b2b-pill"
            style={{ background: colors.bg, color: colors.text }}
          >
            {ROLE_LABELS[member.role]}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)' }}>
          {member.email || '— sem email —'}
        </div>
      </div>

      {canChangeThisRole && (
        <button
          type="button"
          onClick={onChangeRole}
          title="Alterar nível de acesso"
          className="b2b-btn"
          style={{ padding: '7px 10px' }}
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
      )}

      {canDeactivateThis && member.isActive && (
        <button
          type="button"
          onClick={onDeactivate}
          title="Remover acesso"
          className="b2b-btn"
          style={{
            padding: '7px 10px',
            color: 'var(--b2b-red)',
            borderColor: 'rgba(217,122,122,0.35)',
          }}
        >
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}

      {canDeactivateThis && !member.isActive && (
        <button
          type="button"
          onClick={onDeactivate}
          title="Reativar acesso"
          className="b2b-btn"
          style={{ padding: '7px 10px' }}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

function InviteRow({
  invite,
  canRevoke,
  onRevoke,
}: {
  invite: PendingInviteDTO
  canRevoke: boolean
  onRevoke: () => void
}) {
  const expiresIn = (() => {
    const ms = new Date(invite.expiresAt).getTime() - Date.now()
    if (ms <= 0) return 'expirado'
    const hours = Math.floor(ms / (1000 * 60 * 60))
    if (hours >= 24) return `expira em ${Math.floor(hours / 24)}d`
    return `expira em ${hours}h`
  })()

  return (
    <div
      className="luxury-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'rgba(201,169,110,0.04)',
      }}
    >
      <Mail className="w-4 h-4" style={{ color: 'var(--b2b-champagne)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 2,
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--b2b-ivory)', fontWeight: 500 }}>
            {invite.email}
          </span>
          <span
            className="b2b-pill"
            style={{
              background: ROLE_COLORS[invite.role].bg,
              color: ROLE_COLORS[invite.role].text,
            }}
          >
            {ROLE_LABELS[invite.role]}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--b2b-text-muted)' }}>
          {expiresIn}
          {invite.invitedByName && ` · convidado por ${invite.invitedByName}`}
        </div>
      </div>
      {canRevoke && (
        <button
          type="button"
          onClick={onRevoke}
          title="Revogar convite"
          className="b2b-btn"
          style={{
            padding: '7px 10px',
            color: 'var(--b2b-red)',
            borderColor: 'rgba(217,122,122,0.35)',
          }}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
