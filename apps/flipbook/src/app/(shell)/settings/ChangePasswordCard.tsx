'use client'

import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'

export function ChangePasswordCard() {
  const supabase = createBrowserClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (password.length < 8) {
      setError('Mínimo 8 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não conferem.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setSuccess(true)
    setPassword('')
    setConfirm('')
  }

  return (
    <section className="border border-border rounded-lg bg-bg-elevated p-6 mb-6">
      <h3 className="font-meta text-text-muted mb-4">Trocar senha</h3>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="font-meta text-xs text-text-muted block mb-1">Nova senha</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-bg border border-border rounded px-4 py-2 pr-20 text-text focus:border-gold/60 outline-none transition text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-meta text-text-muted hover:text-gold transition"
              tabIndex={-1}
            >
              {showPassword ? 'ocultar' : 'mostrar'}
            </button>
          </div>
        </div>

        <div>
          <label className="font-meta text-xs text-text-muted block mb-1">Confirme</label>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-bg border border-border rounded px-4 py-2 text-text focus:border-gold/60 outline-none transition text-sm"
          />
        </div>

        {error && <div className="text-red-400 text-xs">{error}</div>}
        {success && <div className="text-green-400 text-xs">Senha alterada com sucesso.</div>}

        <button
          type="submit"
          disabled={loading || !password || !confirm}
          className="bg-gold text-bg font-meta py-2 px-5 rounded hover:bg-gold-light transition disabled:opacity-50 text-sm"
        >
          {loading ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </section>
  )
}
