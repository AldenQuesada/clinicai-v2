/**
 * Foundation POC · landing do clinicai-v2.
 *
 * Este e o ponto zero do app novo. Quando autenticacao estiver implementada,
 * usuarios autenticados serao redirecionados para /dashboard. Por agora,
 * mostra status do projeto + links pros sub-apps existentes.
 */

import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-6">
        <div className="inline-block px-3 py-1 rounded-full text-xs uppercase tracking-widest border border-[var(--color-accent)] text-[var(--color-accent)]">
          Foundation · v0.1.0
        </div>

        <h1 className="text-4xl md:text-5xl font-light">
          ClinicAI <span className="font-cursive italic text-[var(--color-accent)]">v2</span>
        </h1>

        <p className="text-[var(--color-text-muted)] text-lg leading-relaxed">
          Sistema de gestao da Clinica Mirian de Paula · stack Next.js 16 + React 19 + TS + Tailwind 4.
          Migracao organica do clinic-dashboard legacy seguindo a doutrina em{' '}
          <code className="text-[var(--color-accent)]">docs/MIGRATION_DOCTRINE.md</code>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
          <AppCard
            title="Painel (legacy)"
            href="https://painel.miriandpaula.com.br"
            stack="Vanilla JS"
            status="Operacao atual"
          />
          <AppCard
            title="Lara (Ivan)"
            href="https://lara.miriandpaula.com.br"
            stack="Next.js · pronto"
            status="Em integracao"
          />
          <AppCard
            title="App v2 (este)"
            href="#"
            stack="Next.js · este projeto"
            status="Foundation"
            current
          />
        </div>

        <div className="pt-8 text-xs text-[var(--color-text-muted)]">
          <p>Onda 0 · setup inicial</p>
          <p className="mt-1">Proximo passo: implementar auth Supabase + layout base</p>
        </div>
      </div>
    </main>
  )
}

function AppCard({
  title,
  href,
  stack,
  status,
  current,
}: {
  title: string
  href: string
  stack: string
  status: string
  current?: boolean
}) {
  const className = `block p-4 rounded-lg border transition-colors ${
    current
      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/5'
      : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-accent)]/50'
  }`
  const inner = (
    <>
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div className="text-xs text-[var(--color-text-muted)] mb-1">{stack}</div>
      <div className="text-xs text-[var(--color-accent)]">{status}</div>
    </>
  )
  if (href === '#') {
    return <div className={className}>{inner}</div>
  }
  return (
    <Link href={href} className={className} target="_blank" rel="noopener noreferrer">
      {inner}
    </Link>
  )
}
