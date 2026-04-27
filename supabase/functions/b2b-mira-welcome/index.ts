/**
 * ClinicAI — B2B Mira Welcome (texto + audio de apresentacao)
 *
 * Recebe partnership_id, envia:
 *   1. Mensagem de texto de boas-vindas (~4 linhas)
 *   2. Voice note da Mira se apresentando (voz Nova, ~35s)
 *
 * Ambos pela INSTANCIA MIRA (mira-mirian, num 554498787673),
 * NAO pela Lara — assim a identidade da Mira e clara pra parceira.
 *
 * Invocado por:
 *   - Trigger SQL _b2b_on_partnership_active (via pg_net)
 *   - RPC b2b_mira_welcome_resend (admin)
 *
 * Input POST:
 *   { partnership_id: "uuid", skip_if_sent?: boolean }
 *
 * Auth: Header X-B2B-Edge-Secret === env VOUCHER_AUDIO_SECRET
 */

const _OPENAI_KEY   = Deno.env.get('OPENAI_API_KEY') || ''
const _EVO_URL      = Deno.env.get('EVOLUTION_BASE_URL') || 'https://evolution.aldenquesada.site'
const _EVO_KEY      = Deno.env.get('EVOLUTION_API_KEY') || ''
const _EVO_INST     = Deno.env.get('EVOLUTION_MIRA_INSTANCE') || 'mira-mirian'
const _SB_URL       = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const _SECRET       = Deno.env.get('VOUCHER_AUDIO_SECRET') || ''

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
  // Normaliza capitalizacao (MIRIAN -> Mirian)
  return f.charAt(0).toUpperCase() + f.slice(1).toLowerCase()
}

function normalizePhone(raw: string): string {
  const d = (raw || '').replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) return '55' + d
  if (d.length === 12 || d.length === 13) return d.startsWith('55') ? d : ('55' + d.slice(-11))
  return d
}

// Fetch template editavel da b2b_comm_templates (global) pra um event_key+channel
async function fetchTemplate(eventKey: string, channel: string): Promise<any | null> {
  const r = await fetch(
    `${_SB_URL}/rest/v1/b2b_comm_templates?event_key=eq.${eventKey}&channel=eq.${channel}&is_active=eq.true&partnership_id=is.null&order=priority.asc&limit=1`,
    { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
  )
  const arr = await r.json()
  return arr && arr[0] ? arr[0] : null
}

// Renderiza placeholders num template
function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  let out = tpl
  for (const k of Object.keys(vars)) {
    out = out.split('{' + k + '}').join(String(vars[k]))
  }
  return out
}

function capExtenso(n: number): string {
  const map: Record<number, string> = {
    1: 'um', 2: 'dois', 3: 'três', 4: 'quatro', 5: 'cinco',
    6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez',
    12: 'doze', 15: 'quinze', 20: 'vinte', 25: 'vinte e cinco', 30: 'trinta',
  }
  return map[n] || String(n)
}

async function fetchPartnership(id: string): Promise<any | null> {
  const r = await fetch(`${_SB_URL}/rest/v1/b2b_partnerships?id=eq.${id}&select=id,name,contact_name,contact_phone,pillar,voucher_combo,voucher_monthly_cap,welcome_mira_sent_at`, {
    headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' },
  })
  const arr = await r.json()
  return arr && arr[0] ? arr[0] : null
}

function buildTextMessage(nome: string, cap: number): string {
  const capTxt = cap > 0 ? `*${cap}* vouchers` : 'vouchers'
  return (
    `Oi, ${nome}! Que alegria ter você no Círculo de Parceiras da Clínica Mirian de Paula.\n\n` +
    `Sou a *Mira*, assistente virtual da clínica — e é por aqui que a gente vai trabalhar juntas pra encantar suas clientes e amigas.\n\n` +
    `Como funciona, em 1 minuto:\n` +
    `• Você me manda o *nome* + *WhatsApp* de quem quer presentear (áudio ou texto, como preferir).\n` +
    `• Eu confirmo com você antes de emitir.\n` +
    `• Mando o voucher direto pra ela, em seu nome.\n` +
    `• Você recebe um link pra acompanhar se ela abriu e agendou.\n\n` +
    `Você tem ${capTxt} por mês pra presentear. Faça bom uso!\n\n` +
    `Vou te mandar um áudio me apresentando com mais calma. Grande abraço!`
  )
}

