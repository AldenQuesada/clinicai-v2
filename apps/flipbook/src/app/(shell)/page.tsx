import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { listPublishedFlipbooks, type Flipbook } from '@/lib/supabase/flipbooks'
import { BookCard } from '@/components/cover/BookCard'

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
    <div className="px-6 py-10 md:px-12 md:py-14">
      <div className="max-w-[var(--container)] mx-auto">
        <header className="mb-12">
          <div className="font-meta text-gold mb-3">Biblioteca · Premium</div>
          <h2 className="font-display font-light text-4xl md:text-6xl text-text leading-[1.05] mb-4">
            Livros que <em className="text-gold-light italic">se viram</em>.
          </h2>
          <p className="font-display italic text-text-muted text-lg md:text-xl max-w-2xl leading-relaxed">
            A leitura clássica em formato editorial digital — desktop ou celular, com a mesma qualidade.
          </p>
        </header>

        <section>
          {books.length === 0 ? (
            <div className="border border-border rounded-lg p-12 md:p-16 text-center bg-bg-elevated">
              <p className="font-display italic text-text-muted text-xl mb-6">Biblioteca vazia.</p>
              <Link
                href="/admin"
                className="inline-block font-meta text-gold border border-gold/30 px-6 py-3 rounded hover:bg-gold/10 transition"
              >
                Subir primeiro livro
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
              {books.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
