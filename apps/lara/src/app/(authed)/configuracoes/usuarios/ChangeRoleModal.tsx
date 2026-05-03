'use client'

import { useState } from 'react'
import type { StaffMemberDTO } from '@clinicai/repositories'
import { ROLE_LABELS, type StaffRole } from '@/lib/permissions'

const ROLE_OPTIONS: ReadonlyArray<{ value: StaffRole; desc: string; ownerOnly?: boolean }> = [
  { value: 'owner', desc: 'Acesso irrestrito · pode gerenciar outros owners', ownerOnly: true },
  { value: 'admin', desc: 'Gerência · tudo exceto remover owner', ownerOnly: true },
  { value: 'therapist', desc: 'Atendimento · prontuário · agenda' },
  { value: 'receptionist', desc: 'Conversas · agendamento · cadastro' },
  { value: 'secretaria', desc: 'Inbox /secretaria · agenda · pacientes (sem Lara IA)' },
  { value: 'viewer', desc: 'Somente leitura' },
]

export function ChangeRoleModal({
  member,
  myRole,
  onClose,
  onSelect,
}: {
  member: StaffMemberDTO
  myRole: StaffRole | null
  onClose: () => void
  onSelect: (role: StaffRole) => Promise<void>
}) {
  const [selected, setSelected] = useState<StaffRole>(member.role)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (selected === member.role) {
      onClose()
      return
    }
    setSubmitting(true)
    try {
      await onSelect(selected)
    } finally {
      setSubmitting(false)
    }
  }

  const fullName = `${member.firstName} ${member.lastName}`.trim() || member.email || ''

  return (
    <div className="b2b-overlay" onClick={onClose}>
      <div className="b2b-modal" onClick={(e) => e.stopPropagation()}>
        <div className="b2b-modal-hdr">
          <h2>
            Nível de <em style={{ color: 'var(--b2b-champagne)' }}>acesso</em>
          </h2>
          <button type="button" className="b2b-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="b2b-modal-body">
            <p style={{ fontSize: 13, color: 'var(--b2b-text-dim)', marginBottom: 16 }}>
              Alterar acesso de{' '}
              <strong style={{ color: 'var(--b2b-ivory)' }}>{fullName}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ROLE_OPTIONS.map((r) => {
                const disabled = r.ownerOnly && myRole !== 'owner'
                const checked = selected === r.value
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
                      onChange={() => setSelected(r.value)}
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
                        {ROLE_LABELS[r.value]}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--b2b-text-dim)' }}>
                        {r.desc}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="b2b-form-actions" style={{ padding: '0 24px 20px' }}>
            <button type="button" className="b2b-btn" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button
              type="submit"
              className="b2b-btn b2b-btn-primary"
              disabled={submitting || selected === member.role}
            >
              {submitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
