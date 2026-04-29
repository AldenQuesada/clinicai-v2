/**
 * ClinicAI — B2B Voucher Audio (TTS + Evolution send)
 *
 * Recebe voucher_id, gera audio WhatsApp (voice note) com voz Nova
 * (gpt-4o-mini-tts, humana, pt-BR) e envia via Evolution sendWhatsAppAudio.
 *
 * Invocado por:
 *   - Trigger SQL _b2b_voucher_audio_after_insert (via pg_net)
 *   - Manual admin via Dashboard
 *
 * Input POST:
 *   {
 *     voucher_id: "uuid",
 *     skip_if_sent?: boolean  // default true
 *   }
 *
 * Auth:
 *   Header X-Voucher-Audio-Secret === env VOUCHER_AUDIO_SECRET
 */

const _OPENAI_KEY  = Deno.env.get('OPENAI_API_KEY') || ''
const _EVO_URL     = Deno.env.get('EVOLUTION_BASE_URL') || 'https://evolution.aldenquesada.site'
const _EVO_KEY     = Deno.env.get('EVOLUTION_API_KEY') || ''
const _EVO_INST    = Deno.env.get('EVOLUTION_INSTANCE') || 'Mih'
const _SB_URL      = Deno.env.get('SUPABASE_URL') || ''
const _SB_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const _SECRET      = Deno.env.get('VOUCHER_AUDIO_SECRET') || ''
// Multi-tenant aware (ADR-016): resolve via _default_clinic_id() RPC.
// Cache no boot da edge function — cron/worker roda centenas de vezes,
// nao vale pagar RPC extra por request. Refresh em erro (silent fallback).
let _CLINIC_ID_CACHE: string | null = null
async function clinicId(): Promise<string> {
  if (_CLINIC_ID_CACHE) return _CLINIC_ID_CACHE
  try {
    _CLINIC_ID_CACHE = await rpc('_default_clinic_id', {}) as string
  } catch (_e) {
    _CLINIC_ID_CACHE = '00000000-0000-0000-0000-000000000001'
  }
  return _CLINIC_ID_CACHE
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-voucher-audio-secret',
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

async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${_SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`[${name}] ${r.status}: ${text}`)
  return text ? JSON.parse(text) : null
}

function firstName(s: string | null | undefined): string {
  if (!s) return 'você'
  return String(s).trim().split(/\s+/)[0] || 'você'
}

async function fetchVoucher(voucherId: string): Promise<any | null> {
  const r = await fetch(`${_SB_URL}/rest/v1/b2b_vouchers?id=eq.${voucherId}&select=id,recipient_name,recipient_phone,combo,token,status,partnership_id,audio_sent_at,valid_until`, {
    headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' },
  })
  const arr = await r.json()
  return arr && arr[0] ? arr[0] : null
}

async function fetchPartnership(partnershipId: string): Promise<any | null> {
  const r = await fetch(`${_SB_URL}/rest/v1/b2b_partnerships?id=eq.${partnershipId}&select=name,pillar,contact_phone,public_token`, {
    headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' },
  })
  const arr = await r.json()
  return arr && arr[0] ? arr[0] : null
}

// Resolve URL do painel da parceira (parceiro.html?t=<public_token>).
// Usa RPC b2b_get_panel_url que le clinics.settings.app_host.
async function fetchPanelUrl(publicToken: string): Promise<string | null> {
  if (!publicToken) return null
  try {
    const r = await fetch(`${_SB_URL}/rest/v1/rpc/b2b_get_panel_url`, {
      method: 'POST',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: publicToken }),
    })
    if (!r.ok) return null
    const text = await r.text()
    // RPC retorna raw string, pode vir com aspas JSON
    return text.trim().replace(/^"|"$/g, '') || null
  } catch { return null }
}

