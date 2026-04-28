/**
 * Flipbook · Edge function `flipbook-sequences-tick`
 *
 * Motor de sequências · executado por cron a cada 15min via pg_cron + http.
 *
 * Para cada sequência ativa:
 *   1. Busca buyers com status = sequence.trigger_status
 *      (charge_created → lead_recovery, converted → buyer_onboarding)
 *   2. Para cada step ordenado:
 *      a. Calcula scheduledAt = buyer.last_touch_at + step.delay_minutes
 *      b. Skip se scheduledAt > now (ainda não é hora)
 *      c. Skip se exit_condition já satisfeita (ex: buyer.status='converted'
 *         em sequence de lead_recovery)
 *      d. Skip se já existe dispatch sent/failed pra esse buyer×step
 *      e. Renderiza template + envia via Evolution
 *      f. Insere dispatch sent/failed
 *   3. Atualiza buyer.last_touch_at (move ponteiro pro próximo step)
 *   4. Para sequência de lead_recovery: marca buyer status='lost' após último
 *      step despachado
 *
 * Deploy: supabase functions deploy flipbook-sequences-tick --no-verify-jwt
 * Schedule: criar pg_cron job que faz POST a cada 15min
 *   SELECT cron.schedule('flipbook-sequences', '*/15 * * * *',
 *     $$ SELECT net.http_post(
 *          url := '<SB_URL>/functions/v1/flipbook-sequences-tick',
 *          headers := jsonb_build_object('Authorization','Bearer <SERVICE_KEY>')
 *        ); $$);
 */

const EVO_URL  = Deno.env.get('EVOLUTION_BASE_URL') || ''
const EVO_KEY  = Deno.env.get('EVOLUTION_API_KEY') || ''
const EVO_INST = Deno.env.get('EVOLUTION_FLIPBOOK_INSTANCE') || Deno.env.get('EVOLUTION_MIRA_INSTANCE') || ''
const SB_URL   = Deno.env.get('SUPABASE_URL') || ''
const SB_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const PUBLIC_BASE_URL = Deno.env.get('FLIPBOOK_PUBLIC_BASE_URL') || 'https://flipbook.aldenquesada.org'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
function err(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

async function sbFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    throw new Error(`Supabase ${path} → ${res.status}: ${await res.text()}`)
  }
  return res.json() as Promise<T>
}

async function sendWhatsApp(phoneE164: string, text: string): Promise<{ messageId: string | null }> {
  if (!EVO_URL || !EVO_KEY || !EVO_INST) {
    throw new Error('Evolution env not configured')
  }
  const res = await fetch(`${EVO_URL}/message/sendText/${EVO_INST}`, {
    method: 'POST',
    headers: { apikey: EVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phoneE164, text }),
  })
  if (!res.ok) {
    throw new Error(`Evolution ${res.status}: ${await res.text()}`)
  }
  const data = await res.json().catch(() => ({})) as Record<string, unknown>
  const messageId = (data?.key as Record<string, unknown>)?.id ?? data?.id ?? null
  return { messageId: typeof messageId === 'string' ? messageId : null }
}

interface Sequence {
  id: string
  name: string
  trigger_status: string
  is_active: boolean
}
interface Step {
  id: string
  sequence_id: string
  position: number
  delay_minutes: number
  event_key: string
  exit_condition: string | null
  is_active: boolean
}
interface Buyer {
  id: string
  name: string
  phone: string
  email: string | null
  product_id: string
  offer_id: string
  status: string
  last_touch_at: string
}
interface Template {
  body: string
}

/**
 * Avalia exit_condition simples · suporta apenas "buyer.status = X" (single
 * equality). Suficiente pra MVP. Retorna true se buyer deve sair (skipped).
 */
function evaluateExitCondition(condition: string | null, buyer: Buyer): boolean {
  if (!condition) return false
  const m = condition.match(/^buyer\.status\s*=\s*(\w+)$/)
  if (!m) return false
  return buyer.status === m[1]
}

