import Link from 'next/link'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { Eye, EyeOff, Archive } from 'lucide-react'

const STATUS_BADGE: Record<Flipbook['status'], { label: string; cls: string; Icon: typeof Eye }> = {
  draft:     { label: 'Rascunho',  cls: 'text-text-dim',   Icon: EyeOff },
  published: { label: 'Publicado', cls: 'text-gold',       Icon: Eye },
  archived:  { label: 'Arquivado', cls: 'text-text-muted', Icon: Archive },
}

export function AdminBookRow({ book }: { book: Flipbook }) {
  const { Icon, label, cls } = STATUS_BADGE[book.status]
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <Link href={`/${book.slug}`} className="font-display text-text text-lg hover:text-gold transition">
          {book.title}
        </Link>
        <div className="text-xs text-text-dim mt-1 flex items-center gap-2">
          <span>{book.format.toUpperCase()}</span>
          <span>·</span>
          <span>{book.language.toUpperCase()}</span>
          <span>·</span>
          <span>{book.page_count ?? '—'} pgs</span>
          {book.amazon_asin && (
            <>
              <span>·</span>
              <span className="text-gold-dark">ASIN {book.amazon_asin}</span>
            </>
          )}
        </div>
      </div>
      <div className={`flex items-center gap-2 font-meta ${cls}`}>
        <Icon className="w-3 h-3" />
        {label}
      </div>
    </div>
  )
}
