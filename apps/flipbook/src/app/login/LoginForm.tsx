'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)

  const supabase = createBrowserClient()

  // Processa magic link · quando Supabase verify redireciona pra /login com
  // #access_token+refresh_token no hash, troca os tokens por session cookies
  // e empurra pra rota destino. Sem isso, ficaria parado no form.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.location.hash) return
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const access_token = hash.get('access_token')
    const refresh_token = hash.get('refresh_token')
    if (!access_token || !refresh_token) return
    setLoading(true)
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          setError('Magic link inválido ou expirado: ' + error.message)
          setLoading(false)
          return
        }
        window.location.replace(next)
      })
      .catch((e: Error) => {
        setError('Erro ao processar link: ' + e.message)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-bg-elevated border border-border rounded px-4 py-3 pr-20 text-text focus:border-gold/60 outline-none transition"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs font-meta text-text-muted hover:text-gold transition"
            tabIndex={-1}
          >
            {showPassword ? 'ocultar' : 'mostrar'}
          </button>
        </div>
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
