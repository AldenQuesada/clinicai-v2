/**
 * Flipbook · Edge function `flipbook-dispatch-purchase`
 *
 * Envia mensagem de boas-vindas WhatsApp imediatamente após confirmação de
 * pagamento. Invocada pelo webhook /api/webhooks/asaas (best-effort, sem
 * bloquear). Se falhar, sequences-tick (cron 15min) reenfileira eventualmente.
 *
 * Input POST JSON:
 *   { purchaseId: "uuid" }
 *
 * Auth: header Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *
 * Fluxo:
 *   1. Busca purchase + buyer + flipbook + access_grant
 *   2. Resolve template ativo de event_key=buyer_purchase_confirmed
 *   3. Renderiza placeholders ({{buyer_name}}, {{book_title}}, {{access_link}})
 *   4. Envia via Evolution API
 *   5. Update flipbook_comm_dispatches status='sent' + provider_id
 *
 * Idempotência: dispatch row UNIQUE(buyer_id, step_id) — mesmo se invocada 2x,
 * só envia uma mensagem. Webhook + sequences-tick podem competir; vence quem
 * pegar primeiro.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return err('method_not_allowed', 405)

  // Auth
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== SB_KEY) {
    return err('unauthorized', 401)
  }

  let body: { purchaseId?: string }
  try {
    body = await req.json()
  } catch {
    return err('invalid_json')
  }
  if (!body.purchaseId) return err('purchaseId required')

  // 1. Busca purchase + buyer + product
  const purchases = await sbFetch<Array<{
    id: string
    buyer_id: string
    product_id: string
    buyer_name: string
    buyer_phone: string
    status: string
  }>>(`/flipbook_purchases?id=eq.${body.purchaseId}&select=id,buyer_id,product_id,buyer_name,buyer_phone,status`)

  if (purchases.length === 0) return err('purchase_not_found', 404)
  const purchase = purchases[0]
  if (purchase.status !== 'confirmed') return ok({ skipped: true, reason: 'not_confirmed' })

  // 2. Resolve flipbook + access_grant
  const products = await sbFetch<Array<{ flipbook_id: string }>>(
    `/flipbook_products?id=eq.${purchase.product_id}&select=flipbook_id`,
  )
  if (products.length === 0 || !products[0].flipbook_id) return err('flipbook_not_found', 404)
  const flipbookId = products[0].flipbook_id

  const flipbooks = await sbFetch<Array<{ slug: string; title: string }>>(
    `/flipbooks?id=eq.${flipbookId}&select=slug,title`,
  )
  if (flipbooks.length === 0) return err('flipbook_lookup_failed', 404)
  const book = flipbooks[0]

  const grants = await sbFetch<Array<{ access_token: string }>>(
    `/flipbook_access_grants?purchase_id=eq.${purchase.id}&select=access_token&order=created_at.desc&limit=1`,
  )
  if (grants.length === 0) return err('access_grant_not_found', 404)
  const accessLink = `${PUBLIC_BASE_URL}/${book.slug}?t=${grants[0].access_token}`

  // 3. Procura dispatch pendente · idempotência
  const pending = await sbFetch<Array<{ id: string; status: string }>>(
    `/flipbook_comm_dispatches?buyer_id=eq.${purchase.buyer_id}&event_key=eq.buyer_purchase_confirmed&status=eq.pending&order=created_at.desc&limit=1`,
  )

  let dispatchId: string
  if (pending.length > 0) {
    dispatchId = pending[0].id
  } else {
    // Cria dispatch (caso webhook não tenha enfileirado)
    const created = await sbFetch<Array<{ id: string }>>(`/flipbook_comm_dispatches`, {
      method: 'POST',
      body: JSON.stringify({
        buyer_id: purchase.buyer_id,
        event_key: 'buyer_purchase_confirmed',
        channel: 'whatsapp',
        status: 'pending',
        scheduled_for: new Date().toISOString(),
      }),
    })
    dispatchId = created[0].id
  }

  // 4. Resolve template
  const templates = await sbFetch<Array<{ body: string }>>(
    `/flipbook_comm_templates?event_key=eq.buyer_purchase_confirmed&channel=eq.whatsapp&is_active=eq.true&limit=1`,
  )
  if (templates.length === 0) {
    await sbFetch(`/flipbook_comm_dispatches?id=eq.${dispatchId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'failed', error_text: 'no_template' }),
    })
    return err('template_not_found', 500)
  }

  const renderedBody = renderTemplate(templates[0].body, {
    buyer_name: purchase.buyer_name.split(' ')[0],
    book_title: book.title,
    book_slug: book.slug,
    access_link: accessLink,
  })

  // 5. Envia
  try {
    const { messageId } = await sendWhatsApp(purchase.buyer_phone, renderedBody)
    await sbFetch(`/flipbook_comm_dispatches?id=eq.${dispatchId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'sent',
        sent_at: new Date().toISOString(),
        rendered_body: renderedBody,
        provider_id: messageId,
        variables_used: { buyer_name: purchase.buyer_name, book_title: book.title, access_link: accessLink },
      }),
    })
    return ok({ ok: true, dispatchId, messageId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sbFetch(`/flipbook_comm_dispatches?id=eq.${dispatchId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'failed',
        error_text: msg.slice(0, 500),
      }),
    })
    return err(`evolution_failed: ${msg}`, 502)
  }
})
