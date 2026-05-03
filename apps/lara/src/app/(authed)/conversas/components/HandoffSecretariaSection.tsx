/**
 * HandoffSecretariaSection · botao "Passar pra Secretaria" (Mig 91).
 *
 * Aparece na zona AGIR do painel direito · abaixo do AssignmentSection.
 *
 * Estados:
 *   - sdr inbox + nao handoff       → botao primary "Passar pra Secretaria"
 *   - sdr inbox + ja handoff        → pill "Em handoff · secretaria notificada"
 *   - secretaria inbox              → nao renderiza (botao nao faz sentido la)
 *
 * Ao clicar: confirma, dispara POST /handoff-secretaria, calls onChange pra
 * caller refrescar conversation (que re-renderiza este componente com o pill).
 */

'use client'

import { useState } from 'react'
import { ArrowRightLeft, Check, AlertCircle } from 'lucide-react'

interface Props {
  conversationId: string
  inboxRole: 'sdr' | 'secretaria' | 'b2b' | undefined
  handoffAt: string | null | undefined
  onChange?: () => void
}

export function HandoffSecretariaSection({
  conversationId,
  inboxRole,
  handoffAt,
  onChange,
}: Props) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Conversa secretaria · botao nao faz sentido aqui
  if (inboxRole === 'secretaria') return null

  // Ja foi handoff · pill informativo
  if (handoffAt) {
    return (
      <div className="px-5 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
        <Check className="w-3 h-3" strokeWidth={2} style={{ color: '#10B981' }} />
        <span
          className="font-meta uppercase"
          style={{
            fontSize: '9.5px',
            letterSpacing: '0.16em',
            fontWeight: 500,
            color: 'rgba(16, 185, 129, 0.85)',
          }}
        >
          Em handoff · secretaria notificada
        </span>
      </div>
    )
  }

  // Default: botao pra acionar handoff
  async function handleClick() {
    if (isLoading) return
    const ok = window.confirm(
      'Passar este lead pra secretaria?\n\n' +
        '• Lara fica pausada por 30 dias nesta conversa\n' +
        '• A secretaria recebe uma notificacao\n' +
        '• Idempotente · clicar de novo nao duplica',
    )
    if (!ok) return

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/handoff-secretaria`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Atendente clicou no painel direito' }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.ok === false) {
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      onChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="px-5 py-3 border-b border-white/[0.06] space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-[11.5px] font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90"
        style={{
          background: 'rgba(201, 169, 110, 0.10)',
          border: '1px solid rgba(201, 169, 110, 0.25)',
          color: '#C9A96E',
          letterSpacing: '0.04em',
        }}
      >
        <ArrowRightLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
        {isLoading ? 'Passando…' : 'Passar pra secretaria'}
      </button>
      {error && (
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" style={{ color: '#EF4444' }} strokeWidth={2} />
          <span
            className="text-[10px]"
            style={{ color: 'rgba(239, 68, 68, 0.85)' }}
          >
            Falha ao passar · {error}
          </span>
        </div>
      )}
    </div>
  )
}
