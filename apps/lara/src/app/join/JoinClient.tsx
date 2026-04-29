'use client'

/**
 * JoinClient · UI client-side de aceitar convite.
 *
 * Fluxo (port do clinic-dashboard/join.html):
 *  1. Le ?token=... da URL
 *  2. Se ja logado → coleta nome/sobrenome → accept_invitation(token, ...)
 *  3. Se nao logado → tela login: tenta signIn; se "invalid_credentials" sugere cadastro
 *  4. Cadastro: signUp → signIn auto → coleta nome → accept_invitation
 *  5. Sucesso → redirect /dashboard
 */

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Check, AlertTriangle } from 'lucide-react'
// Import via subpath direto · evita pull do barrel @clinicai/supabase que
// re-exporta loadServerContext (depende de next/headers · RSC-only).
// Webpack proibia client component importar isso indireto.
import { createBrowserClient } from '@clinicai/supabase/browser'
import { ROLE_LABELS, type StaffRole } from '@/lib/permissions'

type View = 'loading' | 'noToken' | 'login' | 'collectName' | 'register' | 'success' | 'error'

export function JoinClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [view, setView] = useState<View>('loading')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [acceptedRole, setAcceptedRole] = useState<StaffRole | null>(null)

  // form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Detecta sessao na carga · escolhe view inicial
  useEffect(() => {
    if (!token) {
      setView('noToken')
      return
    }
    const sb = createBrowserClient()
    sb.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.user?.email) {
          setEmail(session.user.email)
          setView('collectName')
        } else {
          setView('login')
        }
      })
      .catch(() => setView('login'))
  }, [token])

  async function tryAccept(fname: string, lname: string) {
    if (!token) return
    // Cast pra any · accept_invitation RPC nao esta nos types gerados ainda
    // (clinic-dashboard migrations rodaram fora do codegen do clinicai-v2).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = createBrowserClient() as any
    try {
      const { data, error: rpcErr } = await sb.rpc('accept_invitation', {
        p_raw_token: token,
        p_first_name: fname,
        p_last_name: lname,
      })
      if (rpcErr) throw rpcErr
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any
      if (!d?.ok) {
        const msgs: Record<string, string> = {
          invalid_or_expired_token: 'Convite inválido ou expirado.',
          email_mismatch: 'Este convite é para outro email.',
          already_has_profile: 'Esta conta já possui acesso ativo.',
        }
        throw new Error(msgs[d?.error] || d?.error || 'Erro ao aceitar convite')
      }
      setAcceptedRole(d.role as StaffRole)
      setView('success')
    } catch (e) {
      setError((e as Error).message || 'Erro inesperado')
      setView('error')
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const sb = createBrowserClient()
    try {
      const { error: signInErr } = await sb.auth.signInWithPassword({ email, password })
      if (signInErr) {
        if (
          signInErr.message.includes('Invalid login') ||
          signInErr.message.includes('invalid_credentials')
        ) {
          setView('register')
          return
        }
        throw signInErr
      }
      setView('collectName')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!firstName.trim()) {
      setError('Informe seu nome')
      return
    }
    if (password.length < 6) {
      setError('Senha precisa de ao menos 6 caracteres')
      return
    }
    if (password !== passwordConfirm) {
      setError('As senhas não coincidem')
      return
    }

    setSubmitting(true)
    const sb = createBrowserClient()
    try {
      const { error: signUpErr } = await sb.auth.signUp({ email, password })
      if (signUpErr) throw signUpErr
      const { error: signInErr } = await sb.auth.signInWithPassword({ email, password })
      if (signInErr) throw signInErr
      await tryAccept(firstName.trim(), lastName.trim())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCollectName(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim()) {
      setError('Informe seu nome')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await tryAccept(firstName.trim(), lastName.trim())
    } finally {
      setSubmitting(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 420,
    background: 'var(--b2b-bg-1)',
    border: '1px solid var(--b2b-border)',
    borderRadius: 12,
    padding: 36,
    boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
  }

  return (
    <div style={cardStyle}>
      {/* Logo header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'var(--b2b-champagne)',
            color: 'var(--b2b-bg-0)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Cormorant Garamond, serif',
            fontWeight: 700,
            fontSize: 22,
            marginBottom: 12,
          }}
        >
          L
        </div>
        <p className="eyebrow" style={{ marginBottom: 6 }}>
          Clinica AI · Mirian de Paula
        </p>
        <h1
          className="font-display"
          style={{ fontSize: 26, color: 'var(--b2b-ivory)', lineHeight: 1.1 }}
        >
          Aceitar <em style={{ color: 'var(--b2b-champagne)' }}>convite</em>
        </h1>
      </div>

      {view === 'loading' && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--b2b-text-muted)', fontSize: 13 }}>
          Verificando convite...
        </div>
      )}

      {view === 'noToken' && (
        <Banner tone="err">
          Link de convite inválido ou ausente. Solicite um novo link à administradora.
        </Banner>
      )}

      {view === 'error' && (
        <>
          <Banner tone="err">{error || 'Erro ao processar o convite.'}</Banner>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setView('login')
            }}
            className="b2b-btn b2b-btn-primary"
            style={{ width: '100%', marginTop: 14 }}
          >
            Tentar novamente
          </button>
        </>
      )}

      {view === 'login' && (
        <form onSubmit={handleLogin}>
          <Banner tone="info">Faça login para aceitar o convite.</Banner>
          {error && <Banner tone="err">{error}</Banner>}
          <Field label="Email" required>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="b2b-input"
            />
          </Field>
          <Field label="Senha" required>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="b2b-input"
            />
          </Field>
          <button
            type="submit"
            disabled={submitting}
            className="b2b-btn b2b-btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          >
            {submitting ? 'Entrando...' : 'Entrar e aceitar convite'}
          </button>
        </form>
      )}

      {view === 'register' && (
        <form onSubmit={handleRegister}>
          <Banner tone="info">Crie sua senha para ativar o acesso.</Banner>
          {error && <Banner tone="err">{error}</Banner>}
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Nome" required>
              <input
                type="text"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className="b2b-input"
              />
            </Field>
            <Field label="Sobrenome">
              <input
                type="text"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="b2b-input"
              />
            </Field>
          </div>
          <Field label="Email" required>
            <input
              type="email"
              value={email}
              readOnly
              className="b2b-input"
              style={{ background: 'var(--b2b-bg-3)' }}
            />
          </Field>
          <Field label="Senha (mínimo 6)" required>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="b2b-input"
            />
          </Field>
          <Field label="Confirmar senha" required>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              minLength={6}
              className="b2b-input"
            />
          </Field>
          <button
            type="submit"
            disabled={submitting}
            className="b2b-btn b2b-btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          >
            {submitting ? 'Aguarde...' : 'Criar conta e aceitar convite'}
          </button>
        </form>
      )}

      {view === 'collectName' && (
        <form onSubmit={handleCollectName}>
          <Banner tone="info">Pra finalizar, confirme seu nome.</Banner>
          {error && <Banner tone="err">{error}</Banner>}
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Nome" required>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
                autoFocus
                className="b2b-input"
              />
            </Field>
            <Field label="Sobrenome">
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                className="b2b-input"
              />
            </Field>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="b2b-btn b2b-btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
          >
            {submitting ? 'Ativando...' : 'Confirmar e ativar acesso'}
          </button>
        </form>
      )}

      {view === 'success' && (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(138,158,136,0.15)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 14,
            }}
          >
            <Check className="w-6 h-6" style={{ color: 'var(--b2b-sage)' }} />
          </div>
          <p
            className="font-display"
            style={{ fontSize: 22, color: 'var(--b2b-ivory)', marginBottom: 6 }}
          >
            Acesso <em style={{ color: 'var(--b2b-champagne)' }}>ativado</em>
          </p>
          <p style={{ fontSize: 13, color: 'var(--b2b-text-dim)', marginBottom: 18 }}>
            {acceptedRole ? `Você entrou como ${ROLE_LABELS[acceptedRole]}.` : 'Bem-vinda!'}
          </p>
          <button
            type="button"
            onClick={() => router.replace('/dashboard')}
            className="b2b-btn b2b-btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Abrir painel
          </button>
        </div>
      )}
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="b2b-field" style={{ flex: 1 }}>
      <label className="b2b-field-lbl">
        {label} {required && <em>*</em>}
      </label>
      {children}
    </div>
  )
}

function Banner({ tone, children }: { tone: 'info' | 'err'; children: React.ReactNode }) {
  const colors =
    tone === 'err'
      ? {
          bg: 'rgba(217,122,122,0.10)',
          border: 'rgba(217,122,122,0.35)',
          fg: 'var(--b2b-red)',
        }
      : {
          bg: 'rgba(201,169,110,0.06)',
          border: 'var(--b2b-border)',
          fg: 'var(--b2b-text-dim)',
        }
  return (
    <div
      style={{
        padding: '10px 14px',
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        color: colors.fg,
        fontSize: 12,
        marginBottom: 14,
        lineHeight: 1.5,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      {tone === 'err' && <AlertTriangle className="w-3.5 h-3.5" style={{ flexShrink: 0, marginTop: 2 }} />}
      <span>{children}</span>
    </div>
  )
}
