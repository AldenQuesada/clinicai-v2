'use client'

import { useState } from 'react'
import { ROLE_LABELS, type StaffRole } from '@/lib/permissions'

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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!email.trim()) {
      setError('Informe o email')
      return
    }
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.set('email', email.trim())
      fd.set('role', selectedRole)
      await onSubmit(fd)
    } catch (err) {
      setError((err as Error).message || 'Erro inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="b2b-overlay" onClick={onClose}>
      <div className="b2b-modal" onClick={(e) => e.stopPropagation()}>
        <div className="b2b-modal-hdr">
          <h2>
            Convidar <em style={{ color: 'var(--b2b-champagne)' }}>membro</em>
          </h2>
          <button type="button" className="b2b-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="b2b-modal-body">
            <div className="b2b-form-sec">Identificação</div>

            <div className="b2b-field">
              <label className="b2b-field-lbl">
                Email <em>*</em>
              </label>
              <input
                name="email"
                type="email"
                required
                autoFocus
                placeholder="nome@clinica.com"
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
                Geramos um link · você envia manualmente para a pessoa
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
                      <div style={{ fontSize: 11, color: 'var(--b2b-text-dim)' }}>{r.desc}</div>
                    </div>
                  </label>
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