// Fallback: se contact_phone vazio, pega primeiro sender ativo.
async function fetchPartnerPhone(partnershipId: string, contactPhone: string | null): Promise<string | null> {
  if (contactPhone && contactPhone.replace(/\D/g, '').length >= 10) {
    return contactPhone.replace(/\D/g, '')
  }
  const r = await fetch(
    `${_SB_URL}/rest/v1/b2b_partnership_wa_senders?partnership_id=eq.${partnershipId}&active=eq.true&select=phone&limit=1`,
    { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
  )
  const arr = await r.json()
  const p = arr && arr[0] && arr[0].phone ? String(arr[0].phone).replace(/\D/g, '') : null
  return p && p.length >= 10 ? p : null
}

function buildScript(opts: {
  recipient: string; partner: string; combo: string;
}): string {
  const nome = firstName(opts.recipient)
  const parceiro = opts.partner || 'uma parceira nossa'
  const combo = opts.combo || 'um presente especial'
  // Script aprovado — foco em benefício + oportunidade (~55s voz Nova pt-BR)
  // Posicionamento: Fotona = Ferrari dos lasers · Anovator A5 = BMW dos scanners
  return [
    `Oi ${nome}, tudo bem?`,
    `Aqui é da Clínica Mirian de Paula.`,
    `Tenho uma notícia linda pra você: a ${parceiro} acabou de te presentear com um voucher cortesia — ${combo} — porque ela confia na gente e quer muito que você viva essa experiência também.`,
    `Deixa eu te contar o que você vai receber, porque é especial.`,
    `O Véu de Noiva é o nosso protocolo com o Fotona — considerado a Ferrari dos lasers no mundo da estética. A gente vai combinar duas ponteiras com você: a de pele, que cuida da luminosidade, do tônus, das manchinhas e das linhas finas com uma precisão impressionante; e a de colágeno, que estimula sua própria produção de colágeno, de dentro pra fora. É firmeza, é viço — é aquele brilho novo que você vê no espelho depois da primeira sessão.`,
    `E o Anovator A5 é a BMW dos scanners corporais. Em poucos minutos, ele te entrega mais de cinquenta relatórios sobre sua composição corporal e sua saúde cardiovascular. Clareza total sobre onde seu corpo está agora e pra onde ele pode ir. É informação que transforma.`,
    `Esse é um presente raro, ${nome}. A ${parceiro} escolheu te dar porque acredita em você, e a oportunidade tá aí, esperando.`,
    `Dá uma olhada no link aqui em cima, me chama quando quiser marcar, e eu mesma te acompanho.`,
    `A Mirian vai adorar te receber. Um beijo!`,
  ].join(' ')
}

const DEFAULT_TTS_INSTRUCTIONS =
  'Voz feminina brasileira, calorosa, acolhedora, como uma amiga próxima falando. ' +
  'Ritmo pausado, natural, sem pressa. Transmite alegria genuína, proximidade e cuidado. ' +
  'Tom afetivo, não comercial. Respeita pausas naturais depois de virgulas e pontos.'

async function generateAudio(text: string, voice = 'nova', instructions?: string): Promise<Uint8Array> {
  if (!_OPENAI_KEY) throw new Error('OPENAI_API_KEY nao configurado')
  // Timeout 60s — OpenAI TTS as vezes trava; se demorar demais, skip audio
  // e segue pro texto/confirmacao (audio e bonus, nao bloqueante).
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
    signal: AbortSignal.timeout(60_000),
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`openai_tts ${r.status}: ${t.slice(0, 300)}`)
  }
  return new Uint8Array(await r.arrayBuffer())
}

// Busca template editavel global pra event_key+channel
async function fetchTemplate(eventKey: string, channel: string): Promise<any | null> {
  const r = await fetch(
    `${_SB_URL}/rest/v1/b2b_comm_templates?event_key=eq.${eventKey}&channel=eq.${channel}&is_active=eq.true&partnership_id=is.null&order=priority.asc&limit=1`,
    { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
  )
  const arr = await r.json()
  return arr && arr[0] ? arr[0] : null
}

function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  let out = tpl
  for (const k of Object.keys(vars)) {
    out = out.split('{' + k + '}').join(String(vars[k]))
  }
  return out
}

