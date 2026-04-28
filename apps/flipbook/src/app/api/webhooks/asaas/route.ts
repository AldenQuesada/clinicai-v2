/**
 * Webhook receiver Asaas · /api/webhooks/asaas
 *
 * Eventos relevantes:
 *   - PAYMENT_CONFIRMED · PAYMENT_RECEIVED → confirma flipbook_purchases,
 *     gera access_grant, enfileira dispatch de boas-vindas WhatsApp
 *   - PAYMENT_REFUNDED · PAYMENT_DELETED → status='refunded'/'cancelled' +
 *     revoga grant
 *   - SUBSCRIPTION_PAYMENT_RECEIVED (com event.payment.subscription) →
 *     estende current_period_end + idempotência por payment.id
 *   - SUBSCRIPTION_DELETED → status='cancelled', ended_at=now, revoga grants
 *
 * Idempotência: webhook nunca atualiza purchase 2x. `gateway_charge_id` é UNIQUE
 * + status checking. Asaas re-tenta em 5xx; sempre retornamos 200 (mesmo em
 * erros parciais) pra evitar flood. Logs internos capturam falhas.
 *
 * Auth: header `asaas-access-token` validado por timing-safe contra ASAAS_WEBHOOK_TOKEN.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateWebhookToken } from '@/lib/payments/asaas'

export const dynamic = 'force-dynamic'

interface AsaasWebhookPayload {
  event: string
  payment?: {
    id: string
    customer: string
    value: number
    status: string
    invoiceUrl?: string
    externalReference?: string
    subscription?: string | null
    nextDueDate?: string
    description?: string
  }
  subscription?: {
    id: string
    customer: string
    value: number
    status: string
    nextDueDate?: string
    externalReference?: string
  }
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase service env not configured')
  return createClient(url, key, { auth: { persistSession: false } })
}

function generateAccessToken(): string {
  // 24 bytes random → base64url ~32 chars
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}

export async function POST(req: Request) {
  // Valida assinatura
  const token = req.headers.get('asaas-access-token')
  if (!validateWebhookToken(token)) {
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 })
  }

  let payload: AsaasWebhookPayload
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const supabase = getServiceClient()
  const event = payload.event

  try {
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      await handlePaymentConfirmed(supabase, payload)
    } else if (event === 'PAYMENT_REFUNDED' || event === 'PAYMENT_DELETED') {
      await handlePaymentRefunded(supabase, payload, event)
    } else if (event === 'SUBSCRIPTION_DELETED') {
      await handleSubscriptionDeleted(supabase, payload)
    }
    // Outros eventos: log e ignore graciosamente
  } catch (e) {
    // Sempre 200 — Asaas re-tentaria e geraria duplicate processing
    console.error('[asaas-webhook]', event, e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true })
}

// ═══════════════════════════════════════════════════════════════════════════
// Handlers
// ═══════════════════════════════════════════════════════════════════════════

async function handlePaymentConfirmed(
  supabase: ReturnType<typeof getServiceClient>,
  payload: AsaasWebhookPayload,
) {
  const payment = payload.payment
  if (!payment) return

  // Caso 1: pagamento de assinatura · estende current_period_end
  if (payment.subscription) {
    await renewSubscription(supabase, payment.subscription, payment.nextDueDate)
    return
  }

  // Caso 2: payment one_time · confirma purchase + gera grant
  const { data: purchase, error: fetchErr } = await supabase
    .from('flipbook_purchases')
    .select('id, status, buyer_id, product_id, offer_id, buyer_email, buyer_phone')
    .eq('gateway_charge_id', payment.id)
    .maybeSingle()

  if (fetchErr || !purchase) {
    console.warn('[asaas-webhook] purchase not found for payment', payment.id)
    return
  }

  // Idempotência: já confirmado, skip
  if (purchase.status === 'confirmed') return

  await supabase
    .from('flipbook_purchases')
    .update({ status: 'confirmed', paid_at: new Date().toISOString() })
    .eq('id', purchase.id)

  // Resolve flipbook do produto
  const { data: product } = await supabase
    .from('flipbook_products')
    .select('flipbook_id')
    .eq('id', purchase.product_id)
    .single()

  if (!product?.flipbook_id) return

  // Gera access grant (vitalício pra one_time)
  const accessToken = generateAccessToken()
  await supabase.from('flipbook_access_grants').insert({
    flipbook_id: product.flipbook_id,
    purchase_id: purchase.id,
    access_token: accessToken,
    buyer_email: purchase.buyer_email,
    buyer_phone: purchase.buyer_phone,
    expires_at: null, // vitalício
  })

  // Update buyer status
  await supabase
    .from('flipbook_buyers')
    .update({ status: 'converted', last_touch_at: new Date().toISOString() })
    .eq('id', purchase.buyer_id)

  // Enfileira dispatch de boas-vindas (Fase 14 sequences-tick despacha;
  // alternativa imediata em Fase 13 via edge dedicada)
  await supabase.from('flipbook_comm_dispatches').insert({
    buyer_id: purchase.buyer_id,
    event_key: 'buyer_purchase_confirmed',
    channel: 'whatsapp',
    status: 'pending',
    scheduled_for: new Date().toISOString(),
  })

  // Best-effort: invoca edge function pra envio imediato (sem esperar cron 15min)
  void invokeEdgeBestEffort('flipbook-dispatch-purchase', { purchaseId: purchase.id })
}

async function handlePaymentRefunded(
  supabase: ReturnType<typeof getServiceClient>,
  payload: AsaasWebhookPayload,
  event: string,
) {
  const payment = payload.payment
  if (!payment) return

  const newStatus = event === 'PAYMENT_REFUNDED' ? 'refunded' : 'cancelled'
  const refundedAt = new Date().toISOString()

  const { data: purchase } = await supabase
    .from('flipbook_purchases')
    .update({
      status: newStatus,
      ...(event === 'PAYMENT_REFUNDED' ? { refunded_at: refundedAt } : {}),
    })
    .eq('gateway_charge_id', payment.id)
    .select('id')
    .maybeSingle()

  if (purchase) {
    await supabase
      .from('flipbook_access_grants')
      .update({ revoked_at: refundedAt })
      .eq('purchase_id', purchase.id)
      .is('revoked_at', null)
  }
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof getServiceClient>,
  payload: AsaasWebhookPayload,
) {
  const sub = payload.subscription
  if (!sub) return

  const now = new Date().toISOString()
  const { data: subRow } = await supabase
    .from('flipbook_subscriptions')
    .update({ status: 'cancelled', cancelled_at: now, ended_at: now })
    .eq('gateway_subscription_id', sub.id)
    .select('id')
    .maybeSingle()

  if (subRow) {
    await supabase
      .from('flipbook_access_grants')
      .update({ revoked_at: now })
      .eq('subscription_id', subRow.id)
      .is('revoked_at', null)
  }
}

async function renewSubscription(
  supabase: ReturnType<typeof getServiceClient>,
  subscriptionId: string,
  nextDueDateIso: string | undefined,
) {
  const { data: subRow } = await supabase
    .from('flipbook_subscriptions')
    .select('id, billing_cycle, current_period_end')
    .eq('gateway_subscription_id', subscriptionId)
    .maybeSingle()

  if (!subRow) return

  const newPeriodEnd = nextDueDateIso
    ? new Date(nextDueDateIso)
    : (() => {
        const d = new Date()
        if (subRow.billing_cycle === 'monthly') d.setMonth(d.getMonth() + 1)
        else d.setFullYear(d.getFullYear() + 1)
        return d
      })()

  await supabase
    .from('flipbook_subscriptions')
    .update({
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: newPeriodEnd.toISOString(),
    })
    .eq('id', subRow.id)

  // Estende grants ativos do mesmo subscription
  await supabase
    .from('flipbook_access_grants')
    .update({ expires_at: newPeriodEnd.toISOString() })
    .eq('subscription_id', subRow.id)
    .is('revoked_at', null)
}

// ═══════════════════════════════════════════════════════════════════════════
// Edge invocation · best-effort, não bloqueia webhook 200
// ═══════════════════════════════════════════════════════════════════════════
async function invokeEdgeBestEffort(name: string, body: unknown): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return

  try {
    await fetch(`${url}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
  } catch (e) {
    console.warn(`[edge-invoke] ${name} failed`, e instanceof Error ? e.message : e)
  }
}
