'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Loader2 } from 'lucide-react'

interface Props {
  slug: string
  flipbookId: string
  /** Mostrar título do livro pra contexto. */
  title?: string
}

/**
 * Gate de senha pra livros privados (`flipbooks.access_password_hash IS NOT NULL`).
 *
 * UX:
 * 1. user digita senha
 * 2. POST /api/flipbooks/[id]/password/verify · server bcrypt-compara, set-cookie httpOnly se ok
 * 3. router.refresh() · server agora vê o cookie e renderiza o Reader normalmente
 */
export function PasswordGate({ slug, flipbookId, title }: Props) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/flipbooks/${flipbookId}/password/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, slug }),
      })
      if (!res.ok) {
        if (res.status === 401) setError('Senha incorreta')
        else setError('Erro ao validar · tente de novo')
        setBusy(false)
        return
      }
      // server setou cookie httpOnly · refresh re-renderiza com Reader visível
      router.refresh()
    } catch {
      setError('Erro de rede · tente de novo')
      setBusy(false)
    }
  }

  return (
    <main className="h-screen w-full bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-bg-elevated border border-gold/30 rounded-lg shadow-2xl p-6">
        <div className="flex flex-col items-center text-center mb-5">
          <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center mb-3">
            <Lock className="w-5 h-5 text-gold" strokeWidth={1.5} />
          </div>
          <h1 className="font-display italic text-text text-2xl mb-1">Livro privado</h1>
          {title && (
            <p className="font-meta text-text-muted text-[10px] uppercase tracking-wider">
              {title}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="font-meta text-text-muted text-[10px] uppercase tracking-wider mb-1 block">
              Senha de acesso
            </span>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-bg border border-border rounded px-3 py-2.5 text-text text-sm font-display outline-none focus:border-gold transition"
            />
          </label>

          {error && (
            <p className="text-red-400 text-xs font-meta uppercase tracking-wider">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || !password}
            className="w-full bg-gold hover:bg-gold-light text-bg font-meta text-xs uppercase tracking-wider py-3 rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Entrar
          </button>
        </form>
      </div>
    </main>
  )
}
