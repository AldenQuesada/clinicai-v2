import { Suspense } from 'react'
import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-12 bg-bg">
      <div className="w-full max-w-md">
        <header className="text-center mb-10">
          <div className="font-display italic text-gold text-5xl mb-2">Flipbook</div>
          <div className="font-meta text-text-muted">Acesso Admin</div>
        </header>
        <Suspense fallback={<div className="text-text-muted text-center">Carregando…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
