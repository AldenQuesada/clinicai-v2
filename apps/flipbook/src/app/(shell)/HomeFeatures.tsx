import { BookOpen, Smartphone, Lock, Layers, ScanSearch, Volume2 } from 'lucide-react'

const FEATURES = [
  {
    Icon: Layers,
    title: 'Multi-formato',
    text: 'PDF, EPUB, CBZ e HTML renderizados nativamente. MOBI/AZW3 em conversão.',
  },
  {
    Icon: Smartphone,
    title: 'Mobile = Desktop',
    text: 'Mesma qualidade no celular: touch, swipe, fullscreen, PWA instalável.',
  },
  {
    Icon: ScanSearch,
    title: 'Sync cross-device',
    text: 'Começa no celular, continua no desktop na página exata onde parou.',
  },
  {
    Icon: Lock,
    title: 'Privado',
    text: 'Bucket privado + signed URL TTL · só você decide quem lê.',
  },
  {
    Icon: BookOpen,
    title: 'Capa cinematográfica',
    text: 'Abertura com fade, glow e parallax 3D. Cada livro vira experiência.',
  },
  {
    Icon: Volume2,
    title: 'Som de papel',
    text: 'Web Audio procedural · sutil swoosh ao virar página. Toggle on/off.',
  },
]

/**
 * Grid de features · 6 cards.
 */
export function HomeFeatures() {
  return (
    <section className="py-16 md:py-24 border-t border-border">
      <div className="max-w-[var(--container)] mx-auto px-6 md:px-12">
        <header className="mb-12">
          <div className="font-meta text-gold mb-2">O que tem dentro</div>
          <h2 className="font-display font-light text-3xl md:text-5xl text-text leading-tight">
            Funcionalidades premium <em className="text-gold-light italic">por padrão</em>.
          </h2>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ Icon, title, text }) => (
            <div
              key={title}
              className="bg-bg-elevated border border-border rounded-lg p-6 hover:border-gold/40 transition group"
            >
              <Icon className="w-7 h-7 text-gold mb-4 group-hover:scale-110 transition" strokeWidth={1.3} />
              <h3 className="font-display text-text text-xl mb-2 leading-tight">{title}</h3>
              <p className="text-text-muted text-sm leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
