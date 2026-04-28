'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, BookOpen, Check, ShieldCheck } from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { formatOfferPrice, type BookOffer } from '@/lib/supabase/products'
import { MiniFlipbook } from '@/components/public/MiniFlipbook'
import { BuyModal } from '@/components/public/BuyModal'

interface Props {
  book: Flipbook
  bookOffer: BookOffer | null
}

interface LandingMeta {
  hero_copy?: { tagline?: string | null; headline_override?: string | null; subheadline?: string | null }
  benefits?: Array<{ title: string; body: string }>
  faq?: Array<{ q: string; a: string }>
  guarantee?: string | null
}

/**
 * Landing comercial do livro · /livros/[slug].
 *
 * Sections (ordem):
 *   1. Hero · cover + tagline + headline + subheadline + CTA (sticky no mobile)
 *   2. Preview interativo (MiniFlipbook embedado)
 *   3. Benefits (3-5 cards) · vem de metadata.landing.benefits
 *   4. FAQ
 *   5. Garantia (badge)
 *   6. CTA final
 */
export function LandingClient({ book, bookOffer }: Props) {
  const [buyOpen, setBuyOpen] = useState(false)

  const landing = ((book.metadata as Record<string, unknown>)?.landing ?? {}) as LandingMeta
  const tagline = landing.hero_copy?.tagline ?? book.subtitle
  const headline = landing.hero_copy?.headline_override?.trim() || book.title
  const subheadline = landing.hero_copy?.subheadline ?? book.subtitle
  const benefits = landing.benefits ?? []
  const faq = landing.faq ?? []
  const guarantee = landing.guarantee?.trim() || ''

  const priceLabel = bookOffer ? formatOfferPrice(bookOffer.offer) : null

  function openBuy() {
    if (bookOffer) setBuyOpen(true)
  }

  return (
    <>
      {/* HERO */}
      <section className="px-6 md:px-12 pt-12 pb-20 md:pt-20 md:pb-28 relative overflow-hidden">
        <div className="max-w-[var(--container)] mx-auto grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-20 items-center">
          {/* Left · copy + CTAs */}
          <div className="order-2 lg:order-1">
            {tagline && <div className="font-meta text-gold mb-3">{tagline}</div>}
            <h1 className="font-display font-light text-4xl md:text-6xl lg:text-7xl text-text leading-[1.05] mb-6">
              {headline}
            </h1>
            {subheadline && (
              <p className="font-display italic text-text-muted text-lg md:text-xl max-w-xl leading-relaxed mb-10">
                {subheadline}
              </p>
            )}

            {bookOffer ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
                <div>
                  <div className="font-display italic text-gold-light text-4xl md:text-5xl leading-none">
                    {priceLabel}
                  </div>
                  <div className="font-meta text-text-dim text-[10px] mt-1">
                    {bookOffer.offer.billing === 'one_time'
                      ? 'pagamento único · acesso pra sempre'
                      : bookOffer.offer.billing === 'monthly'
                      ? 'cobrança mensal · cancela quando quiser'
                      : 'cobrança anual · cancela quando quiser'}
                  </div>
                </div>
                <button
                  onClick={openBuy}
                  className="font-meta bg-gold text-bg px-7 py-3.5 rounded hover:bg-gold-light transition flex items-center gap-2 justify-center sm:ml-auto"
                >
                  Comprar agora <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="mb-8">
                <Link
                  href={`/${book.slug}`}
                  className="inline-flex items-center gap-2 font-meta bg-gold text-bg px-6 py-3.5 rounded hover:bg-gold-light transition"
                >
                  <BookOpen className="w-4 h-4" />
                  Abrir leitor
                </Link>
              </div>
            )}

            <div className="flex items-center gap-6 pt-6 border-t border-border text-text-dim text-xs flex-wrap">
              <span>{book.page_count ?? '—'} páginas</span>
              <span>·</span>
              <span className="uppercase">{book.language}</span>
              <span>·</span>
              <span>{book.author}</span>
            </div>
          </div>

          {/* Right · cover */}
          <div className="order-1 lg:order-2 mb-8 lg:mb-0">
            <div className="relative aspect-[2/3] max-w-[440px] mx-auto rounded-lg overflow-hidden shadow-[0_50px_140px_rgba(0,0,0,0.7),0_15px_40px_rgba(0,0,0,0.5)]">
              {book.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={book.cover_url} alt={book.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-bg-panel">
                  <div className="font-display italic text-gold text-5xl">{book.title}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* PREVIEW INTERATIVO */}
      {(book.preview_count ?? 0) >= 1 && (
        <section className="px-6 md:px-12 py-16 md:py-24 border-t border-border">
          <div className="max-w-[var(--container)] mx-auto">
            <header className="text-center mb-10">
              <div className="font-meta text-gold mb-2">Folheia aí</div>
              <h2 className="font-display font-light text-3xl md:text-5xl text-text leading-tight">
                Lê <em className="text-gold-light italic">as primeiras páginas</em> agora.
              </h2>
            </header>
            <MiniFlipbook
              book={book}
              commerceCta={
                bookOffer
                  ? {
                      priceLabel: priceLabel ?? '',
                      productId: bookOffer.productId,
                      offerId: bookOffer.offer.id,
                      onBuy: openBuy,
                    }
                  : undefined
              }
            />
          </div>
        </section>
      )}

      {/* BENEFITS */}
      {benefits.length > 0 && (
        <section className="px-6 md:px-12 py-16 md:py-24 border-t border-border">
          <div className="max-w-[var(--container)] mx-auto">
            <header className="mb-12">
              <div className="font-meta text-gold mb-2">Por que esse livro</div>
              <h2 className="font-display font-light text-3xl md:text-5xl text-text leading-tight">
                O que você ganha lendo.
              </h2>
            </header>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {benefits.map((b, i) => (
                <div key={i} className="border border-border rounded-lg p-6 bg-bg-elevated">
                  <div className="w-9 h-9 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center mb-4">
                    <Check className="w-4 h-4 text-gold" strokeWidth={2} />
                  </div>
                  <h3 className="font-display text-text text-xl mb-2 leading-tight">{b.title}</h3>
                  <p className="font-display italic text-text-muted text-sm leading-relaxed">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      {faq.length > 0 && (
        <section className="px-6 md:px-12 py-16 md:py-24 border-t border-border">
          <div className="max-w-3xl mx-auto">
            <header className="mb-10">
              <div className="font-meta text-gold mb-2">Tira as dúvidas</div>
              <h2 className="font-display font-light text-3xl md:text-5xl text-text leading-tight">FAQ</h2>
            </header>
            <div className="space-y-4">
              {faq.map((f, i) => (
                <details key={i} className="border border-border rounded-lg bg-bg-elevated group">
                  <summary className="cursor-pointer p-5 font-display text-text text-lg flex items-start justify-between gap-4 hover:text-gold transition">
                    <span className="flex-1">{f.q}</span>
                    <span className="font-meta text-gold text-xl shrink-0 group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <div className="px-5 pb-5 font-display italic text-text-muted leading-relaxed whitespace-pre-line">
                    {f.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* GUARANTEE */}
      {guarantee && (
        <section className="px-6 md:px-12 py-12 md:py-16 border-t border-border">
          <div className="max-w-3xl mx-auto bg-bg-elevated border border-gold/30 rounded-lg p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center gap-6">
            <ShieldCheck className="w-12 h-12 text-gold shrink-0" strokeWidth={1.2} />
            <div>
              <div className="font-meta text-gold mb-2">Garantia</div>
              <p className="font-display italic text-text-muted text-base md:text-lg leading-relaxed">{guarantee}</p>
            </div>
          </div>
        </section>
      )}

      {/* CTA FINAL */}
      {bookOffer && (
        <section className="px-6 md:px-12 py-16 md:py-24 border-t border-border text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="font-display font-light text-3xl md:text-5xl text-text leading-tight mb-4">
              Bora <em className="italic text-gold-light">começar a ler?</em>
            </h2>
            <div className="font-display italic text-gold-light text-4xl md:text-5xl mb-6">{priceLabel}</div>
            <button
              onClick={openBuy}
              className="font-meta bg-gold text-bg px-8 py-4 rounded hover:bg-gold-light transition inline-flex items-center gap-2 text-base"
            >
              Comprar agora <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* Sticky CTA mobile bottom */}
      {bookOffer && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-bg-elevated/95 backdrop-blur border-t border-border p-3 z-40 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="font-display italic text-gold-light text-xl leading-none">{priceLabel}</div>
            <div className="font-meta text-text-dim text-[9px] mt-0.5 truncate">{book.title}</div>
          </div>
          <button
            onClick={openBuy}
            className="font-meta bg-gold text-bg px-5 py-3 rounded hover:bg-gold-light transition flex items-center gap-2 shrink-0 text-xs"
          >
            Comprar <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Footer */}
      <footer className="px-6 md:px-12 py-12 border-t border-border">
        <div className="max-w-[var(--container)] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-text-dim">
          <span>Flipbook · Biblioteca premium · 2026</span>
          <Link href="/" className="hover:text-gold transition">← Voltar pro catálogo</Link>
        </div>
      </footer>

      <BuyModal
        open={buyOpen && bookOffer ? { book, bookOffer } : null}
        onClose={() => setBuyOpen(false)}
      />
    </>
  )
}
