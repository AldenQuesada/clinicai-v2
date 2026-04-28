import { createServerClient } from '@/lib/supabase/server'
import { BookOpen, Eye, Clock, TrendingUp, MousePointerClick, ShoppingCart, Mail, Share2 } from 'lucide-react'

interface TopBook { id: string; title: string; views: number }
interface FunnelRow { kind: string; event_count: number; unique_sessions: number }

export const dynamic = 'force-dynamic'

const FUNNEL_ORDER: Array<{ kind: string; label: string; Icon: typeof Eye }> = [
  { kind: 'reading_engaged',         label: 'Engajou (≥ pág 3)',     Icon: TrendingUp },
  { kind: 'fullscreen_enter',        label: 'Tela cheia',            Icon: MousePointerClick },
  { kind: 'reading_complete',        label: 'Leu ≥ 75%',             Icon: BookOpen },
  { kind: 'lead_capture_shown',      label: 'Lead form aberto',      Icon: Mail },
  { kind: 'lead_capture_submitted',  label: 'Lead capturado',        Icon: Mail },
  { kind: 'amazon_click',            label: 'Click Amazon',          Icon: ShoppingCart },
  { kind: 'share_copy',              label: 'Compartilhou link',     Icon: Share2 },
  { kind: 'share_native',            label: 'Compartilhou nativo',   Icon: Share2 },
]

export default async function StatsPage() {
  const supabase = await createServerClient()

  const [booksCountRes, viewsCountRes] = await Promise.all([
    supabase.from('flipbooks').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('flipbook_views').select('*', { count: 'exact', head: true }),
  ])

  // Top books · RPC opcional
  let topBooks: TopBook[] = []
  try {
    const rpcRes = await supabase.rpc('flipbook_top_read_books', { lim: 5 })
    topBooks = (rpcRes.data as TopBook[] | null) ?? []
  } catch {}

  // Funnel de conversão (últimos 30d, todos os livros)
  let funnel: FunnelRow[] = []
  try {
    const rpcRes = await supabase.rpc('flipbook_conversion_funnel', { book_id: null, days_back: 30 })
    funnel = (rpcRes.data as FunnelRow[] | null) ?? []
  } catch {}
  const funnelMap = new Map(funnel.map((f) => [f.kind, f]))

  // Calcula taxa de conversão Amazon (clicks / engajou)
  const engaged = funnelMap.get('reading_engaged')?.unique_sessions ?? 0
  const amazonClicks = funnelMap.get('amazon_click')?.unique_sessions ?? 0
  const conversionPct = engaged > 0 ? ((amazonClicks / engaged) * 100).toFixed(1) : null

  const totalBooks = booksCountRes.count
  const totalViews = viewsCountRes.count

  return (
    <div className="px-6 py-10 md:px-12 max-w-[var(--container)] mx-auto">
      <header className="mb-10">
        <div className="font-meta text-gold mb-2">Estatísticas · Leitura</div>
        <h2 className="font-display font-light text-3xl md:text-4xl text-text">Visão geral</h2>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <Stat Icon={BookOpen} label="Livros publicados" value={totalBooks ?? 0} />
        <Stat Icon={Eye}      label="Páginas lidas (total)" value={totalViews ?? 0} />
        <Stat
          Icon={ShoppingCart}
          label="Conv. Amazon (30d)"
          value={conversionPct !== null ? `${conversionPct}%` : '—'}
          hint={conversionPct !== null ? `${amazonClicks}/${engaged} engajados` : 'sem dados'}
        />
        <Stat Icon={Clock} label="Tempo médio / página" value="—" hint="em breve" />
      </section>

      {/* FUNNEL · últimos 30 dias */}
      <section className="border border-border rounded-lg bg-bg-elevated mb-10 overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-meta text-text-muted">Funil de conversão · últimos 30 dias</h3>
          <span className="font-meta text-[9px] text-text-dim uppercase tracking-wider">Sessões únicas</span>
        </div>
        {funnel.length === 0 ? (
          <div className="px-5 py-8 text-text-dim text-sm text-center">
            Sem eventos registrados ainda. Aplique a migration <code className="text-gold-dark">0800-55</code> e
            espere algumas leituras.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {FUNNEL_ORDER.map(({ kind, label, Icon }) => {
              const row = funnelMap.get(kind)
              const sessions = row?.unique_sessions ?? 0
              const events = row?.event_count ?? 0
              const maxSessions = Math.max(...funnel.map((f) => f.unique_sessions), 1)
              const widthPct = (sessions / maxSessions) * 100
              return (
                <li key={kind} className="px-5 py-3 flex items-center gap-3">
                  <Icon className="w-3.5 h-3.5 text-gold-dark shrink-0" strokeWidth={1.5} />
                  <div className="font-meta text-text-muted text-xs w-44 shrink-0">{label}</div>
                  <div className="flex-1 h-2 bg-bg-panel rounded-full overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-gold-dark via-gold to-gold-light transition-[width] duration-500"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                  <div className="font-display italic text-text text-base w-12 text-right tabular-nums">{sessions}</div>
                  <div className="font-meta text-text-dim text-[9px] w-16 text-right">({events} ev)</div>
                </li>
              )
            })}
          </ul>
        )}
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
