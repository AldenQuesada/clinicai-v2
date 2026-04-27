import Link from 'next/link'
import { BookOpen, ArrowRight } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Topbar pública (não-shell) · usada em / e /login.
 * Logo + nav simples + CTA contextual (Entrar/Dashboard).
 */
export async function PublicHeader() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const allowlist = (process.env.FLIPBOOK_ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  const isAdmin = !!user && (
    allowlist.length === 0 || allowlist.includes((user.email ?? '').toLowerCase())
  )

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="max-w-[var(--container)] mx-auto h-16 flex items-center justify-between gap-4 px-6 md:px-12">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <BookOpen className="w-5 h-5 text-gold transition-transform group-hover:scale-110" strokeWidth={1.5} />
          <span className="font-display italic text-text text-2xl leading-none">Flipbook</span>
        </Link>

        {/* Nav central */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-meta">
          <Link href="/#catalogo" className="text-text-muted hover:text-gold transition">Catálogo</Link>
          <Link href="/#features" className="text-text-muted hover:text-gold transition">Features</Link>
        </nav>

        {/* CTA direita · contextual */}
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <Link
              href="/admin"
              className="font-meta bg-gold text-bg px-4 py-2 rounded hover:bg-gold-light transition flex items-center gap-1.5 text-xs"
            >
              Dashboard <ArrowRight className="w-3 h-3" />
            </Link>
          ) : user ? (
            <span className="font-meta text-text-muted text-xs hidden sm:inline">
              {user.email}
            </span>
          ) : (
            <Link
              href="/login"
              className="font-meta border border-gold/30 text-gold px-4 py-2 rounded hover:bg-gold/10 transition text-xs"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
