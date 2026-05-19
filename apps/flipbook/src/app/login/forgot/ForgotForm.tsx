'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/browser'

export function ForgotForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const supabase = createBrowserClient()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/reset`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <div className="font-display italic text-gold text-2xl mb-3">Email enviado</div>
        <p className="text-text-muted text-sm mb-6">
          Se existir uma conta com <strong className="text-text">{email}</strong>, você receberá um
          link pra redefinir a senha. Olha a caixa de entrada (e o spam).
        </p>
        <Link
          href="/login"
          className="font-meta text-xs text-text-muted hover:text-gold transition"
        >
          Voltar pro login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="font-meta text-sm text-text-muted text-center mb-2">
        Digite seu email · enviaremos um link pra criar uma nova senha.
      </p>
      <div>
        <label className="font-meta text-text-muted block mb-2">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-bg-elevated border border-border rounded px-4 py-3 text-text focus:border-gold/60 outline-none transition"
        />
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gold text-bg font-meta py-3 rounded hover:bg-gold-light transition disabled:opacity-50"
      >
        {loading ? 'Enviando…' : 'Enviar link de recuperação'}
      </button>

      <div className="text-center pt-2">
        <Link
          href="/login"
          className="font-meta text-xs text-text-muted hover:text-gold transition"
        >
          Voltar pro login
        </Link>
      </div>
    </form>
  )
}
