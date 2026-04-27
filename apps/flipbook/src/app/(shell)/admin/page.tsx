import { createServerClient } from '@/lib/supabase/server'
import { listAllFlipbooks, type Flipbook } from '@/lib/supabase/flipbooks'
import { UploadForm } from './UploadForm'
import { AdminBookRow } from './AdminBookRow'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const supabase = await createServerClient()
  let books: Flipbook[] = []
  try {
    books = await listAllFlipbooks(supabase)
  } catch {
    books = []
  }

  return (
    <div className="px-6 py-10 md:px-12 max-w-[var(--container)] mx-auto">
      <header className="mb-10">
        <div className="font-meta text-gold mb-2">Admin · Biblioteca</div>
        <h2 className="font-display font-light text-3xl md:text-4xl text-text">Gerenciar livros</h2>
      </header>

      <section className="mb-12" id="upload">
        <h3 className="font-meta text-text-muted mb-4">Subir novo livro</h3>
        <UploadForm />
      </section>

      <section>
        <h3 className="font-meta text-text-muted mb-4">{books.length} livros · todos os status</h3>
        {books.length === 0 ? (
          <p className="text-text-dim text-sm">Nenhum livro cadastrado ainda.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border bg-bg-elevated">
            {books.map((book) => (
              <AdminBookRow key={book.id} book={book} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
