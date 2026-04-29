'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROLE_LABELS, type StaffRole } from '@/lib/permissions'
import { updateOwnProfileAction } from '@/app/(authed)/configuracoes/usuarios/actions'

interface ProfileUser {
  id: string
  email: string
  firstName: string
  lastName: string
  role: StaffRole | null
}

export function MyProfileModal({
  user,
  onClose,
}: {
  user: ProfileUser
  onClose: () => void
}) {
  const router = useRouter()
  const [firstName, setFirstName] = useState(user.firstName)
  const [lastName, setLastName] = useState(user.lastName)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await updateOwnProfileAction({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      })
      if (!res.ok) {
        setError(res.error || 'Falha ao salvar')
        return
      }
      setSaved(true)
      router.refresh()
      setTimeout(() => onClose(), 800)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="b2b-overlay" onClick={onClose}>
      <div className="b2b-modal" onClick={(e) => e.stopPropagation()}>
        <div className="b2b-modal-hdr">
          <h2>
            Meu <em style={{ color: 'var(--b2b-champagne)' }}>perfil</em>
          </h2>
          <button type="button" className="b2b-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="b2b-modal-body">
            <div className="b2b-form-sec">Identificação</div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="b2b-field" style={{ flex: 1 }}>
                <label className="b2b-field-lbl">Nome</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="b2b-input"
                  autoComplete="given-name"
                />
              </div>
              <div className="b2b-field" style={{ flex: 1 }}>
                <label className="b2b-field-lbl">Sobrenome</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="b2b-input"
                  autoComplete="family-name"
                />
              </div>
            </div>

            <div className="b2b-form-sec">Conta</div>

            <div className="b2b-field">
              <label className="b2b-field-lbl">Email</label>
              <input
                type="email"
                value={user.email}
                readOnly
                className="b2b-input"
                style={{ background: 'var(--b2b-bg-3)', cursor: 'not-allowed' }}
              />
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--b2b-text-muted)',
                  marginTop: 4,
                  letterSpacing: 0.3,
                }}
              >
                Trocar email exige re-verificação · entre em contato com a admin
              </div>
            </div>

            {user.role && (
              <div className="b2b-field">
                <label className="b2b-field-lbl">Nível de acesso</label>
                <div>
                  <span
                    className="b2b-pill"
                    style={{
                      background: 'rgba(201,169,110,0.20)',
                      color: 'var(--b2b-champagne)',
                    }}
                  >
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--b2b-text-muted)',
                    marginTop: 4,
                    letterSpacing: 0.3,
                  }}
                >
                  Definido pela owner · só ela altera
                </div>
              </div>
            )}

            {error && <div className="b2b-form-err">{error}</div>}
            {saved && (
              <div
                style={{
                  marginTop: 12,
                  padding: '10px 14px',
                  background: 'rgba(138,158,136,0.12)',
                  color: 'var(--b2b-sage)',
                  border: '1px solid rgba(138,158,136,0.3)',
                  borderRadius: 5,
                  fontSize: 12,
                }}
              >
                Salvo com sucesso
              </div>
            )}
          </div>

          <div className="b2b-form-actions" style={{ padding: '0 24px 20px' }}>
            <button type="button" className="b2b-btn" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button
              type="submit"
              className="b2b-btn b2b-btn-primary"
              disabled={submitting || saved}
            >
              {submitting ? 'Salvando...' : saved ? 'Salvo' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
