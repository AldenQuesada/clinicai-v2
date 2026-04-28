/**
 * CRUD de produtos comerciais (flipbook_products) e ofertas (flipbook_offers).
 *
 * Modelo:
 *   - flipbook_products: catálogo (kind=book vinculado a flipbook_id, ou subscription)
 *   - flipbook_offers: preços vigentes com janela/cupom/priority. RPC
 *     flipbook_active_offer_for(product, coupon) resolve a oferta corrente.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'

export const ProductSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['book', 'subscription']),
  flipbook_id: z.string().uuid().nullable(),
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  active: z.boolean(),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
})

export type Product = z.infer<typeof ProductSchema>

export const OfferSchema = z.object({
  id: z.string().uuid(),
  product_id: z.string().uuid(),
  name: z.string(),
  price_cents: z.number().int().positive(),
  currency: z.string().length(3),
  billing: z.enum(['one_time', 'monthly', 'yearly']),
  valid_from: z.string(),
  valid_until: z.string().nullable(),
  max_purchases: z.number().int().nullable(),
  current_purchases: z.number().int(),
  coupon_code: z.string().nullable(),
  priority: z.number().int(),
  active: z.boolean(),
  metadata: z.record(z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
})

export type Offer = z.infer<typeof OfferSchema>

export type ProductWithOffers = Product & { offers: Offer[]; flipbook_title?: string }

export async function listProductsWithOffers(supabase: SupabaseClient): Promise<ProductWithOffers[]> {
  const [productsRes, offersRes, flipbooksRes] = await Promise.all([
    supabase.from('flipbook_products').select('*').order('created_at', { ascending: false }),
    supabase.from('flipbook_offers').select('*').order('priority', { ascending: false }),
    supabase.from('flipbooks').select('id, title'),
  ])

  if (productsRes.error) throw productsRes.error
  if (offersRes.error) throw offersRes.error

  const offersByProduct = new Map<string, Offer[]>()
  for (const row of offersRes.data ?? []) {
    const offer = OfferSchema.parse(row)
    const list = offersByProduct.get(offer.product_id) ?? []
    list.push(offer)
    offersByProduct.set(offer.product_id, list)
  }

  const titlesById = new Map<string, string>()
  for (const row of (flipbooksRes.data ?? []) as Array<{ id: string; title: string }>) {
    titlesById.set(row.id, row.title)
  }

  return (productsRes.data ?? []).map((row) => {
    const product = ProductSchema.parse(row)
    return {
      ...product,
      offers: offersByProduct.get(product.id) ?? [],
      flipbook_title: product.flipbook_id ? titlesById.get(product.flipbook_id) : undefined,
    }
  })
}

export async function listFlipbooksMinimal(
  supabase: SupabaseClient,
): Promise<Array<{ id: string; title: string; slug: string }>> {
  const { data, error } = await supabase
    .from('flipbooks')
    .select('id, title, slug')
    .order('title', { ascending: true })

  if (error) throw error
  return (data ?? []) as Array<{ id: string; title: string; slug: string }>
}

/**
 * Resolve a oferta vigente pra um produto (respeita janela, capacidade, cupom).
 * Wrapper sobre RPC flipbook_active_offer_for.
 */
export async function getActiveOffer(
  supabase: SupabaseClient,
  productId: string,
  couponCode?: string | null,
): Promise<Offer | null> {
  const { data, error } = await supabase.rpc('flipbook_active_offer_for', {
    p_product_id: productId,
    p_coupon_code: couponCode ?? null,
  })

  if (error) throw error
  if (!data) return null
  return OfferSchema.parse(data)
}

/**
 * Match flipbook_id → product → oferta vigente (sem cupom). Pra exibir preço
 * em listagens públicas (carousel, BookCard). Mostra apenas livros que têm
 * produto kind='book' ativo + oferta vigente sem cupom.
 *
 * Retorna Map<flipbook_id, { offer, productId }>.
 */
export type BookOffer = { offer: Offer; productId: string }

export async function listActiveOffersByBook(
  supabase: SupabaseClient,
): Promise<Map<string, BookOffer>> {
  // Busca produtos book ativos + ofertas ativas no mesmo round trip
  const [productsRes, offersRes] = await Promise.all([
    supabase
      .from('flipbook_products')
      .select('id, flipbook_id')
      .eq('kind', 'book')
      .eq('active', true)
      .not('flipbook_id', 'is', null),
    supabase
      .from('flipbook_offers')
      .select('*')
      .eq('active', true)
      .is('coupon_code', null)
      .lte('valid_from', new Date().toISOString())
      .order('priority', { ascending: false }),
  ])

  if (productsRes.error || offersRes.error) {
    return new Map()
  }

  const offersByProduct = new Map<string, Offer[]>()
  for (const row of offersRes.data ?? []) {
    const offer = OfferSchema.parse(row)
    // Filter window manually (pgrst RLS já fez parte, mas garantimos aqui)
    const validUntil = offer.valid_until ? new Date(offer.valid_until) : null
    const inCapacity =
      offer.max_purchases === null || offer.current_purchases < offer.max_purchases
    if ((!validUntil || validUntil > new Date()) && inCapacity) {
      const list = offersByProduct.get(offer.product_id) ?? []
      list.push(offer)
      offersByProduct.set(offer.product_id, list)
    }
  }

  const result = new Map<string, BookOffer>()
  for (const row of (productsRes.data ?? []) as Array<{ id: string; flipbook_id: string }>) {
    const offers = offersByProduct.get(row.id)
    if (offers && offers.length > 0) {
      // Já vem ordenado por priority desc; pega o primeiro
      result.set(row.flipbook_id, { offer: offers[0], productId: row.id })
    }
  }

  return result
}

export function formatOfferPrice(offer: Offer): string {
  const reais = offer.price_cents / 100
  const formatted = reais.toLocaleString('pt-BR', {
    style: 'currency',
    currency: offer.currency,
  })
  if (offer.billing === 'monthly') return `${formatted}/mês`
  if (offer.billing === 'yearly') return `${formatted}/ano`
  return formatted
}
