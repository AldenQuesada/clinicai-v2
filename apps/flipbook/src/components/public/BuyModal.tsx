'use client'

import { useEffect, useState, useTransition } from 'react'
import { X, Loader2, Check, ArrowRight } from 'lucide-react'
import type { Flipbook } from '@/lib/supabase/flipbooks'
import { formatOfferPrice, type BookOffer } from '@/lib/supabase/products'
import { captureBuyerAction } from '@/app/_actions/buyer'

interface Props {
  /** Quando null, modal está fechado */
  open: { book: Flipbook; bookOffer: BookOffer } | null
  onClose: () => void
}

/**
 * Modal de compra · captura nome+WhatsApp e cria buyer no banco.
 *
 * Fluxo (Fase 8):
 *   1. Form: nome + WhatsApp (+ email opcional)
 *   2. Submit → captureBuyerAction insere flipbook_buyers status='new'
 *   3. Tela de sucesso: "Em instantes você recebe link no WhatsApp"
 *
 * Fase 11 vai estender pra criar charge Asaas + redirect pra invoice_url
 * dentro do mesmo fluxo (modal redireciona ao invés de ficar na tela de
 * sucesso).
 */
export function BuyModal({ open, onClose }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Reset state quando o modal reabre
  useEffect(() => {
    if (open) {
      setName('')
      setPhone('')
      setEmail('')
      setError(null)
      setSuccess(false)
    }
  }, [open])

  // ESC fecha
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const { book, bookOffer } = open
  const priceLabel = formatOfferPrice(bookOffer.offer)
  const billingLabel =
    bookOffer.offer.billing === 'one_time'
      ? 'pagamento único · acesso pra sempre'
      : bookOffer.offer.billing === 'monthly'
      ? 'cobrança mensal · cancela quando quiser'
      : 'cobrança anual · cancela quando quiser'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !phone.trim()) {
      setError('Nome e WhatsApp são obrigatórios.')
      return
    }
    startTransition(async () => {
      const res = await captureBuyerAction({
        name,
        phoneRaw: phone,
        email: email.trim() || null,
        productId: bookOffer.productId,
        offerId: bookOffer.offer.id,
      })
      if (res.ok) {
        setSuccess(true)
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={success ? 'Compra registrada' : `Comprar ${book.title}`}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 md:p-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-bg-elevated border border-border rounded-lg shadow-2xl relative"
      >
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-bg-panel border border-border flex items-center justify-center text-text-muted hover:text-gold hover:border-gold transition"
        >
          <X className="w-4 h-4" />
        </button>

        {success ? <SuccessView book={book} priceLabel={priceLabel} onClose={onClose} /> : (
          <div className="p-6 md:p-8">
            {/* Header */}
            <div className="mb-6">
              <div className="font-meta text-gold mb-2 text-[10px]">Garantir minha cópia</div>
              <h2 className="font-display italic text-text text-2xl md:text-3xl leading-tight mb-1">
                {book.title}
              </h2>
              <div className="flex items-baseline gap-2 mt-3">
                <div className="font-display italic text-gold-light text-3xl">{priceLabel}</div>
              </div>
              <div className="font-meta text-text-dim text-[10px] mt-1">{billingLabel}</div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <Field label="Seu nome" required>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Como você quer ser chamado"
                  autoComplete="name"
                  className="input"
                  maxLength={120}
                />
              </Field>

              <Field
                label="WhatsApp"
                required
                hint="É por aqui que vou te mandar o link de pagamento e do livro"
              >
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="(44) 99999-8888"
                  autoComplete="tel"
                  className="input"
                  maxLength={40}
                />
              </Field>

              <Field label="E-mail (opcional)">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  autoComplete="email"
                  className="input"
                  maxLength={200}
                />
              </Field>

              {error && (
                <div className="px-3 py-2.5 rounded bg-red-500/10 border border-red-500/30 text-red-300 font-meta text-[11px]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="w-full font-meta bg-gold text-bg px-5 py-3.5 rounded hover:bg-gold-light transition flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Processando...
                  </>
                ) : (
                  <>
                    Continuar pra pagamento <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="font-meta text-text-dim text-[9px] text-center pt-1 leading-relaxed">
                Ao continuar, você concorda em receber comunicações sobre essa compra no WhatsApp informado.
                Pagamento processado por Asaas (PIX, boleto ou cartão).
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function SuccessView({
  book,
  priceLabel,
  onClose,
}: {
  book: Flipbook
  priceLabel: string
  onClose: () => void
}) {
  return (
    <div className="p-8 md:p-10 text-center">
      <div className="w-16 h-16 rounded-full bg-gold/20 border border-gold/40 flex items-center justify-center mx-auto mb-6">
        <Check className="w-8 h-8 text-gold" strokeWidth={2} />
      </div>
      <h2 className="font-display italic text-text text-2xl md:text-3xl mb-3">Estamos te aguardando!</h2>
      <p className="font-display italic text-text-muted text-base leading-relaxed mb-2">
        Em instantes você recebe no WhatsApp o link de pagamento de
      </p>
      <div className="font-display italic text-gold text-xl mb-1">{book.title}</div>
      <div className="font-meta text-gold-light text-sm mb-8">{priceLabel}</div>

      <p className="font-meta text-text-dim text-[10px] mb-6 leading-relaxed">
        Pago, o livro destrava na hora. Se travar algo, é só me responder por lá.
      </p>

      <button
        onClick={onClose}
        className="font-meta border border-border text-text-muted px-5 py-2.5 rounded hover:border-gold/40 hover:text-gold transition text-xs"
      >
        Fechar
      </button>
    </div>
  )
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="font-meta text-text-dim text-[10px] uppercase tracking-wider mb-1.5 block">
        {label} {required && <span className="text-gold normal-case tracking-normal">*</span>}
      </span>
      {children}
      {hint && <span className="text-text-dim text-[11px] italic mt-1 block font-display">{hint}</span>}
    </label>
  )
}