function toBase64(bytes: Uint8Array): string {
  // Deno native: convert Uint8Array -> base64
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

type Ch = { instance: string; apiUrl: string; apiKey: string; source: 'db' | 'env' }

async function resolveChannelByKey(fkey: string, envInstance: string): Promise<Ch> {
  try {
    const r = await fetch(`${_SB_URL}/rest/v1/rpc/mira_channel_get_config`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_function_key: fkey }),
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
  return { instance: envInstance, apiUrl: _EVO_URL, apiKey: _EVO_KEY, source: 'env' }
}

// Lara (recipient_voucher) = envia voucher pra convidada
const resolveRecipientChannel = (): Promise<Ch> => resolveChannelByKey('recipient_voucher', _EVO_INST)

// Mira (partner_response) = confirma pro parceiro que o voucher saiu
const resolvePartnerChannel   = (): Promise<Ch> => resolveChannelByKey('partner_response', 'mira-mirian')

// Confirma pro parceiro — texto curto "voucher X saiu pra Y, código ...".
// Best-effort, nao bloqueia fluxo.
async function sendPartnerConfirmation(
  partnerPhone: string, partnerName: string, recipientName: string,
  combo: string, token: string, validUntil: string | null,
  panelUrl: string | null, ch: Ch,
): Promise<{ waId: string | null; err?: string }> {
  const partnerFirst = firstName(partnerName)
  const validity = validUntil
    ? new Date(validUntil).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const lines: string[] = [
    `${partnerFirst}, prontinho! Emiti o voucher pra *${recipientName}* agora mesmo.`,
    ``,
    `🎟️ *Voucher cortesia* — ${combo}`,
    `👤 *Para:* ${recipientName}`,
    `🔑 *Código:* ${String(token).toUpperCase()}`,
  ]
  if (validity) lines.push(`⏰ *Válido até:* ${validity}`)
  lines.push(
    ``,
    `A Lara já mandou pra ela o áudio de acolhimento e o link pra agendar.`,
    `Assim que ela escolher horário, você recebe uma confirmação. 💛`,
  )
  if (panelUrl) {
    lines.push(
      ``,
      `📊 Acompanhe tudo no seu painel:`,
      panelUrl,
    )
  }
  const text = lines.join('\n')

  try {
    const r = await fetch(`${ch.apiUrl}/message/sendText/${ch.instance}`, {
      method: 'POST',
      headers: { 'apikey': ch.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: partnerPhone, text }),
    })
    if (!r.ok) {
      const body = await r.text()
      return { waId: null, err: `partner_confirm ${r.status}: ${body.slice(0, 200)}` }
    }
    const d = await r.json().catch(() => null)
    return { waId: d?.key?.id || null }
  } catch (e) {
    return { waId: null, err: (e as Error).message.slice(0, 200) }
  }
}

async function sendWhatsAppAudio(
  phone: string, audioB64: string, ch: { instance: string; apiUrl: string; apiKey: string }
): Promise<{ waId: string | null }> {
  // Evolution API v2: POST /message/sendWhatsAppAudio/{instance}
  const r = await fetch(`${ch.apiUrl}/message/sendWhatsAppAudio/${ch.instance}`, {
    method: 'POST',
    headers: { 'apikey': ch.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phone, audio: audioB64 }),
  })
  const body = await r.text()
  if (!r.ok) throw new Error(`evolution_send ${r.status}: ${body.slice(0, 300)}`)
  let parsed: any = null
  try { parsed = JSON.parse(body) } catch { /* noop */ }
  return { waId: parsed?.key?.id || null }
}

