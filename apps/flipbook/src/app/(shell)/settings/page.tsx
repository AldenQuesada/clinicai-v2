import { createServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="px-6 py-10 md:px-12 max-w-3xl mx-auto">
      <header className="mb-10">
        <div className="font-meta text-gold mb-2">Configurações · Conta</div>
        <h2 className="font-display font-light text-3xl md:text-4xl text-text">Perfil &amp; preferências</h2>
      </header>

      <section className="border border-border rounded-lg bg-bg-elevated p-6 mb-6">
        <h3 className="font-meta text-text-muted mb-4">Conta</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Email</dt>
            <dd className="text-text">{user?.email ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">User ID</dt>
            <dd className="text-text-dim font-mono text-xs">{user?.id ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Criado em</dt>
            <dd className="text-text">{user?.created_at?.slice(0, 10) ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="border border-border rounded-lg bg-bg-elevated p-6">
        <h3 className="font-meta text-text-muted mb-4">Em breve</h3>
        <ul className="text-text-muted text-sm space-y-2">
          <li>· Tema (light/dark)</li>
          <li>· Som de virar página</li>
          <li>· Idioma preferido</li>
          <li>· Apagar conta</li>
        </ul>
      </section>

      <p className="text-xs text-text-dim mt-8 text-center">
        Pra mudar senha, use <Link href="/login" className="text-gold hover:underline">login</Link> com magic link.
      </p>
    </div>
  )
}
