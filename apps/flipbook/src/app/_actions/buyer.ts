'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { normalizeBrPhone, normalizeCpf } from '@/lib/utils/phone'
import {
  createCustomer,
  findCustomerByExternalReference,
  createPayment,
  createSubscription,
  findFirstPaymentBySubscription,
  offerBillingToAsaasCycle,
  AsaasError,
} from '@/lib/payments/asaas'
import { z } from 'zod'

const BuyerInputSchema = z.object({
  name: z.string().min(2).max(120),
  phoneRaw: z.string().min(8).max(40),
  cpfRaw: z.string().min(11).max(20),
  email: z.string().email().optional().nullable(),
  productId: z.string().uuid(),
  offerId: z.string().uuid(),
  utm: z.record(z.string()).optional(),
})

export type CreateLeadAndChargeResult =
  | {
      ok: true
      buyerId: string
      invoiceUrl: string
      kind: 'one_time' | 'subscription'
      gatewayId: string
    }
  | { ok: false; error: string }

/**
 * Captura buyer + cria charge Asaas + persiste purchase/subscription.
 *
 * Fluxo:
 *   1. Valida input + normaliza phone/cpf
 *   2. Insere flipbook_buyers status='new'
 *   3. Busca product + offer (validar still active + within window)
 *   4. Asaas: createCustomer (idempotente por externalReference=buyer.id)
 *   5. Asaas: createPayment (one_time) ou createSubscription (monthly/yearly)
 *   6. Insere flipbook_purchases status='pending' OR flipbook_subscriptions status='active'
 *   7. Update buyer status='charge_created'
 *   8. Retorna invoiceUrl pro frontend redirecionar
 *
 * Em caso de falha após inserir buyer: deixa o buyer no status='new' pra retry.
 * O webhook posterior reconcilia tudo via gateway_charge_id.
 */
