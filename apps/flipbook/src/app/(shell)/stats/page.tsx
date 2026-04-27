import { createServerClient } from '@/lib/supabase/server'
import { BookOpen, Eye, Clock } from 'lucide-react'

interface TopBook { id: string; title: string; views: number }

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const supabase = await createServerClient()

  const [booksCountRes, viewsCountRes] = await Promise.all([
    supabase.from('flipbooks').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('flipbook_views').select('*', { count: 'exact', head: true }),
  ])

  // RPC opcional · função pode não existir ainda → fallback []
  let topBooks: TopBook[] = []
  try {
    const rpcRes = await supabase.rpc('flipbook_top_read_books', { lim: 5 })
    topBooks = (rpcRes.data as TopBook[] | null) ?? []
  } catch {
    topBooks = []
  }

  const totalBooks = booksCountRes.count
  const totalViews = viewsCountRes.count

  return (
    <div className="px-6 py-10 md:px-12 max-w-[var(--container)] mx-auto">
      <header className="mb-10">
        <div className="font-meta text-gold mb-2">Estatísticas · Leitura</div>
        <h2 className="font-display font-light text-3xl md:text-4xl text-text">Visão geral</h2>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
        <Stat Icon={BookOpen} label="Livros publicados" value={totalBooks ?? 0} />
        <Stat Icon={Eye}       label="Páginas lidas (total)" value={totalViews ?? 0} />
        <Stat Icon={Clock}     label="Tempo médio / página" value="—" hint="em breve" />
      </section>

      <section className="border border-border rounded-lg bg-bg-elevated">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-meta text-text-muted">Mais lidos (últimos 30 dias)</h3>
        </div>
        {topBooks.length === 0 ? (
          <div className="px-5 py-8 text-text-dim text-sm text-center">
            Sem leituras suficientes ainda. Volte aqui depois de circular alguns livros.
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {topBooks.map((b: TopBook, i: number) => (
              <li key={b.id} className="px-5 py-4 flex items-center gap-4">
                <span className="font-display italic text-gold text-2xl w-6">{i + 1}</span>
                <span className="flex-1 text-text">{b.title}</span>
                <span className="font-meta text-text-muted">{b.views} views</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function Stat({ Icon, label, value, hint }: { Icon: typeof BookOpen; label: string; value: number | string; hint?: string }) {
  return (
    <div className="border border-border rounded-lg bg-bg-elevated p-5">
      <div className="flex items-center gap-2 text-text-muted mb-3">
        <Icon className="w-4 h-4 text-gold" strokeWidth={1.5} />
        <span className="font-meta text-[9px]">{label}</span>
      </div>
      <div className="font-display italic text-4xl text-text leading-none">{value}</div>
      {hint && <div className="text-text-dim text-xs mt-2">{hint}</div>}
    </div>
  )
}
