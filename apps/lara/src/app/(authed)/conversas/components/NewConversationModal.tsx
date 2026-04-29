'use client'

/**
 * NewConversationModal · iniciar conversa manual com phone (lead novo
 * ou existente). Substitui o botao placebo MessageSquarePlus.
 *
 * Fluxo:
 *   1. User digita phone (mascarado · BR) + nome opcional
 *   2. Submit → POST /api/conversations/manual
 *   3. API busca/cria lead + busca/cria conversation
 *   4. Recebe conversation_id → fecha modal e seleciona a conversa
 */

import { useState } from 'react'
import { Phone, X, Send, AlertTriangle } from 'lucide-react'

interface Props {
  onClose: () => void
  onCreated: (conversationId: string) => void
}

function maskPhoneBr(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function NewConversationModal({ onClose, onCreated }: Props) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const digits = phone.replace(/\D/g, '')
  const isValidPhone = digits.length === 10 || digits.length === 11

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    if (!isValidPhone) {
      setError('Telefone inválido · use formato (DDD) 9XXXX-XXXX')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/conversations/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      onCreated(data.conversation_id)
    } catch (e) {
      setError((e as Error).message || 'Erro inesperado')
      setSubmitting(false)
    }
  }

  return (
    <div className="b2b-overlay" onClick={onClose}>
      <div
        className="b2b-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <div className="b2b-modal-hdr">
          <h2>
            Nova <em style={{ color: 'var(--b2b-champagne)' }}>conversa</em>
          </h2>
          <button type="button" onClick={onClose} className="b2b-close" aria-label="Fechar">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="b2b-modal-body">
            <p
              className="font-display"
              style={{
                fontStyle: 'italic',
                fontSize: 14,
                color: 'var(--b2b-text-dim)',
                lineHeight: 1.5,
                marginBottom: 18,
              }}
            >
              Inicia conversa com um número WhatsApp · busca lead existente ou
              cria novo se for primeiro contato.
            </p>

            <div className="b2b-field">
              <label className="b2b-field-lbl">
                Telefone <em>*</em>
              </label>
              <div style={{ position: 'relative' }}>
                <Phone
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--b2b-text-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(maskPhoneBr(e.target.value))}
                  placeholder="(44) 99999-9999"
                  required
                  autoFocus
                  className="b2b-input"
                  style={{ paddingLeft: 36 }}
                />
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--b2b-text-muted)',
                  marginTop: 4,
                  letterSpacing: 0.3,
                }}
              >
                Sistema adiciona +55 automático · DDD obrigatório.
              </div>
            </div>

            <div className="b2b-field">
              <label className="b2b-field-lbl">Nome (opcional)</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Maria Silva"
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
                Se o lead já existir, mantemos o nome cadastrado.
              </div>
            </div>

            {error && (
              <div className="b2b-form-err">
                <AlertTriangle size={12} style={{ display: 'inline', marginRight: 4 }} />
                {error}
              </div>
            )}
          </div>

          <div className="b2b-form-actions" style={{ padding: '0 24px 20px' }}>
            <button type="button" onClick={onClose} className="b2b-btn" disabled={submitting}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !isValidPhone}
              className="b2b-btn b2b-btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {submitting ? (
                'Iniciando...'
              ) : (
                <>
                  <Send size={12} /> Iniciar conversa
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
