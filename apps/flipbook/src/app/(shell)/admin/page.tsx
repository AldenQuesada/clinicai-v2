import { createServerClient } from '@/lib/supabase/server'
import { listAllFlipbooks, type Flipbook } from '@/lib/supabase/flipbooks'
import { UploadForm } from './UploadForm'
import { AdminBookCard } from './AdminBookCard'
import Link from 'next/link'
import { Plus } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createServerClient()
  let books: Flipbook[] = []
  try {
    books = await listAllFlipbooks(supabase)
  } catch {
    books = []
  }

  const counts = {
    total: books.length,
    published: books.filter((b) => b.status === 'published').length,
    draft: books.filter((b) => b.status === 'draft').length,
    archived: books.filter((b) => b.status === 'archived').length,
  }

  return (
    <div className="px-6 py-10 md:px-12 max-w-[var(--container)] mx-auto">
      <header className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="font-meta text-gold mb-2">Admin · Biblioteca</div>
          <h2 className="font-display font-light text-3xl md:text-4xl text-text leading-tight">
            {counts.total} {counts.total === 1 ? 'livro' : 'livros'}
            <span className="text-text-dim text-base ml-3">
              {counts.published} publicado · {counts.draft} rascunho · {counts.archived} arquivado
            </span>
          </h2>
        </div>
        <Link
          href="#upload"
          className="font-meta bg-gold text-bg px-5 py-2.5 rounded hover:bg-gold-light transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Novo livro
        </Link>
      </header>

      {/* Grid de cards */}
      {books.length === 0 ? (
        <div className="border border-border rounded-lg p-12 md:p-16 text-center bg-bg-elevated mb-12">
          <p className="font-display italic text-text-muted text-xl mb-6">Biblioteca vazia.</p>
          <Link
            href="#upload"
            className="inline-block font-meta text-gold border border-gold/30 px-6 py-3 rounded hover:bg-gold/10 transition"
          >
            Subir primeiro livro
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 md:gap-6 mb-16">
          {books.map((book) => (
            <AdminBookCard key={book.id} book={book} />
          ))}
        </div>
      )}

      <section id="upload" className="border-t border-border pt-10">
        <h3 className="font-meta text-text-muted mb-4">Subir novo livro</h3>
        <UploadForm />
      </section>
    </div>
  )
}
