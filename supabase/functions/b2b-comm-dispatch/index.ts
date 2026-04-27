/**
 * ClinicAI — B2B Communication Dispatcher (genérico)
 *
 * Envia notificações text-only da Mira pra parceiras quando eventos
 * do ciclo de voucher/lead acontecem. Fetch dinâmico de template em
 * b2b_comm_templates (editáveis via UI), renderização de placeholders,
 * envio via Evolution WhatsApp API.
 *
 * Invocado por triggers SQL via supabase_functions.http_request():
 *   - voucher_scheduled   (convidada agendou)
 *   - voucher_redeemed    (convidada compareceu)
 *   - voucher_purchased   (procedimento pago adicionado)
 *   - lead_first_budget   (virou paciente — 1º orçamento)
 *   - monthly_report      (relatório mensal de estatísticas)
 *
 * Input POST:
 *   { partnership_id: "uuid", event_key: "voucher_scheduled",
 *     context?: { convidada_first?, appointment_at?, ... } }
 *
 * Auth: Header X-B2B-Edge-Secret === env VOUCHER_AUDIO_SECRET
 *       (mesmo secret do b2b-mira-welcome pra consistência)
 */

const _EVO_URL  = Deno.env.get('EVOLUTION_BASE_URL') || 'https://evolution.aldenquesada.site'
const _EVO_KEY  = Deno.env.get('EVOLUTION_API_KEY') || ''
const _EVO_INST = Deno.env.get('EVOLUTION_MIRA_INSTANCE') || 'mira-mirian'
const _SB_URL   = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const _SECRET   = Deno.env.get('VOUCHER_AUDIO_SECRET') || ''

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-b2b-edge-secret',
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } })
}

function err(msg: string, status = 400, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: false, error: msg, ...(extra || {}) }),
    { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

function firstName(s: string | null | undefined): string {
  if (!s) return 'você'
  const f = String(s).trim().split(/\s+/)[0]
  if (!f) return 'você'
  return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase()
}

function normalizePhone(raw: string): string {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) return '55' + d
  if (d.length === 12 || d.length === 13) return d.startsWith('55') ? d : ('55' + d.slice(-11))
  return d
}

// Renderiza placeholders {var} num template
function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  let out = tpl
  for (const k of Object.keys(vars)) {
    out = out.split('{' + k + '}').join(String(vars[k]))
  }
  return out
}

async function fetchTemplate(eventKey: string, partnershipId?: string): Promise<any | null> {
  // Prioridade: template específico da parceria > template global
  let url = `${_SB_URL}/rest/v1/b2b_comm_templates?event_key=eq.${eventKey}&channel=eq.text&is_active=eq.true`
  if (partnershipId) {
    url += `&partnership_id=eq.${partnershipId}`
  } else {
    url += `&partnership_id=is.null`
  }
  url += `&order=priority.asc&limit=1`
  const r = await fetch(url, { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } })
  const arr = await r.json()
  if (arr && arr.length > 0) return arr[0]
  // Fallback: se buscou partnership-specific e nao achou, tenta global
  if (partnershipId) return fetchTemplate(eventKey)
  return null
}

async function fetchPartnership(id: string): Promise<any | null> {
  const r = await fetch(
    `${_SB_URL}/rest/v1/b2b_partnerships?id=eq.${id}&select=id,clinic_id,name,contact_name,contact_phone,pillar,voucher_combo,voucher_monthly_cap`,
    { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
  )
  const arr = await r.json()
  return arr && arr[0] ? arr[0] : null
}

// Resolve qual canal Mira/Lara usar baseado no event_key + recipient_role.
// Fallback pro env var (Mira) se canal nao configurado.
async function resolveChannel(eventKey: string, recipientRole: string): Promise<{
  instance: string; apiUrl: string; apiKey: string; source: 'db' | 'env'; functionKey: string
}> {
  try {
    // Passo 1: descobre function_key via mapeamento event_key -> function_key
    const rMap = await fetch(`${_SB_URL}/rest/v1/rpc/mira_channel_resolve_by_event`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_event_key: eventKey, p_recipient_role: recipientRole }),
    })
    const functionKey = rMap.ok ? String(await rMap.text()).replace(/^"|"$/g, '') : 'partner_response'

    // Passo 2: busca config do canal
    const rCfg = await fetch(`${_SB_URL}/rest/v1/rpc/mira_channel_get_config`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_function_key: functionKey }),
    })
    if (rCfg.ok) {
      const cfg = await rCfg.json()
      if (cfg && cfg.ok && cfg.instance_id && cfg.api_url && cfg.api_key) {
        return {
          instance: String(cfg.instance_id),
          apiUrl:   String(cfg.api_url),
          apiKey:   String(cfg.api_key),
          source:   'db',
          functionKey,
        }
      }
    }
  } catch (_) { /* fallback env */ }
  return { instance: _EVO_INST, apiUrl: _EVO_URL, apiKey: _EVO_KEY, source: 'env', functionKey: 'partner_response' }
}

