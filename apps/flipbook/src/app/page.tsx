/**
 * Home · catálogo de livros publicados.
 * Server Component · faz fetch direto via Supabase SSR.
 */
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { listPublishedFlipbooks, type Flipbook } from '@/lib/supabase/flipbooks'
import { BookCard } from '@/components/cover/BookCard'
import { Library } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function CatalogPage() {
  const supabase = await createServerClient()
  let books: Flipbook[] = []
  try {
    books = await listPublishedFlipbooks(supabase)
  } catch {
    books = []
  }

  return (
    <main className="min-h-screen px-6 py-12 md:px-12 md:py-20">
      <header className="max-w-[var(--container)] mx-auto mb-16">
        <div className="flex items-center gap-4 mb-2">
          <Library className="w-5 h-5 text-gold" />
          <span className="font-meta text-gold">Biblioteca · Flipbook Premium</span>
        </div>
        <h1 className="font-display font-light text-5xl md:text-7xl text-text leading-[1.05] mb-4">
          Livros que <em className="text-gold-light italic">se viram</em>.
        </h1>
        <p className="font-display italic text-text-muted text-xl max-w-2xl leading-relaxed">
          A leitura clássica em formato editorial digital — desktop ou celular, com a mesma qualidade.
        </p>
      </header>

      <section className="max-w-[var(--container)] mx-auto">
        {books.length === 0 ? (
          <div className="border border-border rounded-lg p-16 text-center">
            <p className="text-text-muted mb-4">Nenhum livro publicado ainda.</p>
            <Link
              href="/admin"
              className="inline-block font-meta text-gold border border-gold/30 px-6 py-3 rounded hover:bg-gold/10 transition"
            >
              Subir primeiro livro
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {books.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        )}
      </section>

      <footer className="max-w-[var(--container)] mx-auto mt-24 pt-8 border-t border-border flex justify-between items-center text-xs text-text-dim">
        <span>Flipbook · v1.0 · 2026</span>
        <Link href="/admin" className="hover:text-gold transition">Admin →</Link>
      </footer>
    </main>
  )
}
