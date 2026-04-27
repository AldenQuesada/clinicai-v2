'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)

  const supabase = createBrowserClient()

  async function loginPassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.push(next)
    router.refresh()
  }

  async function loginMagic() {
    if (!email) { setError('Coloca o email primeiro.'); return }
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${next}` },
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setMagicSent(true)
  }

  if (magicSent) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <div className="font-display italic text-gold text-2xl mb-3">Link enviado</div>
        <p className="text-text-muted text-sm">Confere a caixa de entrada de <strong className="text-text">{email}</strong>. Clica no link pra entrar.</p>
      </div>
    )
  }

  return (
    <form onSubmit={loginPassword} className="space-y-4">
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
      <div>
        <label className="font-meta text-text-muted block mb-2">Senha</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-bg-elevated border border-border rounded px-4 py-3 text-text focus:border-gold/60 outline-none transition"
        />
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gold text-bg font-meta py-3 rounded hover:bg-gold-light transition disabled:opacity-50"
      >
        {loading ? 'Entrando…' : 'Entrar'}
      </button>

      <button
        type="button"
        onClick={loginMagic}
        disabled={loading}
        className="w-full border border-border text-text-muted font-meta py-3 rounded hover:border-gold/40 hover:text-gold transition disabled:opacity-50"
      >
        Entrar com link mágico
      </button>
    </form>
  )
}
