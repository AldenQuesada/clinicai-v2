'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/browser'

/**
 * Reset password · usuário chega aqui via link do email Supabase.
 *
 * Fluxo:
 *   1. Email tem URL tipo /login/reset#access_token=...&refresh_token=...&type=recovery
 *   2. useEffect processa hash → supabase.auth.setSession() → cookies setados
 *   3. Form aceita nova senha → supabase.auth.updateUser({password})
 *   4. Sucesso → redirect /admin
 */
export function ResetForm() {
  const supabase = createBrowserClient()

  const [hashReady, setHashReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const access_token = hash.get('access_token')
    const refresh_token = hash.get('refresh_token')
    if (!access_token || !refresh_token) {
      setError('Link inválido ou expirado · peça um novo em "Esqueci minha senha".')
      setLoading(false)
      return
    }
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          setError('Link inválido ou expirado: ' + error.message)
        } else {
          setHashReady(true)
          // Limpa o hash da URL pra não vazar tokens em logs/history.
          window.history.replaceState(null, '', window.location.pathname)
        }
        setLoading(false)
      })
      .catch((e: Error) => {
        setError('Erro ao validar link: ' + e.message)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('Senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não conferem.')
      return
    }
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSuccess(true)
    // Sessão já criada · pode mandar pro admin direto.
    setTimeout(() => {
      window.location.replace('/admin')
    }, 1500)
  }

  if (success) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <div className="font-display italic text-gold text-2xl mb-3">Senha alterada</div>
        <p className="text-text-muted text-sm">Redirecionando pra /admin…</p>
      </div>
    )
  }

  if (loading && !hashReady) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <div className="text-text-muted text-sm">Validando link…</div>
      </div>
    )
  }

  if (!hashReady) {
    return (
      <div className="border border-border rounded-lg p-8 text-center">
        <div className="font-display italic text-red-400 text-2xl mb-3">Link inválido</div>
        <p className="text-text-muted text-sm mb-6">
          {error ?? 'Link expirou ou já foi usado.'}
        </p>
        <Link
          href="/login/forgot"
          className="font-meta text-xs text-text-muted hover:text-gold transition"
        >
          Pedir novo link
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="font-meta text-sm text-text-muted text-center mb-2">
        Escolha uma nova senha · mínimo 8 caracteres.
      </p>

      <div>
        <label className="font-meta text-text-muted block mb-2">Nova senha</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
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

      <div>
        <label className="font-meta text-text-muted block mb-2">Confirme a senha</label>
        <input
          type={showPassword ? 'text' : 'password'}
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full bg-bg-elevated border border-border rounded px-4 py-3 text-text focus:border-gold/60 outline-none transition"
        />
      </div>

      {error && <div className="text-red-400 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gold text-bg font-meta py-3 rounded hover:bg-gold-light transition disabled:opacity-50"
      >
        {loading ? 'Salvando…' : 'Salvar nova senha'}
      </button>
    </form>
  )
}
