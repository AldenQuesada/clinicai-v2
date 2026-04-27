import Link from 'next/link'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { ChevronRight } from 'lucide-react'

export function BookCard({ book }: { book: Flipbook }) {
  return (
    <Link
      href={`/${book.slug}`}
      className="group block border border-border rounded-lg overflow-hidden bg-bg-elevated hover:border-border-strong transition-all duration-500 hover:-translate-y-1 hover:shadow-[var(--shadow-card)]"
    >
      <div
        className="aspect-[2/3] relative overflow-hidden bg-bg-panel"
        style={{
          backgroundImage: book.cover_url ? `url(${book.cover_url})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {!book.cover_url && (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="text-center">
              <div className="font-display italic text-gold text-3xl leading-none mb-2">
                {book.language === 'es' ? 'El Fin' : book.language === 'en' ? 'The End' : 'O Fim'}
              </div>
              <div className="font-meta text-text-muted text-[10px]">{book.author}</div>
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5">
          {book.edition && (
            <div className="font-meta text-gold mb-2">{book.edition}</div>
          )}
          <h3 className="font-display text-text text-2xl leading-tight mb-1">{book.title}</h3>
          {book.subtitle && (
            <p className="font-display italic text-text-muted text-sm mb-2">{book.subtitle}</p>
          )}
          <div className="flex items-center gap-2 text-text-dim text-xs mt-3">
            <span>{book.page_count ?? '—'} pgs</span>
            <span>·</span>
            <span className="uppercase">{book.language}</span>
            <span className="ml-auto opacity-0 group-hover:opacity-100 text-gold transition flex items-center gap-1">
              Abrir <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}
