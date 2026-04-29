'use client'

/**
 * Botões de resolve · client wrappers das server actions.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { resolveErrorsByReasonAction, resolveErrorAction } from './actions'

export function ResolveByReasonButton({
  reason,
  count,
}: {
  reason: string
  count: number
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (!confirm(`Marcar ${count} erro(s) "${reason}" como resolvido?`)) return
    setBusy(true)
    try {
      const res = await resolveErrorsByReasonAction(reason)
      if (res.ok) startTransition(() => router.refresh())
      else alert(`Falhou: ${res.error}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-[1.2px] bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/35 hover:bg-[#10B981]/25 transition-colors disabled:opacity-50"
    >
      {busy ? '...' : `Resolver ${count}`}
    </button>
  )
}

export function ResolveOneButton({ errorId }: { errorId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    setBusy(true)
    try {
      const res = await resolveErrorAction(errorId)
      if (res.ok) startTransition(() => router.refresh())
      else alert(`Falhou: ${res.error}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-[1.2px] bg-white/5 text-[#9CA3AF] border border-white/10 hover:bg-white/10 transition-colors disabled:opacity-50"
    >
      {busy ? '...' : 'Resolver'}
    </button>
  )
}
