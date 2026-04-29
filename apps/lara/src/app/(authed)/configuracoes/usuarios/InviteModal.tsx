'use client'

/**
 * InviteModal · port 1:1 do clinic-dashboard openInviteModal (users-admin.js:614).
 *
 * Campos (espelho exato):
 *   1. Email
 *   2. Nivel de acesso (radio cards · descricoes nos cards)
 *   3. Permissoes por modulo (toggles · default = se role tem acesso)
 *      Admin pode override antes de criar convite · permissoes aplicadas
 *      quando user aceita o convite (RPC accept_invitation).
 */

import { useState, useMemo, useEffect } from 'react'
import { Lock, Folder } from 'lucide-react'
import { ROLE_LABELS, type StaffRole } from '@/lib/permissions'
import { MODULES } from './permissoes/lib/modules'

const INVITE_ROLES: ReadonlyArray<{
  value: Exclude<StaffRole, 'owner'>
  label: string
  desc: string
  ownerOnly?: boolean
}> = [
  {
    value: 'admin',
    label: 'Administrador',
    desc: 'Gerencia equipe + configurações · acesso total exceto remover owner',
    ownerOnly: true,
  },
  {
    value: 'therapist',
    label: 'Terapeuta',
    desc: 'Atendimento · prontuário · agenda · pacientes',
  },
  {
    value: 'receptionist',
    label: 'Recepcionista',
    desc: 'Conversas · agendamento · cadastro de pacientes',
  },
  {
    value: 'viewer',
    label: 'Visualizador',
    desc: 'Somente leitura · ideal para auditor ou contador',
  },
]

/** Replica `defaultOn = sRoles.length === 0 || sRoles.indexOf(role) >= 0` (legacy linha 666) */
function defaultPermsForRole(role: StaffRole): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const m of MODULES) {
    out[m.section] = m.roles.length === 0 || m.roles.includes(role)
  }
  return out
}