// Envia texto pela mesma instancia (Lara) com o link do voucher. O audio
// referencia "olha o link aqui em cima" — sem esse texto, convidada recebe
// audio sem destino de agendamento. Best-effort: se falhar, nao bloqueia
// o fluxo do voucher (audio ja foi entregue).
//
// Template canonico: b2b_comm_templates voucher_issued_beneficiary/text.
// Memory feedback_event_dispatch_trio.md: template DB e contrato canonico.
// Fallback hardcoded so se template foi desativado/apagado por engano (defensivo).
const VOUCHER_LINK_BASE = 'https://painel.miriandpaula.com.br/voucher.html'

async function sendVoucherLinkText(
  phone: string, token: string, recipientName: string, partnerName: string, combo: string,
  validUntil: string | null, validityDays: number | null,
  ch: { instance: string; apiUrl: string; apiKey: string }
): Promise<{ waId: string | null; err?: string; via?: 'template' | 'fallback' }> {
  const first = firstName(recipientName)
  const link = `${VOUCHER_LINK_BASE}?t=${encodeURIComponent(token)}`

  // 1. Tenta template oficial DB
  const tpl = await fetchTemplate('voucher_issued_beneficiary', 'text').catch(() => null)
  let text: string
  let via: 'template' | 'fallback' = 'fallback'

  if (tpl?.text_template) {
    const expira = validityDays ?? (validUntil
      ? Math.max(0, Math.ceil((new Date(validUntil).getTime() - Date.now()) / 86_400_000))
      : 30)
    text = renderTemplate(tpl.text_template, {
      convidada: recipientName || 'você',
      convidada_first: first,
      parceira: partnerName || 'uma parceira',
      combo,
      link,
      token,
      expira_em: expira,
    })
    via = 'template'
  } else {
    // Fallback hardcoded · ultimo recurso se template foi removido por engano
    text = [
      `${first}, aqui está seu voucher cortesia 💛`,
      ``,
      `🎟️ *${combo}*`,
      `Presente da ${partnerName || 'parceria'}`,
      ``,
      `Abre o presente completo aqui (com validade e próximos passos):`,
      link,
      ``,
      `Quando quiser marcar, me responde por aqui que eu te encaixo na agenda da Dra. Mirian. Um beijo!`,
    ].join('\n')
  }

  try {
    const r = await fetch(`${ch.apiUrl}/message/sendText/${ch.instance}`, {
      method: 'POST',
      headers: { 'apikey': ch.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, text }),
    })
    if (!r.ok) {
      const body = await r.text()
      return { waId: null, err: `send_link ${r.status}: ${body.slice(0, 200)}`, via }
    }
    const d = await r.json().catch(() => null)
    return { waId: d?.key?.id || null, via }
  } catch (e) {
    return { waId: null, err: (e as Error).message.slice(0, 200), via }
  }
}

async function uploadAudioToStorage(voucherId: string, mp3: Uint8Array): Promise<string | null> {
  // Path: 2026-04/<voucher_id>.mp3 (partitioned por mês pra facilitar cleanup)
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const path = `${yyyy}-${mm}/${voucherId}.mp3`
  try {
    const r = await fetch(`${_SB_URL}/storage/v1/object/voucher-audio/${path}`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY,
        'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'audio/mpeg',
        'x-upsert': 'true',
        'Cache-Control': 'public, max-age=2592000',  // 30d cache CDN
      },
      body: mp3,
    })
    if (!r.ok) {
      const err = await r.text()
      console.error('[storage] upload falhou:', r.status, err.slice(0, 200))
      return null
    }
    return path
  } catch (e) {
    console.error('[storage] upload exception:', (e as Error).message)
    return null
  }
}

