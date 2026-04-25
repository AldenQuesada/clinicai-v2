'use client'

/**
 * SaudeClient · espelho 1:1 do `b2b-health.ui.js`. Botão "Recalcular"
 * server action + reload da página.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { recalcAllHealthAction } from './actions'

export function SaudeRecalcButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  function onClick() {
    setBusy(true)
    startTransition(async () => {
      try {
        const r = await recalcAllHealthAction()
        if (!r.ok) alert(`Falha: ${r.error || 'desconhecido'}`)
        else router.refresh()
      } finally {
        setBusy(false)
      }
    })
  }

  return (
    <button type="button" className="b2b-btn" onClick={onClick} disabled={busy || pending}>
      {busy ? 'Recalculando…' : 'Recalcular'}
    </button>
  )
}