function buildAudioScript(nome: string, cap: number): string {
  const capTxt = cap > 0 ? `${cap === 10 ? 'dez' : cap} vouchers` : 'vários vouchers'
  // Calibrado pra ~30-35s na voz Nova em pt-BR.
  // Evita numeros crus, URLs e termos técnicos — TTS flui melhor assim.
  return [
    `Olá ${nome}, tudo bem?`,
    `Eu sou a Mira, assistente virtual da Clínica Mirian de Paula.`,
    `Tô aqui pra te ajudar a encantar suas clientes e suas amigas.`,
    `Você pode me pedir vouchers VIP da clínica pra quem você quiser, é só me mandar por áudio ou texto aqui mesmo.`,
    `Me diz o nome da pessoa e o WhatsApp dela, que eu confirmo com você antes de emitir, e depois mando o voucher direto, como um presente seu.`,
    `Pra saber se ela abriu o voucher e agendou, é só tocar no link de acompanhamento que eu te envio.`,
    `Um grande abraço, ${nome}.`,
    `Ah, quase ia esquecendo: você tem ${capTxt} por mês pra presentear. Faça bom uso!`,
  ].join(' ')
}

const DEFAULT_TTS_INSTRUCTIONS =
  'Voz feminina brasileira, calorosa, acolhedora e sorridente — como uma amiga prestativa. ' +
  'Ritmo pausado e natural, sem pressa. Transmite alegria genuína, cuidado e proximidade. ' +
  'Tom afetivo, jamais comercial. Respeita pausas naturais depois de vírgulas e pontos. ' +
  'Entusiasmo leve, simpático. Soa como alguém que está genuinamente feliz de conhecer a pessoa.'

async function generateAudio(text: string, voice = 'nova', instructions?: string): Promise<Uint8Array> {
  if (!_OPENAI_KEY) throw new Error('OPENAI_API_KEY nao configurado')
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${_OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: voice || 'nova',
      input: text,
      response_format: 'mp3',
      instructions: instructions || DEFAULT_TTS_INSTRUCTIONS,
    }),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`openai_tts ${r.status}: ${t.slice(0, 300)}`)
  }
  return new Uint8Array(await r.arrayBuffer())
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

// Resolve canal via RPC mira_channel_get_config (mira_channels table).
// Fallback: env var se canal nao configurado.
// Retorna instance, apiUrl, apiKey efetivos.
async function resolveChannel(functionKey: string): Promise<{
  instance: string; apiUrl: string; apiKey: string; source: 'db' | 'env'
}> {
  try {
    const r = await fetch(`${_SB_URL}/rest/v1/rpc/mira_channel_get_config`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_function_key: functionKey }),
    })
    if (r.ok) {
      const cfg = await r.json()
      if (cfg && cfg.ok && cfg.instance_id && cfg.api_url && cfg.api_key) {
        return {
          instance: String(cfg.instance_id),
          apiUrl:   String(cfg.api_url),
          apiKey:   String(cfg.api_key),
          source:   'db',
        }
      }
    }
  } catch (_) { /* fallback */ }
  return { instance: _EVO_INST, apiUrl: _EVO_URL, apiKey: _EVO_KEY, source: 'env' }
}

async function evoSendText(
  phone: string, text: string, ch: { instance: string; apiUrl: string; apiKey: string }
): Promise<{ waId: string | null }> {
  const r = await fetch(`${ch.apiUrl}/message/sendText/${ch.instance}`, {
    method: 'POST',
    headers: { 'apikey': ch.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phone, text }),
  })
  const body = await r.text()
  if (!r.ok) throw new Error(`evo_send_text ${r.status}: ${body.slice(0, 300)}`)
  let parsed: any = null
  try { parsed = JSON.parse(body) } catch { /* noop */ }
  return { waId: parsed?.key?.id || null }
}

async function evoSendAudio(
  phone: string, audioB64: string, ch: { instance: string; apiUrl: string; apiKey: string }
): Promise<{ waId: string | null }> {
  const r = await fetch(`${ch.apiUrl}/message/sendWhatsAppAudio/${ch.instance}`, {
    method: 'POST',
    headers: { 'apikey': ch.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phone, audio: audioB64 }),
  })
  const body = await r.text()
  if (!r.ok) throw new Error(`evo_send_audio ${r.status}: ${body.slice(0, 300)}`)
  let parsed: any = null
  try { parsed = JSON.parse(body) } catch { /* noop */ }
  return { waId: parsed?.key?.id || null }
}