async function logMessage(opts: {
  phone: string; content: string; wa_id: string | null; voucher_id: string;
}) {
  try {
    // Grava em wa_messages (outbound sistema, content_type=audio)
    // Busca conversation pelo phone
    const conv = await rpc('wa_find_conversation', { p_phone: opts.phone, p_remote_jid: null })
    if (!conv) return
    await fetch(`${_SB_URL}/rest/v1/wa_messages`, {
      method: 'POST',
      headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        conversation_id: conv,
        clinic_id: await clinicId(),
        direction: 'outbound',
        sender: 'sistema',
        content: '[audio] ' + opts.content.slice(0, 200),
        content_type: 'audio',
        ai_generated: true,
        status: 'sent',
        wa_message_id: opts.wa_id,
        sent_at: new Date().toISOString(),
      }),
    })
  } catch (e) {
    console.error('[log] falhou:', (e as Error).message)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (req.method !== 'POST') return err('method_not_allowed', 405)

  // Auth
  if (_SECRET) {
    const provided = req.headers.get('x-voucher-audio-secret') || ''
    if (!timingSafeEqual(provided, _SECRET)) return err('unauthorized', 401)
  }

  try {
    const body = await req.json()
    const voucherId: string = body?.voucher_id || ''
    const skipIfSent = body?.skip_if_sent !== false
    if (!voucherId) return err('voucher_id obrigatorio')

    // Busca voucher + partnership
    const voucher = await fetchVoucher(voucherId)
    if (!voucher) return err('voucher_not_found', 404)
    if (skipIfSent && voucher.audio_sent_at) {
      return ok({ ok: true, skipped: 'already_sent', at: voucher.audio_sent_at })
    }
    if (!voucher.recipient_phone) return err('recipient_phone_missing')

    const partnership = voucher.partnership_id ? await fetchPartnership(voucher.partnership_id) : null

    // Script
    // Se vem no formato legado "veu_noiva+anovator_a5", formata pra voz.
    // Se ja vem legivel ("Véu de Noiva + Anovator A5"), usa direto.
    const rawCombo = (voucher.combo || '').trim()
    const looksLegacy = /^[a-z0-9_+]+$/i.test(rawCombo) && (rawCombo.includes('_') || rawCombo.includes('+'))
    const combo = looksLegacy
      ? rawCombo.replace(/_/g, ' ').replace(/\s*\+\s*/g, ' e ')
      : rawCombo

    // Template editavel (b2b_comm_templates) com fallback hardcoded
    const audioTpl = await fetchTemplate('voucher_issued_beneficiary', 'audio')
    const convidadaFirst = firstName(voucher.recipient_name)
    const renderVars: Record<string, string | number> = {
      convidada: voucher.recipient_name || 'você',
      convidada_first: convidadaFirst,
      parceira: partnership?.name || 'uma parceira',
      combo: combo,
      pillar: partnership?.pillar || '',
    }
    const script = audioTpl?.audio_script
      ? renderTemplate(audioTpl.audio_script, renderVars)
      : buildScript({ recipient: voucher.recipient_name, partner: partnership?.name || 'uma parceira', combo })
    const audioVoice = audioTpl?.tts_voice || 'nova'
    const audioInstr = audioTpl?.tts_instructions || undefined

    // Resolve canal (Lara envia voucher pra convidada) via mira_channels
    const channel = await resolveRecipientChannel()
    console.log(`[voucher-audio] canal=${channel.instance} source=${channel.source}`)

    // Gera audio — se OpenAI TTS falhar/timeout, segue sem audio.
    // O texto+link da Lara e a confirmacao da Mira ainda rolam (nao bloqueante).
    let audioBytes: Uint8Array | null = null
    let audioErr: string | null = null
    try {
      audioBytes = await generateAudio(script, audioVoice, audioInstr)
    } catch (e) {
      audioErr = (e as Error).message.slice(0, 200)
      console.error('[voucher-audio] TTS falhou (skip audio):', audioErr)
    }

    // Upload + send audio so se gerou
    let waId: string | null = null
    let storagePath: string | null = null
    if (audioBytes) {
      const audioB64 = toBase64(audioBytes)
      const [sendRes, stored] = await Promise.all([
        sendWhatsAppAudio(voucher.recipient_phone, audioB64, channel).catch(e => {
          console.error('[voucher-audio] send audio falhou:', (e as Error).message)
          return { waId: null }
        }),
        uploadAudioToStorage(voucherId, audioBytes),
      ])
      waId = sendRes.waId
      storagePath = stored

      // Delay pra garantir que o WhatsApp termine de processar o audio (1.4MB)
      // antes do texto com link. Sem isso, texto chega ANTES do audio na cliente
      // (Evolution faz upload do mp3 enquanto texto e instantaneo) — quebra o
      // script "olha o link aqui em cima". Reportado por Alden 2026-04-29
      // (Debora Aghetoni recebeu fora de ordem). 3s cobre a maioria dos casos.
      if (waId) await new Promise((res) => setTimeout(res, 3000))
    }

    // Envia texto com link do voucher logo apos o audio (mesma Lara/canal).
    // Usa template DB voucher_issued_beneficiary/text · fallback hardcoded.
    // Fire-and-forget: se falhar, audio ja foi — nao derruba o flow.
    const validityDays = voucher.valid_until
      ? Math.max(0, Math.ceil((new Date(voucher.valid_until).getTime() - Date.now()) / 86_400_000))
      : null
    const linkRes = await sendVoucherLinkText(
      voucher.recipient_phone, voucher.token,
      voucher.recipient_name, partnership?.name || '', combo,
      voucher.valid_until || null, validityDays, channel,
    )
    if (linkRes.err) {
      console.error('[voucher-audio] link text falhou:', linkRes.err)
    } else {
      console.log(`[voucher-audio] text via=${linkRes.via}`)
    }

    // Confirmacao pro parceiro via Mira (partner_response) — fecha o loop
    // que antes exigia envio manual. Fluxo "combinado" com Alden 2026-04-23:
    // Lara -> convidada (audio + link) + Mira -> parceiro (confirmacao).
    let partnerConfirm: { waId: string | null; err?: string; phone?: string; panel_url?: string | null } = { waId: null }
    try {
      const partnerPhone = await fetchPartnerPhone(voucher.partnership_id, partnership?.contact_phone || null)
      if (partnerPhone) {
        const [partnerCh, panelUrl] = await Promise.all([
          resolvePartnerChannel(),
          fetchPanelUrl(partnership?.public_token || ''),
        ])
        const pc = await sendPartnerConfirmation(
          partnerPhone, partnership?.name || 'Parceira',
          voucher.recipient_name, combo, voucher.token,
          voucher.valid_until || null, panelUrl, partnerCh,
        )
        partnerConfirm = { ...pc, phone: partnerPhone, panel_url: panelUrl }
        if (pc.err) console.error('[voucher-audio] partner confirm falhou:', pc.err)
      }
    } catch (e) {
      console.error('[voucher-audio] partner confirm exception:', (e as Error).message)
    }

    // Marca audio_sent_at + path do storage no voucher — so se audio de fato saiu
    if (waId) {
      await fetch(`${_SB_URL}/rest/v1/b2b_vouchers?id=eq.${voucherId}`, {
        method: 'PATCH',
        headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          audio_sent_at: new Date().toISOString(),
          audio_wa_message_id: waId,
          audio_storage_path: storagePath,
        }),
      })

      // Log so se audio foi
      await logMessage({ phone: voucher.recipient_phone, content: script, wa_id: waId, voucher_id: voucherId })
    }

    return ok({
      ok: true, voucher_id: voucherId, phone: voucher.recipient_phone,
      wa_message_id: waId, audio_bytes: audioBytes?.length || 0, audio_err: audioErr,
      link_wa_id: linkRes.waId, link_err: linkRes.err || null,
      partner_confirm: partnerConfirm,
      script,
    })
  } catch (e) {
    return err((e as Error).message, 500)
  }
})
