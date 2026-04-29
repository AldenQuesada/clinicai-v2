'use client'

/**
 * ResendAudioButton · botao inline pra retry de audio quando dispatch falhou.
 * Aparece so na linha de voucher com audio_sent_at NULL e idade >5min.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resendVoucherAudioAction } from './actions'

export function ResendAudioButton({ voucherId }: { voucherId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ msg: string; tone: 'ok' | 'err' } | null>(null)

  async function handleClick() {
    setBusy(true)
    setFeedback(null)
    try {
      const res = await resendVoucherAudioAction(voucherId)
      if (res.ok) {
        setFeedback({ msg: 'Disparado · áudio em fila', tone: 'ok' })
        startTransition(() => router.refresh())
        setTimeout(() => setFeedback(null), 4000)
      } else {
        setFeedback({ msg: res.error || 'Falhou', tone: 'err' })
        setTimeout(() => setFeedback(null), 6000)
      }
    } catch (e) {
      setFeedback({ msg: (e as Error).message || 'Erro', tone: 'err' })
      setTimeout(() => setFeedback(null), 6000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        title="Reenviar áudio · força edge function manualmente"
        style={{
          padding: '3px 9px',
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          background: 'rgba(201,169,110,0.10)',
          color: '#C9A96E',
          border: '1px solid rgba(201,169,110,0.35)',
          borderRadius: 4,
          cursor: busy ? 'not-allowed' : 'pointer',
          opacity: busy ? 0.5 : 1,
          fontFamily: 'inherit',
        }}
      >
        {busy ? 'Reenviando...' : 'Reenviar áudio'}
      </button>
      {feedback && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            color: feedback.tone === 'ok' ? '#10B981' : '#FCA5A5',
            whiteSpace: 'nowrap',
          }}
        >
          {feedback.msg}
        </span>
      )}
    </span>
  )
}