async function resolveContextVars(buyer: Buyer): Promise<Record<string, string>> {
  // Busca product + flipbook + offer + access_grant (se existir)
  const [products, offers] = await Promise.all([
    sbFetch<Array<{ flipbook_id: string | null; name: string }>>(
      `/flipbook_products?id=eq.${buyer.product_id}&select=flipbook_id,name`,
    ),
    sbFetch<Array<{ price_cents: number; billing: string }>>(
      `/flipbook_offers?id=eq.${buyer.offer_id}&select=price_cents,billing`,
    ),
  ])

  const product = products[0]
  const offer = offers[0]

  let bookTitle = product?.name ?? 'seu livro'
  let bookSlug = ''
  if (product?.flipbook_id) {
    const books = await sbFetch<Array<{ slug: string; title: string }>>(
      `/flipbooks?id=eq.${product.flipbook_id}&select=slug,title`,
    )
    if (books[0]) {
      bookTitle = books[0].title
      bookSlug = books[0].slug
    }
  }

  // Access link (se buyer já comprou)
  let accessLink = `${PUBLIC_BASE_URL}/livros/${bookSlug}`
  if (buyer.status === 'converted') {
    const grants = await sbFetch<Array<{ access_token: string; flipbook_id: string | null }>>(
      `/flipbook_access_grants?buyer_phone=eq.${buyer.phone}&revoked_at=is.null&order=created_at.desc&limit=1`,
    )
    if (grants[0]) {
      accessLink = `${PUBLIC_BASE_URL}/${bookSlug}?t=${grants[0].access_token}`
    }
  }

  // Checkout link (pra sequência de lead_recovery)
  const checkoutLink = `${PUBLIC_BASE_URL}/livros/${bookSlug}`

  // Premium / referral placeholders (MVP: usa public landing como fallback)
  const premiumPrice = offer?.billing === 'monthly'
    ? (offer.price_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : '19,00'
  const premiumLink = `${PUBLIC_BASE_URL}/livros?premium=1`
  const referralLink = `${PUBLIC_BASE_URL}/indicar?b=${buyer.id}`

  const price = offer
    ? (offer.price_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    : '0,00'

  return {
    buyer_name: buyer.name.split(' ')[0] ?? buyer.name,
    book_title: bookTitle,
    book_slug: bookSlug,
    access_link: accessLink,
    checkout_link: checkoutLink,
    price,
    premium_price: premiumPrice,
    premium_link: premiumLink,
    referral_link: referralLink,
  }
}

async function processSequence(sequence: Sequence): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
  const result = { processed: 0, sent: 0, failed: 0, skipped: 0 }

  // Busca steps ordenados
  const steps = await sbFetch<Step[]>(
    `/flipbook_comm_sequence_steps?sequence_id=eq.${sequence.id}&is_active=eq.true&order=position.asc`,
  )
  if (steps.length === 0) return result

  // Busca buyers no trigger_status
  const buyers = await sbFetch<Buyer[]>(
    `/flipbook_buyers?status=eq.${sequence.trigger_status}&select=id,name,phone,email,product_id,offer_id,status,last_touch_at`,
  )

  for (const buyer of buyers) {
    result.processed++
    try {
      // Para cada step, decide se envia
      for (const step of steps) {
        const scheduledAt = new Date(new Date(buyer.last_touch_at).getTime() + step.delay_minutes * 60_000)
        if (scheduledAt > new Date()) continue // ainda não é hora desse step

        // Exit condition?
        if (evaluateExitCondition(step.exit_condition, buyer)) {
          result.skipped++
          continue
        }

        // Já dispatched?
        const existing = await sbFetch<Array<{ id: string; status: string }>>(
          `/flipbook_comm_dispatches?buyer_id=eq.${buyer.id}&step_id=eq.${step.id}&select=id,status&limit=1`,
        )
        if (existing.length > 0 && (existing[0].status === 'sent' || existing[0].status === 'skipped')) {
          continue
        }

        // Resolve template
        const tpls = await sbFetch<Template[]>(
          `/flipbook_comm_templates?event_key=eq.${step.event_key}&channel=eq.whatsapp&is_active=eq.true&limit=1`,
        )
        if (tpls.length === 0) {
          result.failed++
          await sbFetch(`/flipbook_comm_dispatches`, {
            method: 'POST',
            body: JSON.stringify({
              buyer_id: buyer.id,
              sequence_id: sequence.id,
              step_id: step.id,
              event_key: step.event_key,
              channel: 'whatsapp',
              status: 'failed',
              error_text: 'no_template',
              scheduled_for: scheduledAt.toISOString(),
            }),
          }).catch(() => {})
          continue
        }

        const vars = await resolveContextVars(buyer)
        const renderedBody = renderTemplate(tpls[0].body, vars)

        try {
          const { messageId } = await sendWhatsApp(buyer.phone, renderedBody)
          await sbFetch(`/flipbook_comm_dispatches`, {
            method: 'POST',
            body: JSON.stringify({
              buyer_id: buyer.id,
              sequence_id: sequence.id,
              step_id: step.id,
              event_key: step.event_key,
              channel: 'whatsapp',
              rendered_body: renderedBody,
              variables_used: vars,
              status: 'sent',
              sent_at: new Date().toISOString(),
              scheduled_for: scheduledAt.toISOString(),
              provider_id: messageId,
            }),
          })
          result.sent++

          // Última step da sequência de lead_recovery → marca buyer 'lost'
          if (sequence.name === 'lead_recovery' && step.position === steps[steps.length - 1].position) {
            await sbFetch(`/flipbook_buyers?id=eq.${buyer.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'lost', last_touch_at: new Date().toISOString() }),
            })
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          result.failed++
          await sbFetch(`/flipbook_comm_dispatches`, {
            method: 'POST',
            body: JSON.stringify({
              buyer_id: buyer.id,
              sequence_id: sequence.id,
              step_id: step.id,
              event_key: step.event_key,
              channel: 'whatsapp',
              rendered_body: renderedBody,
              variables_used: vars,
              status: 'failed',
              error_text: msg.slice(0, 500),
              scheduled_for: scheduledAt.toISOString(),
            }),
          }).catch(() => {})
        }
      }
    } catch (e) {
      console.error(`buyer ${buyer.id} processing failed`, e)
    }
  }

  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST' && req.method !== 'GET') return err('method_not_allowed', 405)

  // Auth · service role
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== SB_KEY) {
    return err('unauthorized', 401)
  }

  const sequences = await sbFetch<Sequence[]>(
    `/flipbook_comm_sequences?is_active=eq.true&select=id,name,trigger_status,is_active`,
  )

  const summary: Record<string, unknown> = { ranAt: new Date().toISOString(), sequences: {} }
  for (const seq of sequences) {
    try {
      const r = await processSequence(seq)
      ;(summary.sequences as Record<string, unknown>)[seq.name] = r
    } catch (e) {
      ;(summary.sequences as Record<string, unknown>)[seq.name] = {
        error: e instanceof Error ? e.message : String(e),
      }
    }
  }

  return ok(summary)
})
