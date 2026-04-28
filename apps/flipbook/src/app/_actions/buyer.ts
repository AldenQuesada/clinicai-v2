'use server'

import { createServerClient } from '@/lib/supabase/server'
import { normalizeBrPhone } from '@/lib/utils/phone'
import { z } from 'zod'

const BuyerInputSchema = z.object({
  name: z.string().min(2).max(120),
  phoneRaw: z.string().min(8).max(40),
  email: z.string().email().optional().nullable(),
  productId: z.string().uuid(),
  offerId: z.string().uuid(),
  utm: z.record(z.string()).optional(),
})

export type CreateBuyerResult =
  | { ok: true; buyerId: string; status: 'pending_charge' }
  | { ok: false; error: string }

/**
 * Captura buyer do BuyModal · cria flipbook_buyers com status='new'.
 *
 * Fase 8 entrega só a captura · Fase 11 vai estender essa action pra criar
 * customer + payment Asaas e devolver invoice_url. Por enquanto retorna
 * status='pending_charge' indicando que o link Asaas será enviado por
 * WhatsApp (manualmente até Fase 11 pronta).
 */
export async function captureBuyerAction(input: unknown): Promise<CreateBuyerResult> {
  const parsed = BuyerInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Dados inválidos: ' + parsed.error.issues.map((i) => i.message).join(', ') }
  }

  const phone = normalizeBrPhone(parsed.data.phoneRaw)
  if (!phone) {
    return { ok: false, error: 'WhatsApp inválido. Inclua DDD (ex: 44 99999-8888).' }
  }

  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('flipbook_buyers')
    .insert({
      name: parsed.data.name.trim(),
      phone,
      email: parsed.data.email?.trim() || null,
      product_id: parsed.data.productId,
      offer_id: parsed.data.offerId,
      status: 'new',
      utm: parsed.data.utm ?? {},
    })
    .select('id')
    .single()

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Falha ao registrar' }
  }

  return { ok: true, buyerId: data.id, status: 'pending_charge' }
}