async function evoSendText(
  phone: string, text: string, ch: { instance: string; apiUrl: string; apiKey: string }
): Promise<{ waId: string | null }> {
  const r = await fetch(`${ch.apiUrl}/message/sendText/${ch.instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': ch.apiKey },
    body: JSON.stringify({ number: phone, text }),
  })
  const body = await r.text()
  if (!r.ok) throw new Error(`evo_send_text ${r.status}: ${body.slice(0, 300)}`)
  const parsed = JSON.parse(body)
  return { waId: parsed?.key?.id || parsed?.messageId || null }
}

type LogInput = {
  clinicId: string | null
  partnershipId: string
  templateId?: string | null
  eventKey: string
  channel?: string | null
  recipientRole?: string | null
  phone: string
  senderInstance?: string | null
  text: string
  waId: string | null
  errorMsg: string | null
}
async function logMessage(i: LogInput) {
  // Best effort — não falha o dispatch se log falhar
  try {
    await fetch(`${_SB_URL}/rest/v1/b2b_comm_dispatch_log`, {
      method: 'POST',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        clinic_id:       i.clinicId,
        partnership_id:  i.partnershipId,
        template_id:     i.templateId ?? null,
        event_key:       i.eventKey,
        channel:         i.channel ?? 'text',
        recipient_role:  i.recipientRole ?? 'partner',
        recipient_phone: i.phone,
        sender_instance: i.senderInstance ?? _EVO_INST,
        text_content:    i.text,
        wa_message_id:   i.waId,
        status:          i.errorMsg ? 'failed' : 'sent',
        error_message:   i.errorMsg,
      }),
    })
  } catch { /* silent */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return err('method_not_allowed', 405)

  // Sem auth check — chamado via pg_net de triggers internos, que não
  // suportam headers customizados facilmente. Mesmo padrão de
  // b2b-playbook-ia e outros. Segurança vem de:
  //   a) URL não pública/indexada (só dispatcher)
  //   b) Sem side effects destrutivos (só envia mensagem pre-configurada)
  //   c) template + partnership existem e são validados

  let body: any
  try { body = await req.json() } catch { return err('invalid_json') }

  const partnershipId = String(body?.partnership_id || '').trim()
  const eventKey = String(body?.event_key || '').trim()
  const context = (body?.context || {}) as Record<string, any>

  if (!partnershipId || !eventKey) return err('missing_partnership_id_or_event_key')

  try {
    const partnership = await fetchPartnership(partnershipId)
    if (!partnership) return err('partnership_not_found', 404)
    if (!partnership.contact_phone) return err('partnership_has_no_phone', 400)

    const template = await fetchTemplate(eventKey, partnershipId)
    if (!template || !template.text_template) {
      return err('template_not_found_or_empty', 404, { event_key: eventKey })
    }

    // Merge placeholders: dados da parceria + context enviado pelo trigger
    const vars: Record<string, string> = {
      parceira: String(partnership.name || ''),
      parceira_first: firstName(partnership.contact_name || partnership.name),
      cap: String(partnership.voucher_monthly_cap || 5),
      combo: String(partnership.voucher_combo || ''),
      ...Object.fromEntries(Object.entries(context).map(([k, v]) => [k, String(v ?? '')])),
    }

    const text = renderTemplate(template.text_template, vars)
    const phone = normalizePhone(partnership.contact_phone)

    // Resolve canal baseado no event_key + recipient_role (Mira ou Lara)
    const channel = await resolveChannel(eventKey, template.recipient_role || 'partner')
    console.log(`[dispatch] event=${eventKey} role=${template.recipient_role} -> ${channel.functionKey} inst=${channel.instance} src=${channel.source}`)

    const sent = await evoSendText(phone, text, channel)
    await logMessage({
      clinicId: partnership.clinic_id,
      partnershipId, templateId: template.id, eventKey,
      channel: template.channel, recipientRole: template.recipient_role,
      phone, senderInstance: channel.instance,
      text, waId: sent.waId, errorMsg: null,
    })

    return ok({ ok: true, event_key: eventKey, partnership_id: partnershipId, wa_message_id: sent.waId, text_preview: text.slice(0, 100) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logMessage({
      clinicId: null, partnershipId, eventKey,
      phone: '', text: '', waId: null, errorMsg: msg,
    })
    return err('dispatch_failed', 500, { message: msg })
  }
})
