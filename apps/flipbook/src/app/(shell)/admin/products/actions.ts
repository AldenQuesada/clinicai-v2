'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Server actions pra admin de produtos/ofertas.
 *
 * Auth: o layout (shell) já bloqueia rotas /admin pra usuário não-admin.
 * Mutations vão pelo client supabase autenticado (RLS authenticated all).
 */

export async function createProductAction(formData: FormData) {
  const supabase = await createServerClient()

  const kind = String(formData.get('kind') ?? '')
  const flipbook_id = formData.get('flipbook_id') ? String(formData.get('flipbook_id')) : null
  const sku = String(formData.get('sku') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null

  if (!sku || !name) throw new Error('sku e name obrigatórios')
  if (kind !== 'book' && kind !== 'subscription') throw new Error('kind inválido')
  if (kind === 'book' && !flipbook_id) throw new Error('book exige flipbook_id')
  if (kind === 'subscription' && flipbook_id) throw new Error('subscription não tem flipbook_id')

  const { error } = await supabase.from('flipbook_products').insert({
    kind,
    flipbook_id,
    sku,
    name,
    description,
    active: true,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/admin/products')
}

export async function toggleProductActiveAction(id: string, active: boolean) {
  const supabase = await createServerClient()
  const { error } = await supabase.from('flipbook_products').update({ active }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/products')
}

export async function deleteProductAction(id: string) {
  const supabase = await createServerClient()
  const { error } = await supabase.from('flipbook_products').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/products')
}

export async function createOfferAction(formData: FormData) {
  const supabase = await createServerClient()

  const product_id = String(formData.get('product_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const price_reais = Number(formData.get('price_reais') ?? 0)
  const billing = String(formData.get('billing') ?? 'one_time')
  const valid_until_raw = String(formData.get('valid_until') ?? '').trim()
  const max_purchases_raw = String(formData.get('max_purchases') ?? '').trim()
  const coupon_code = String(formData.get('coupon_code') ?? '').trim() || null
  const priority = Number(formData.get('priority') ?? 100)

  if (!product_id || !name) throw new Error('product_id e name obrigatórios')
  if (!Number.isFinite(price_reais) || price_reais <= 0) throw new Error('preço inválido')
  if (billing !== 'one_time' && billing !== 'monthly' && billing !== 'yearly') {
    throw new Error('billing inválido')
  }

  const price_cents = Math.round(price_reais * 100)
  const valid_until = valid_until_raw ? new Date(valid_until_raw).toISOString() : null
  const max_purchases = max_purchases_raw ? Number(max_purchases_raw) : null

  const { error } = await supabase.from('flipbook_offers').insert({
    product_id,
    name,
    price_cents,
    currency: 'BRL',
    billing,
    valid_from: new Date().toISOString(),
    valid_until,
    max_purchases,
    coupon_code,
    priority,
    active: true,
  })

  if (error) throw new Error(error.message)
  revalidatePath('/admin/products')
}

export async function toggleOfferActiveAction(id: string, active: boolean) {
  const supabase = await createServerClient()
  const { error } = await supabase.from('flipbook_offers').update({ active }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/products')
}

export async function deleteOfferAction(id: string) {
  const supabase = await createServerClient()
  const { error } = await supabase.from('flipbook_offers').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/products')
}