// Log no b2b_comm_dispatch_log (best-effort, mesmo log que b2b-comm-dispatch usa)
async function logDispatch(params: {
  clinicId: string | null
  partnershipId: string
  templateId?: string | null
  eventKey: string
  channel: string
  recipientRole: string
  phone: string
  senderInstance: string
  text: string
  waId: string | null
  errorMsg?: string | null
}) {
  try {
    await fetch(`${_SB_URL}/rest/v1/b2b_comm_dispatch_log`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        clinic_id:       params.clinicId,
        partnership_id:  params.partnershipId,
        template_id:     params.templateId ?? null,
        event_key:       params.eventKey,
        channel:         params.channel,
        recipient_role:  params.recipientRole,
        recipient_phone: params.phone,
        sender_instance: params.senderInstance,
        text_content:    params.text,
        wa_message_id:   params.waId,
        status:          params.errorMsg ? 'failed' : 'sent',
        error_message:   params.errorMsg ?? null,
      }),
    })
  } catch { /* silencioso */ }
}

async function markSent(partnershipId: string, ids: Record<string, string | null>, demoVoucherId: string | null) {
  const patch: Record<string, unknown> = {
    welcome_mira_sent_at: new Date().toISOString(),
    welcome_mira_message_ids: ids,
  }
  if (demoVoucherId) patch.demo_voucher_id = demoVoucherId
  await fetch(`${_SB_URL}/rest/v1/b2b_partnerships?id=eq.${partnershipId}`, {
    method: 'PATCH',
    headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(patch),
  })
}