export function InviteModal({
  myRole,
  onClose,
  onSubmit,
}: {
  myRole: StaffRole | null
  onClose: () => void
  onSubmit: (formData: FormData) => Promise<void>
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<StaffRole>('therapist')
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [perms, setPerms] = useState<Record<string, boolean>>(() =>
    defaultPermsForRole('therapist'),
  )

  // Recalcula defaults ao mudar role (mesmo comportamento do legacy updateRoleUI)
  useEffect(() => {
    setPerms(defaultPermsForRole(selectedRole))
  }, [selectedRole])

  const allModuleIds = useMemo(() => MODULES.map((m) => m.section).join(','), [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!firstName.trim()) {
      setError('Informe o nome')
      return
    }
    if (!email.trim()) {
      setError('Informe o email')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('email', email.trim())
      fd.set('first_name', firstName.trim())
      fd.set('last_name', lastName.trim())
      fd.set('role', selectedRole)
      fd.set('all_modules', allModuleIds)
      for (const [moduleId, allowed] of Object.entries(perms)) {
        if (allowed) fd.set(`perm:${moduleId}`, 'on')
      }
      await onSubmit(fd)
    } catch (err) {
      setError((err as Error).message || 'Erro inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleModule(section: string) {
    setPerms((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const selectedRoleConfig = INVITE_ROLES.find((r) => r.value === selectedRole)

  return (
    <div className="b2b-overlay" onClick={onClose}>
      <div
        className="b2b-modal"
        style={{ maxWidth: 580 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="b2b-modal-hdr">
          <div>
            <h2 style={{ marginBottom: 2 }}>
              Convidar <em style={{ color: 'var(--b2b-champagne)' }}>membro</em>
            </h2>
            <p style={{ fontSize: 11, color: 'var(--b2b-text-muted)', margin: 0 }}>
              O convite expira em 48h. Permissões já aplicadas ao aceitar.
            </p>
          </div>
          <button type="button" className="b2b-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="b2b-modal-body">
            <div className="b2b-form-sec" style={{ marginTop: 0 }}>
              Identificação
            </div>

            <div className="b2b-grid-2">
              <div className="b2b-field">
                <label className="b2b-field-lbl">
                  Nome <em>*</em>
                </label>
                <input
                  name="first_name"
                  type="text"
                  required
                  autoFocus
                  placeholder="Ex: Ana"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className="b2b-input"
                />
              </div>
              <div className="b2b-field">
                <label className="b2b-field-lbl">Sobrenome</label>
                <input
                  name="last_name"
                  type="text"
                  placeholder="Ex: Silva"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  className="b2b-input"
                />
              </div>
            </div>

            <div className="b2b-field">
              <label className="b2b-field-lbl">
                Email <em>*</em>
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="colaborador@clinica.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="b2b-input"
              />
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--b2b-text-muted)',
                  marginTop: 4,
                  letterSpacing: 0.3,
                }}
              >
                Nome aparece no convite · pessoa pode ajustar ao aceitar.
                Geramos um link · você envia manualmente.
              </div>
            </div>

            <div className="b2b-form-sec">Nível de acesso</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {INVITE_ROLES.map((r) => {
                const disabled = r.ownerOnly && myRole !== 'owner'
                const checked = selectedRole === r.value
                return (
                  <label
                    key={r.value}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '12px 14px',
                      background: checked ? 'rgba(201,169,110,0.06)' : 'var(--b2b-bg-2)',
                      border: `1px solid ${
                        checked ? 'var(--b2b-champagne)' : 'var(--b2b-border)'
                      }`,
                      borderRadius: 6,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.4 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => setSelectedRole(r.value)}
                      style={{ accentColor: 'var(--b2b-champagne)', marginTop: 2 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--b2b-ivory)',
                          marginBottom: 2,
                        }}
                      >
                        {r.label}
                        {r.ownerOnly && (
                          <span
                            style={{
                              fontSize: 9,
                              letterSpacing: 1,
                              textTransform: 'uppercase',
                              color: 'var(--b2b-champagne)',
                              marginLeft: 8,
                              fontWeight: 700,
                            }}
                          >
                            owner-only
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--b2b-text-dim)' }}>
                        {r.desc}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            {/* Permissões de módulos · port 1:1 do legacy linhas 634-637 + 660-674 */}
            <div className="b2b-form-sec" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock className="w-3 h-3" />
              Permissões de módulos
            </div>
            <p
              style={{
                fontSize: 11,
                color: 'var(--b2b-text-muted)',
                margin: '0 0 10px',
                fontStyle: 'italic',
              }}
            >
              Defaults baseados no role <strong style={{ color: 'var(--b2b-text-dim)' }}>{selectedRoleConfig?.label}</strong>.
              Toggle pra customizar antes de enviar.
            </p>

            <div
              style={{
                background: 'var(--b2b-bg-2)',
                border: '1px solid var(--b2b-border)',
                borderRadius: 6,
                padding: '6px 10px',
                maxHeight: 240,
                overflowY: 'auto',
              }}
              className="custom-scrollbar"
            >
              {MODULES.map((m) => {
                const allowed = perms[m.section] ?? false
                return (
                  <ModuleToggleRow
                    key={m.section}
                    label={m.label}
                    allowed={allowed}
                    onToggle={() => toggleModule(m.section)}
                  />
                )
              })}
            </div>

            {error && <div className="b2b-form-err">{error}</div>}
          </div>

          <div className="b2b-form-actions" style={{ padding: '0 24px 20px' }}>
            <button type="button" className="b2b-btn" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="b2b-btn b2b-btn-primary" disabled={submitting}>
              {submitting ? 'Gerando link...' : 'Gerar link de convite'}
            </button>
          </div>
        </form>

        <span style={{ display: 'none' }} aria-hidden>
          {ROLE_LABELS.viewer}
        </span>
      </div>
    </div>
  )
}

function ModuleToggleRow({
  label,
  allowed,
  onToggle,
}: {
  label: string
  allowed: boolean
  onToggle: () => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 4px',
        borderBottom: '1px solid var(--b2b-border)',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          fontWeight: 500,
          color: 'var(--b2b-text-dim)',
        }}
      >
        <Folder className="w-3.5 h-3.5" style={{ color: 'var(--b2b-text-muted)' }} />
        {label}
      </span>
      <span
        style={{
          position: 'relative',
          display: 'inline-block',
          width: 32,
          height: 18,
          flexShrink: 0,
        }}
      >
        <input
          type="checkbox"
          checked={allowed}
          onChange={onToggle}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: allowed ? 'var(--b2b-champagne)' : 'var(--b2b-bg-3)',
            borderRadius: 9,
            transition: 'background 0.15s',
          }}
        />
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 2,
            left: allowed ? 16 : 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: allowed ? 'var(--b2b-bg-0)' : 'var(--b2b-text-muted)',
            transition: 'left 0.15s',
          }}
        />
      </span>
    </label>
  )
}
