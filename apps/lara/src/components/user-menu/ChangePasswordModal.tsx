'use client'

import { useState } from 'react'
import { createBrowserClient } from '@clinicai/supabase/browser'

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (newPwd.length < 6) {
      setError('A nova senha precisa de pelo menos 6 caracteres')
      return
    }
    if (newPwd !== confirm) {
      setError('As senhas não coincidem')
      return
    }
    if (newPwd === currentPwd) {
      setError('A nova senha deve ser diferente da atual')
      return
    }

    setSubmitting(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createBrowserClient() as any
    try {
      // 1. Confirma senha atual via signIn (obtem email da sessao)
      const { data: { user } } = await sb.auth.getUser()
      if (!user?.email) {
        setError('Sessão expirou · faça login de novo')
        return
      }
      const { error: signInErr } = await sb.auth.signInWithPassword({
        email: user.email,
        password: currentPwd,
      })
      if (signInErr) {
        if (
          signInErr.message?.includes('Invalid login') ||
          signInErr.message?.includes('invalid_credentials')
        ) {
          setError('Senha atual incorreta')
          return
        }
        setError(signInErr.message || 'Falha ao validar senha atual')
        return
      }

      // 2. Atualiza pra nova senha
      const { error: updateErr } = await sb.auth.updateUser({
        password: newPwd,
      })
      if (updateErr) {
        setError(updateErr.message || 'Falha ao atualizar senha')
        return
      }

      setSaved(true)
      setTimeout(() => onClose(), 1200)
    } catch (err) {
      setError((err as Error).message || 'Erro inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="b2b-overlay" onClick={onClose}>
      <div
        className="b2b-modal"
        style={{ maxWidth: 440 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="b2b-modal-hdr">
          <h2>
            Alterar <em style={{ color: 'var(--b2b-champagne)' }}>senha</em>
          </h2>
          <button type="button" className="b2b-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="b2b-modal-body">
            <p
              style={{
                fontSize: 12,
                color: 'var(--b2b-text-dim)',
                marginBottom: 16,
                lineHeight: 1.6,
              }}
            >
              Por segurança, confirme sua senha atual antes de criar uma nova.
            </p>

            <div className="b2b-field">
              <label className="b2b-field-lbl">
                Senha atual <em>*</em>
              </label>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                required
                autoFocus
                className="b2b-input"
              />
            </div>

            <div className="b2b-field">
              <label className="b2b-field-lbl">
                Nova senha (mínimo 6) <em>*</em>
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                required
                minLength={6}
                className="b2b-input"
              />
            </div>

            <div className="b2b-field">
              <label className="b2b-field-lbl">
                Confirmar nova senha <em>*</em>
              </label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                className="b2b-input"
              />
            </div>

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
                Senha alterada com sucesso
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
              {submitting ? 'Salvando...' : saved ? 'Salvo' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
