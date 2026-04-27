import Link from 'next/link'
import { ArrowRight, Upload, BookOpen } from 'lucide-react'
import { createServerClient } from '@/lib/supabase/server'
import { listPublishedFlipbooks, type Flipbook } from '@/lib/supabase/flipbooks'
import { BookCard } from '@/components/cover/BookCard'
import { HeroBookPreview } from './HeroBookPreview'
import { HomeFeatures } from './HomeFeatures'

export const dynamic = 'force-dynamic'

export default async function CatalogPage() {
  const supabase = await createServerClient()
  let books: Flipbook[] = []
  try {
    books = await listPublishedFlipbooks(supabase)
  } catch {
    books = []
  }

  // Livro hero: pega o mais recente publicado
  const heroBook = books[0] ?? null
  const restBooks = books.slice(1)

  return (
    <>
      {/* HERO · split */}
      <section className="px-6 md:px-12 pt-12 pb-16 md:pt-20 md:pb-24">
        <div className="max-w-[var(--container)] mx-auto grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-16 items-center">
          {/* LEFT · texto + CTAs */}
          <div className="order-2 lg:order-1">
            <div className="font-meta text-gold mb-3">Biblioteca · Premium</div>
            <h1 className="font-display font-light text-4xl md:text-6xl lg:text-7xl text-text leading-[1.02] mb-6">
              Livros que <em className="text-gold-light italic">se viram</em>.
            </h1>
            <p className="font-display italic text-text-muted text-lg md:text-xl max-w-xl leading-relaxed mb-10">
              Biblioteca digital com leitor flipbook editorial · PDF, EPUB e mais.
              Desktop, celular ou modo apresentação · com a mesma qualidade premium.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-10">
              {heroBook ? (
                <Link
                  href={`/${heroBook.slug}`}
                  className="font-meta bg-gold text-bg px-6 py-3.5 rounded hover:bg-gold-light transition flex items-center gap-2 justify-center sm:justify-start"
                >
                  <BookOpen className="w-4 h-4" />
                  Ler {heroBook.edition ?? 'destaque'} agora
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              ) : (
                <Link
                  href="/admin#upload"
                  className="font-meta bg-gold text-bg px-6 py-3.5 rounded hover:bg-gold-light transition flex items-center gap-2 justify-center sm:justify-start"
                >
                  <Upload className="w-4 h-4" />
                  Subir primeiro livro
                </Link>
              )}
              {books.length > 1 && (
                <Link
                  href="#catalogo"
                  className="font-meta border border-border text-text-muted px-6 py-3.5 rounded hover:border-gold/40 hover:text-gold transition flex items-center gap-2 justify-center sm:justify-start"
                >
                  Ver todos os {books.length} livros
                </Link>
              )}
            </div>

            {/* Stats discretos */}
            {books.length > 0 && (
              <div className="flex items-center gap-8 pt-6 border-t border-border">
                <Stat n={books.length} label="livros publicados" />
                <Stat n={books.reduce((acc, b) => acc + (b.page_count ?? 0), 0)} label="páginas no catálogo" />
                <Stat
                  n={new Set(books.map((b) => b.language)).size}
                  label={books.length > 1 ? 'idiomas' : 'idioma'}
                />
              </div>
            )}
          </div>

          {/* RIGHT · preview hero */}
          <div className="order-1 lg:order-2 mb-8 lg:mb-0 px-2 md:px-8 lg:px-0">
            <HeroBookPreview book={heroBook} />
          </div>
        </div>
      </section>

      {/* FEATURES grid */}
      <HomeFeatures />

      {/* CATÁLOGO restante */}
      {restBooks.length > 0 && (
        <section id="catalogo" className="px-6 md:px-12 py-16 md:py-24 border-t border-border">
          <div className="max-w-[var(--container)] mx-auto">
            <header className="mb-10">
              <div className="font-meta text-gold mb-2">Mais no catálogo</div>
              <h2 className="font-display font-light text-3xl md:text-5xl text-text leading-tight">
                {restBooks.length} {restBooks.length === 1 ? 'outro livro' : 'outros livros'} pra ler.
              </h2>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
              {restBooks.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer pequeno */}
      <footer className="px-6 md:px-12 py-8 border-t border-border">
        <div className="max-w-[var(--container)] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-text-dim">
          <span>Flipbook · v1.0 · 2026</span>
          <Link href="/admin" className="hover:text-gold transition">Admin →</Link>
        </div>
      </footer>
    </>
  )
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <div className="font-display italic text-2xl md:text-3xl text-gold-light leading-none">{n}</div>
      <div className="font-meta text-text-dim mt-1 text-[9px]">{label}</div>
    </div>
  )
}