async function rpc(name: string, args: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${_SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`[${name}] ${r.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

// Emite voucher demo em nome da propria parceira (is_demo=true pula audio beneficiario)
// e retorna o LINK puro — a mensagem de enquadramento e montada na edge (nao usa
// compose_message, que seria o texto pra beneficiaria "voce ganhou..." — aqui a
// parceira e a destinataria, entao o texto padrao soaria esquisito).
async function issueDemoVoucher(partnership: any): Promise<{ voucherId: string; link: string } | null> {
  try {
    const issued = await rpc('b2b_voucher_issue', {
      p_payload: {
        partnership_id: partnership.id,
        combo: partnership.voucher_combo || undefined,
        recipient_name: partnership.contact_name || partnership.name,
        recipient_phone: (partnership.contact_phone || '').replace(/\D/g, ''),
        theme: 'auto',
        is_demo: true,
        notes: JSON.stringify({ source: 'mira_welcome_demo', created_for: 'partner_preview' }),
      },
    })
    if (!issued?.ok || !issued?.id) return null
    const compose = await rpc('b2b_voucher_compose_message', { p_voucher_id: issued.id })
    if (!compose?.link) return null
    return { voucherId: issued.id, link: compose.link }
  } catch (e) {
    console.error('[demo_voucher] falhou:', (e as Error).message)
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return err('method_not_allowed', 405)

  if (_SECRET) {
    const provided = req.headers.get('x-b2b-edge-secret') || ''
    if (!timingSafeEqual(provided, _SECRET)) return err('unauthorized', 401)
  }

  try {
    const body = await req.json()
    const partnershipId: string = body?.partnership_id || ''
    const skipIfSent = body?.skip_if_sent !== false
    if (!partnershipId) return err('partnership_id obrigatorio')

    const p = await fetchPartnership(partnershipId)
    if (!p) return err('partnership_not_found', 404)
    if (skipIfSent && p.welcome_mira_sent_at) {
      return ok({ ok: true, skipped: 'already_sent', at: p.welcome_mira_sent_at })
    }
    if (!p.contact_phone) return err('contact_phone_missing')

    const phone = normalizePhone(p.contact_phone)
    if (!phone || phone.length < 12) return err('contact_phone_invalid', 400, { raw: p.contact_phone })

    const nome = firstName(p.contact_name || p.name)
    const cap  = Number(p.voucher_monthly_cap) || 10  // default 10 se null

    // Resolve canal (onboarding B2B = Mira). Fallback pra env var se nao configurado.
    const channel = await resolveChannel('partner_onboarding')
    console.log(`[welcome] canal resolvido: ${channel.instance} (source=${channel.source})`)

    // Busca templates editaveis da b2b_comm_templates (fallback hardcoded se ausente)
    const [textTpl, audioTpl] = await Promise.all([
      fetchTemplate('partnership_activated', 'text'),
      fetchTemplate('partnership_activated', 'audio'),
    ])

    const renderVars: Record<string, string | number> = {
      parceira: p.name || nome,
      parceira_first: nome,
      cap: String(cap),
      cap_extenso: capExtenso(cap),
      pillar: p.pillar || '',
      combo: p.voucher_combo || '',
    }

    // 1. Envia texto de apresentacao (template editavel ou fallback)
    const textMsg = textTpl?.text_template
      ? renderTemplate(textTpl.text_template, renderVars)
      : buildTextMessage(nome, cap)
    let textRes: { waId: string | null }
    try {
      textRes = await evoSendText(phone, textMsg, channel)
      await logDispatch({
        clinicId: (p as any).clinic_id ?? null, partnershipId,
        templateId: textTpl?.id ?? null, eventKey: 'partnership_activated',
        channel: 'text', recipientRole: 'partner',
        phone, senderInstance: channel.instance, text: textMsg, waId: textRes.waId,
      })
    } catch (e) {
      await logDispatch({
        clinicId: (p as any).clinic_id ?? null, partnershipId,
        templateId: textTpl?.id ?? null, eventKey: 'partnership_activated',
        channel: 'text', recipientRole: 'partner',
        phone, senderInstance: channel.instance, text: textMsg, waId: null,
        errorMsg: (e as Error).message,
      })
      throw e
    }

    // 2. Gera e envia audio (aguarda ~1.2s entre os dois pra WA entregar em ordem)
    await new Promise(r => setTimeout(r, 1200))
    const script = audioTpl?.audio_script
      ? renderTemplate(audioTpl.audio_script, renderVars)
      : buildAudioScript(nome, cap)
    const audioVoice = audioTpl?.tts_voice || 'nova'
    const audioInstr = audioTpl?.tts_instructions || undefined
    const audioBytes = await generateAudio(script, audioVoice, audioInstr)
    let audioRes: { waId: string | null }
    try {
      audioRes = await evoSendAudio(phone, toBase64(audioBytes), channel)
      await logDispatch({
        clinicId: (p as any).clinic_id ?? null, partnershipId,
        templateId: audioTpl?.id ?? null, eventKey: 'partnership_activated',
        channel: 'audio', recipientRole: 'partner',
        phone, senderInstance: channel.instance, text: '[áudio] ' + script.slice(0, 100),
        waId: audioRes.waId,
      })
    } catch (e) {
      await logDispatch({
        clinicId: (p as any).clinic_id ?? null, partnershipId,
        templateId: audioTpl?.id ?? null, eventKey: 'partnership_activated',
        channel: 'audio', recipientRole: 'partner',
        phone, senderInstance: channel.instance, text: '[áudio] ' + script.slice(0, 100),
        waId: null, errorMsg: (e as Error).message,
      })
      throw e
    }

    // 3. Voucher demo em nome da parceira (pra ela ver como o voucher fica).
    // is_demo=true — pula audio beneficiario. Enviado pela Mira com link isolado
    // numa linha (WA gera preview OG; linkify automatico).
    await new Promise(r => setTimeout(r, 1400))
    const demo = await issueDemoVoucher(p)
    let demoTextWaId: string | null = null
    let demoShareWaId: string | null = null
    let demoVoucherId: string | null = null
    if (demo) {
      demoVoucherId = demo.voucherId
      // Enquadramento + link separados em 2 envios pra WA gerar preview OG bonito
      // na 2a msg (que e so o link).
      const demoIntro =
        `Pra você ter referência, ${nome}, *emiti um voucher de exemplo em seu próprio nome* — só pra você ver como sua convidada vai receber:`
      const introRes = await evoSendText(phone, demoIntro, channel)
      demoTextWaId = introRes.waId
      await new Promise(r => setTimeout(r, 800))
      const shareRes = await evoSendText(phone, demo.link, channel)
      demoShareWaId = shareRes.waId
      await new Promise(r => setTimeout(r, 800))
      await evoSendText(phone,
        `Quando você me pedir pra presentear alguém, emito *igualzinho a esse*, só com o nome e o WhatsApp da sua convidada. Combinado?`, channel)
    }

    // 4. Marca enviado
    await markSent(partnershipId,
      { text: textRes.waId, audio: audioRes.waId, demo_intro: demoTextWaId, demo_share: demoShareWaId },
      demoVoucherId)

    return ok({
      ok: true,
      partnership_id: partnershipId,
      phone,
      text_wa_id: textRes.waId,
      audio_wa_id: audioRes.waId,
      audio_bytes: audioBytes.length,
      demo_voucher_id: demoVoucherId,
      demo_text_wa_id: demoTextWaId,
      demo_share_wa_id: demoShareWaId,
      script,
    })
  } catch (e) {
    return err((e as Error).message, 500)
  }
})
