/**
 * Admin · upload + lista todos os livros.
 * Protegido pelo middleware (redirect pra /login se não logado).
 */
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
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
    <main className="min-h-screen px-6 py-10 md:px-12 max-w-[var(--container)] mx-auto">
      <header className="mb-12 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/" className="text-text-muted hover:text-gold transition">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="font-meta text-gold">Admin · Biblioteca</span>
          </div>
          <h1 className="font-display font-light text-4xl md:text-5xl text-text">Gerenciar livros</h1>
        </div>
      </header>

      <section className="mb-16">
        <h2 className="font-meta text-text-muted mb-4">Subir novo livro</h2>
        <UploadForm />
      </section>

      <section>
        <h2 className="font-meta text-text-muted mb-4">{books.length} livros · todos os status</h2>
        {books.length === 0 ? (
          <p className="text-text-dim text-sm">Nenhum livro cadastrado ainda.</p>
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {books.map((book) => (
              <AdminBookRow key={book.id} book={book} />
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
