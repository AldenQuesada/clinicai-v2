'use client'

import { useState, useTransition } from 'react'
import { Plus, X, ChevronDown, ChevronRight, Tag, Trash2, Power, PowerOff } from 'lucide-react'
import type { ProductWithOffers, Offer } from '@/lib/supabase/products'
import {
  createProductAction,
  toggleProductActiveAction,
  deleteProductAction,
  createOfferAction,
  toggleOfferActiveAction,
  deleteOfferAction,
} from './actions'

interface Props {
  products: ProductWithOffers[]
  flipbooks: Array<{ id: string; title: string; slug: string }>
}

export function ProductsAdmin({ products, flipbooks }: Props) {
  const [showNewProduct, setShowNewProduct] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newOfferProductId, setNewOfferProductId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function runAction(fn: () => Promise<void>) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro desconhecido')
      }
    })
  }

  return (
    <div className="px-6 md:px-12 py-10 lg:py-14 max-w-[var(--container)] mx-auto">
      <header className="flex items-end justify-between mb-10 gap-6">
        <div>
          <div className="font-meta text-gold mb-2">Comercial</div>
          <h1 className="font-display font-light text-4xl md:text-5xl text-text leading-tight">Produtos & Ofertas</h1>
          <p className="font-display italic text-text-muted text-base mt-2 max-w-xl">
            Catálogo de produtos comerciais. Cada produto tem N ofertas (preço, janela, cupom, prioridade).
          </p>
        </div>
        <button
          onClick={() => setShowNewProduct((v) => !v)}
          className="font-meta bg-gold text-bg px-5 py-2.5 rounded hover:bg-gold-light transition flex items-center gap-2 shrink-0"
        >
          {showNewProduct ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showNewProduct ? 'Cancelar' : 'Novo produto'}
        </button>
      </header>

      {error && (
        <div className="mb-6 px-4 py-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 font-meta text-sm">
          {error}
        </div>
      )}

      {showNewProduct && (
        <NewProductForm
          flipbooks={flipbooks}
          isPending={isPending}
          onSubmit={(fd) =>
            runAction(async () => {
              await createProductAction(fd)
              setShowNewProduct(false)
            })
          }
        />
      )}

      {products.length === 0 ? (
        <div className="border border-border rounded-lg p-10 text-center bg-bg-elevated">
          <Tag className="w-10 h-10 text-text-dim mx-auto mb-4" strokeWidth={1.2} />
          <div className="font-display italic text-text-muted text-xl mb-2">Sem produtos cadastrados</div>
          <p className="font-meta text-text-dim">Cria o primeiro pra abrir o funil de venda.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              expanded={expandedId === p.id}
              onToggleExpand={() => setExpandedId((id) => (id === p.id ? null : p.id))}
              showNewOffer={newOfferProductId === p.id}
              onToggleNewOffer={() => setNewOfferProductId((id) => (id === p.id ? null : p.id))}
              isPending={isPending}
              onAction={runAction}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NewProductForm({
  flipbooks,
  isPending,
  onSubmit,
}: {
  flipbooks: Array<{ id: string; title: string; slug: string }>
  isPending: boolean
  onSubmit: (fd: FormData) => void
}) {
  const [kind, setKind] = useState<'book' | 'subscription'>('book')

  return (
    <form
      action={(fd) => onSubmit(fd)}
      className="border border-border rounded-lg p-6 mb-8 bg-bg-elevated space-y-4"
    >
      <div className="font-display italic text-text text-2xl mb-2">Novo produto</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Tipo">
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'book' | 'subscription')}
            className="input"
          >
            <option value="book">Book · livro vitalício</option>
            <option value="subscription">Subscription · biblioteca premium</option>
          </select>
        </Field>

        {kind === 'book' && (
          <Field label="Livro vinculado">
            <select name="flipbook_id" required className="input">
              <option value="">— escolha o livro —</option>
              {flipbooks.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="SKU">
          <input
            name="sku"
            required
            placeholder="ex: book-fim-da-diabetes"
            className="input"
          />
        </Field>

        <Field label="Nome">
          <input
            name="name"
            required
            placeholder='ex: "O Fim da Diabetes" · livro digital'
            className="input"
          />
        </Field>

        <Field label="Descrição (opcional)" full>
          <textarea
            name="description"
            rows={2}
            placeholder="Descrição interna · não aparece pro comprador"
            className="input"
          />
        </Field>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="font-meta bg-gold text-bg px-6 py-2.5 rounded hover:bg-gold-light transition disabled:opacity-60"
        >
          {isPending ? 'Criando...' : 'Criar produto'}
        </button>
      </div>
    </form>
  )
}

function ProductCard({
  product,
  expanded,
  onToggleExpand,
  showNewOffer,
  onToggleNewOffer,
  isPending,
  onAction,
}: {
  product: ProductWithOffers
  expanded: boolean
  onToggleExpand: () => void
  showNewOffer: boolean
  onToggleNewOffer: () => void
  isPending: boolean
  onAction: (fn: () => Promise<void>) => void
}) {
  const activeOffers = product.offers.filter((o) => o.active)

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-bg-elevated">
      <div className="p-5 flex items-center gap-4">
        <button
          onClick={onToggleExpand}
          className="text-text-muted hover:text-gold transition shrink-0"
          aria-label={expanded ? 'Recolher' : 'Expandir'}
        >
          {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <span className="font-meta text-gold text-[10px]">
              {product.kind === 'book' ? 'BOOK' : 'SUBSCRIPTION'}
            </span>
            {!product.active && (
              <span className="font-meta text-text-dim text-[10px] border border-border-strong px-2 py-0.5 rounded">
                INATIVO
              </span>
            )}
            <span className="font-meta text-text-dim text-[10px]">{activeOffers.length} oferta{activeOffers.length === 1 ? '' : 's'} ativa{activeOffers.length === 1 ? '' : 's'}</span>
          </div>
          <div className="font-display text-text text-xl truncate">{product.name}</div>
          {product.flipbook_title && (
            <div className="font-meta text-text-muted text-xs mt-0.5 truncate">↳ {product.flipbook_title}</div>
          )}
          <div className="font-meta text-text-dim text-[10px] mt-1">{product.sku}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onAction(() => toggleProductActiveAction(product.id, !product.active))}
            disabled={isPending}
            className="text-text-muted hover:text-gold transition p-2 rounded hover:bg-bg-panel"
            title={product.active ? 'Desativar' : 'Ativar'}
          >
            {product.active ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              if (confirm(`Deletar produto "${product.name}"? Ofertas serão removidas em cascata.`)) {
                onAction(() => deleteProductAction(product.id))
              }
            }}
            disabled={isPending}
            className="text-text-muted hover:text-red-400 transition p-2 rounded hover:bg-bg-panel"
            title="Deletar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-meta text-text-muted text-xs uppercase tracking-wider">Ofertas</div>
            <button
              onClick={onToggleNewOffer}
              className="font-meta text-gold hover:text-gold-light transition flex items-center gap-1.5 text-xs"
            >
              {showNewOffer ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              {showNewOffer ? 'Cancelar' : 'Nova oferta'}
            </button>
          </div>

          {showNewOffer && (
            <NewOfferForm
              productId={product.id}
              isPending={isPending}
              onSubmit={(fd) =>
                onAction(async () => {
                  await createOfferAction(fd)
                  onToggleNewOffer()
                })
              }
            />
          )}

          {product.offers.length === 0 ? (
            <div className="font-meta text-text-dim text-xs italic py-2">Nenhuma oferta criada</div>
          ) : (
            <div className="space-y-2">
              {product.offers.map((o) => (
                <OfferRow key={o.id} offer={o} isPending={isPending} onAction={onAction} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function NewOfferForm({
  productId,
  isPending,
  onSubmit,
}: {
  productId: string
  isPending: boolean
  onSubmit: (fd: FormData) => void
}) {
  return (
    <form
      action={(fd) => {
        fd.set('product_id', productId)
        onSubmit(fd)
      }}
      className="bg-bg-panel border border-border rounded p-4 mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      <Field label="Nome da oferta">
        <input name="name" required placeholder="ex: Lançamento" className="input" />
      </Field>
      <Field label="Preço (R$)">
        <input
          name="price_reais"
          type="number"
          step="0.01"
          min="0.01"
          required
          placeholder="47.00"
          className="input"
        />
      </Field>
      <Field label="Cobrança">
        <select name="billing" defaultValue="one_time" className="input">
          <option value="one_time">Vitalício (uma vez)</option>
          <option value="monthly">Mensal</option>
          <option value="yearly">Anual</option>
        </select>
      </Field>
      <Field label="Válido até (opcional)">
        <input name="valid_until" type="datetime-local" className="input" />
      </Field>
      <Field label="Limite de compras (opcional)">
        <input name="max_purchases" type="number" min="1" placeholder="ilimitado" className="input" />
      </Field>
      <Field label="Cupom (opcional)">
        <input name="coupon_code" placeholder="ex: BLACKFRIDAY30" className="input" />
      </Field>
      <Field label="Prioridade">
        <input name="priority" type="number" defaultValue={100} className="input" />
      </Field>

      <div className="md:col-span-2 lg:col-span-3 flex justify-end pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="font-meta bg-gold text-bg px-5 py-2 rounded hover:bg-gold-light transition disabled:opacity-60 text-sm"
        >
          {isPending ? 'Criando...' : 'Criar oferta'}
        </button>
      </div>
    </form>
  )
}

function OfferRow({
  offer,
  isPending,
  onAction,
}: {
  offer: Offer
  isPending: boolean
  onAction: (fn: () => Promise<void>) => void
}) {
  const price = (offer.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: offer.currency })
  const billingLabel = offer.billing === 'one_time' ? 'vitalício' : offer.billing === 'monthly' ? '/mês' : '/ano'
  const now = new Date()
  const validFrom = new Date(offer.valid_from)
  const validUntil = offer.valid_until ? new Date(offer.valid_until) : null
  const inWindow = validFrom <= now && (!validUntil || validUntil > now)
  const capacityFull = offer.max_purchases !== null && offer.current_purchases >= offer.max_purchases
  const live = offer.active && inWindow && !capacityFull

  return (
    <div className="bg-bg-elevated border border-border rounded p-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <span className="font-display text-text text-base">{offer.name}</span>
          <span
            className={`font-meta text-[9px] px-2 py-0.5 rounded border ${
              live
                ? 'border-gold/40 text-gold bg-gold/10'
                : 'border-border-strong text-text-dim'
            }`}
          >
            {live ? 'LIVE' : !offer.active ? 'INATIVA' : !inWindow ? 'FORA DA JANELA' : 'ESGOTADA'}
          </span>
          {offer.coupon_code && (
            <span className="font-meta text-[9px] px-2 py-0.5 rounded bg-bg-panel border border-border text-text-muted">
              CUPOM: {offer.coupon_code}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 font-meta text-text-dim text-[10px]">
          <span className="text-gold-light">{price} {billingLabel}</span>
          <span>·</span>
          <span>prio {offer.priority}</span>
          {validUntil && (
            <>
              <span>·</span>
              <span>até {validUntil.toLocaleDateString('pt-BR')}</span>
            </>
          )}
          {offer.max_purchases !== null && (
            <>
              <span>·</span>
              <span>{offer.current_purchases}/{offer.max_purchases}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onAction(() => toggleOfferActiveAction(offer.id, !offer.active))}
          disabled={isPending}
          className="text-text-muted hover:text-gold transition p-1.5 rounded"
          title={offer.active ? 'Desativar' : 'Ativar'}
        >
          {offer.active ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => {
            if (confirm(`Deletar oferta "${offer.name}"?`)) {
              onAction(() => deleteOfferAction(offer.id))
            }
          }}
          disabled={isPending}
          className="text-text-muted hover:text-red-400 transition p-1.5 rounded"
          title="Deletar"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  full,
  children,
}: {
  label: string
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <label className={`block ${full ? 'md:col-span-2' : ''}`}>
      <span className="font-meta text-text-dim text-[10px] uppercase tracking-wider mb-1.5 block">{label}</span>
      {children}
    </label>
  )
}