export async function createLeadAndChargeAction(
  input: unknown,
): Promise<CreateLeadAndChargeResult> {
  const parsed = BuyerInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: 'Dados inválidos: ' + parsed.error.issues.map((i) => i.message).join(', ') }
  }

  const phone = normalizeBrPhone(parsed.data.phoneRaw)
  if (!phone) {
    return { ok: false, error: 'WhatsApp inválido. Inclua DDD (ex: 44 99999-8888).' }
  }

  const cpf = normalizeCpf(parsed.data.cpfRaw)
  if (!cpf) {
    return { ok: false, error: 'CPF inválido.' }
  }

  // Service client · bypassa RLS pra mutations em buyers/purchases/subscriptions.
  // Server actions são server-side trusted code — não dependem do role do cookie.
  const supabase = createServiceClient()

  // Step 1 · cria buyer
  const { data: buyer, error: buyerErr } = await supabase
    .from('flipbook_buyers')
    .insert({
      name: parsed.data.name.trim(),
      phone,
      cpf,
      email: parsed.data.email?.trim() || null,
      product_id: parsed.data.productId,
      offer_id: parsed.data.offerId,
      status: 'new',
      utm: parsed.data.utm ?? {},
    })
    .select('id')
    .single()

  if (buyerErr || !buyer) {
    return { ok: false, error: buyerErr?.message ?? 'Falha ao registrar' }
  }

  // Step 2 · valida product + offer ainda vigentes
  const [productRes, offerRes] = await Promise.all([
    supabase
      .from('flipbook_products')
      .select('id, kind, name, active, flipbook_id')
      .eq('id', parsed.data.productId)
      .single(),
    supabase
      .from('flipbook_offers')
      .select('id, name, price_cents, currency, billing, active, valid_from, valid_until, max_purchases, current_purchases')
      .eq('id', parsed.data.offerId)
      .single(),
  ])

  if (productRes.error || !productRes.data || !productRes.data.active) {
    return { ok: false, error: 'Produto não disponível.' }
  }
  if (offerRes.error || !offerRes.data || !offerRes.data.active) {
    return { ok: false, error: 'Oferta indisponível.' }
  }
  const offer = offerRes.data
  const now = new Date()
  const validFrom = new Date(offer.valid_from)
  const validUntil = offer.valid_until ? new Date(offer.valid_until) : null
  if (validFrom > now || (validUntil && validUntil <= now)) {
    return { ok: false, error: 'Oferta fora da janela de validade.' }
  }
  if (offer.max_purchases !== null && offer.current_purchases >= offer.max_purchases) {
    return { ok: false, error: 'Oferta esgotada.' }
  }

  const product = productRes.data
  const description = `${product.name} · oferta "${offer.name}"`

  // Step 3 · Asaas customer (idempotente por externalReference)
  let customerId: string
  try {
    const existing = await findCustomerByExternalReference(buyer.id)
    if (existing) {
      customerId = existing.id
    } else {
      const created = await createCustomer({
        name: parsed.data.name.trim(),
        cpfCnpj: cpf,
        mobilePhone: phone.startsWith('55') ? phone.slice(2) : phone, // Asaas BR sem +55
        email: parsed.data.email?.trim() || undefined,
        externalReference: buyer.id,
        notificationDisabled: true,
      })
      customerId = created.id
    }
  } catch (e) {
    console.error('[createLeadAndCharge] failed:', e)
    if (e instanceof AsaasError) {
      return { ok: false, error: `Asaas: ${e.message}` }
    }
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Falha ao criar cobrança: ${msg}` }
  }

  // Step 4 · cria payment ou subscription
  try {
    if (offer.billing === 'one_time') {
      const payment = await createPayment({
        customer: customerId,
        amountCents: offer.price_cents,
        description,
        externalReference: buyer.id,
      })

      const { error: insertErr } = await supabase.from('flipbook_purchases').insert({
        buyer_id: buyer.id,
        product_id: product.id,
        offer_id: offer.id,
        buyer_name: parsed.data.name.trim(),
        buyer_email: parsed.data.email?.trim() || null,
        buyer_phone: phone,
        buyer_cpf: cpf,
        amount_cents: offer.price_cents,
        currency: offer.currency,
        gateway: 'asaas',
        gateway_charge_id: payment.id,
        gateway_invoice_url: payment.invoiceUrl,
        status: 'pending',
      })
      if (insertErr) {
        // Charge criou mas DB falhou. Webhook eventual reconcilia.
        console.error('flipbook_purchases insert failed', insertErr)
      }

      await supabase
        .from('flipbook_buyers')
        .update({ status: 'charge_created', last_touch_at: new Date().toISOString() })
        .eq('id', buyer.id)

      return {
        ok: true,
        buyerId: buyer.id,
        invoiceUrl: payment.invoiceUrl,
        kind: 'one_time',
        gatewayId: payment.id,
      }
    } else {
      // monthly/yearly → subscription
      const sub = await createSubscription({
        customer: customerId,
        amountCents: offer.price_cents,
        cycle: offerBillingToAsaasCycle(offer.billing as 'monthly' | 'yearly'),
        description,
        externalReference: buyer.id,
      })

      // Calcula current_period_end estimado (Asaas vai confirmar via webhook)
      const periodEnd = new Date()
      if (offer.billing === 'monthly') periodEnd.setMonth(periodEnd.getMonth() + 1)
      else periodEnd.setFullYear(periodEnd.getFullYear() + 1)

      const { error: insertErr } = await supabase.from('flipbook_subscriptions').insert({
        buyer_id: buyer.id,
        product_id: product.id,
        offer_id: offer.id,
        subscriber_name: parsed.data.name.trim(),
        subscriber_email: parsed.data.email?.trim() || null,
        subscriber_phone: phone,
        subscriber_cpf: cpf,
        gateway: 'asaas',
        gateway_subscription_id: sub.id,
        gateway_customer_id: customerId,
        billing_cycle: offer.billing,
        amount_cents: offer.price_cents,
        currency: offer.currency,
        status: 'active',
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd.toISOString(),
      })
      if (insertErr) {
        console.error('flipbook_subscriptions insert failed', insertErr)
      }

      await supabase
        .from('flipbook_buyers')
        .update({ status: 'charge_created', last_touch_at: new Date().toISOString() })
        .eq('id', buyer.id)

      let invoiceUrl: string
      try {
        const firstPayment = await findFirstPaymentBySubscription(sub.id)
        invoiceUrl = firstPayment?.invoiceUrl ?? `https://www.asaas.com/c/${customerId}`
      } catch {
        invoiceUrl = `https://www.asaas.com/c/${customerId}`
      }

      return {
        ok: true,
        buyerId: buyer.id,
        invoiceUrl,
        kind: 'subscription',
        gatewayId: sub.id,
      }
    }
  } catch (e) {
    console.error('[createLeadAndCharge] failed:', e)
    if (e instanceof AsaasError) {
      return { ok: false, error: `Asaas: ${e.message}` }
    }
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Falha ao criar cobrança: ${msg}` }
  }
}

/**
 * Mantém o nome antigo como alias temporário pra não quebrar imports da Fase 8.
 * BuyModal vai migrar pro nome novo no commit desta fase.
 */
export const captureBuyerAction = createLeadAndChargeAction
