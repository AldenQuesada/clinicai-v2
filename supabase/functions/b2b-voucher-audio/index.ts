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
  // clinic_id incluido no select pra logOutboundCanonical (audit 2026-05-06).
  const r = await fetch(`${_SB_URL}/rest/v1/b2b_vouchers?id=eq.${voucherId}&select=id,clinic_id,recipient_name,recipient_phone,combo,token,status,partnership_id,audio_sent_at,valid_until`, {
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
/**
 * Busca template editavel global pra event_key+channel.
 *
 * Audit 2026-05-06:
 *   - Adicionado filtro `recipient_role` opcional · evita pegar template de
 *     beneficiary/admin por engano quando event_key tiver multiplas variantes.
 *   - ORDER BY trocado de `priority.asc` pra `priority.desc, updated_at.desc`
 *     · prioridade ALTA vence (template "mais novo/curado" prevalece sobre
 *     baseline quando empate).
 *   - partnership_id IS NULL mantido (busca SOMENTE GLOBAL · overrides
 *     partnership-specific exigem caller passar explicitamente).
 */
async function fetchTemplate(
  eventKey: string,
  channel: string,
  recipientRole?: string,
): Promise<any | null> {
  const params = [
    `event_key=eq.${eventKey}`,
    `channel=eq.${channel}`,
    `is_active=eq.true`,
    `partnership_id=is.null`,
    `order=priority.desc,updated_at.desc`,
    `limit=1`,
  ]
  if (recipientRole) {
    params.push(`recipient_role=eq.${recipientRole}`)
  }
  const r = await fetch(
    `${_SB_URL}/rest/v1/b2b_comm_templates?${params.join('&')}`,
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

type Ch = {
  instance: string
  apiUrl: string
  apiKey: string
  source: 'db' | 'env'
  /**
   * Audit 2026-05-06: wa_number_id propagado pra logOutboundCanonical
   * setar inbox_role correto (Mih → 'secretaria', mira-mirian → 'sdr').
   * Sem isso a conv vai default 'sdr' e some do /secretaria.
   */
  waNumberId: string | null
  functionKey: string
}

/**
 * Best-effort lookup de wa_number_id quando RPC não retorna.
 * SELECT em mira_channels JOIN wa_numbers via PostgREST embed.
 * Retorna null em qualquer falha — caller propaga null e RPC b2b_log_outbound_message
 * resolve via instance_id como fallback (ou aceita null e cria conv sem scope).
 */
async function fetchWaNumberIdByFunctionKey(fkey: string): Promise<string | null> {
  try {
    const cid = await clinicId()
    const r = await fetch(
      `${_SB_URL}/rest/v1/mira_channels?clinic_id=eq.${cid}&function_key=eq.${fkey}&is_active=eq.true&select=wa_number_id`,
      { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
    )
    if (!r.ok) return null
    const arr = await r.json()
    const row = Array.isArray(arr) ? arr[0] : null
    return row?.wa_number_id ? String(row.wa_number_id) : null
  } catch { return null }
}

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
        // RPC pode ou não retornar wa_number_id · se ausente, fallback SELECT.
        const waNumberId = cfg.wa_number_id
          ? String(cfg.wa_number_id)
          : await fetchWaNumberIdByFunctionKey(fkey)
        return {
          instance:    String(cfg.instance_id),
          apiUrl:      String(cfg.api_url),
          apiKey:      String(cfg.api_key),
          waNumberId,
          source:      'db',
          functionKey: fkey,
        }
      }
    }
  } catch (_) { /* fallback */ }
  // Fallback env · sem wa_number_id (RPC b2b_log_outbound_message resolve via instance se possível)
  const waNumberId = await fetchWaNumberIdByFunctionKey(fkey)
  return {
    instance:    envInstance,
    apiUrl:      _EVO_URL,
    apiKey:      _EVO_KEY,
    waNumberId,
    source:      'env',
    functionKey: fkey,
  }
}

// Lara (recipient_voucher) = envia voucher pra convidada
const resolveRecipientChannel = (): Promise<Ch> => resolveChannelByKey('recipient_voucher', _EVO_INST)

// Mira (partner_response) = confirma pro parceiro que o voucher saiu
const resolvePartnerChannel   = (): Promise<Ch> => resolveChannelByKey('partner_response', 'mira-mirian')

// Confirma pro parceiro · texto oficial Mira (audit 2026-05-06).
// Caminho: tenta fetchTemplate('voucher_issued_partner_confirmation', 'text');
// fallback hardcoded com mesmo texto se template DB não existir/foi removido.
// Voz: Mira · NUNCA menciona Lara nesse fluxo (Lara = canal Cloud Lara
// pra paciente · diferente do canal mira-mirian que envia essa confirmation).
async function sendPartnerConfirmation(
  partnerPhone: string, partnerName: string, recipientName: string,
  combo: string, token: string, validUntil: string | null,
  panelUrl: string | null, ch: Ch,
): Promise<{ waId: string | null; err?: string; text?: string; waNumberId?: string | null; instance?: string | null; templateId?: string | null; via?: 'template' | 'fallback' }> {
  const partnerFirst = firstName(partnerName)
  const validity = validUntil
    ? new Date(validUntil).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—'
  const tokenUpper = String(token).toUpperCase()

  // Vars compartilhadas entre template DB e fallback hardcoded.
  const renderVars: Record<string, string | number> = {
    convidada:        recipientName || 'sua convidada',
    combo:            combo || 'voucher cortesia',
    token:            tokenUpper,
    valid_until:      validity,
    painel_parceira:  panelUrl || '',
    parceira_first:   partnerFirst,
  }

  // 1. Tenta template DB · futuro: criar row em b2b_comm_templates com
  //    event_key='voucher_issued_partner_confirmation', channel='text'.
  //    Fallback abaixo cobre caso template ainda não cadastrado.
  // Audit 2026-05-06: filtra recipient_role='partner' explicitamente · template
  // oficial existe (id 53f7766c-ec26-4e7b-9174-41f2bf928e18 · GLOBAL · prio 100).
  const tpl = await fetchTemplate('voucher_issued_partner_confirmation', 'text', 'partner').catch(() => null)
  let text: string
  let via: 'template' | 'fallback'
  let templateId: string | null = null

  if (tpl?.text_template) {
    text = renderTemplate(tpl.text_template, renderVars)
    via = 'template'
    templateId = tpl.id ?? null
  } else {
    // Fallback hardcoded · texto OFICIAL aprovado 2026-05-06 (voz Mira).
    // Mantém paridade com template futuro · caso template seja
    // criado/editado, este fallback fica como safety net defensivo.
    const lines: string[] = [
      `✨ *Prontinho, voucher enviado para ${renderVars.convidada}*`,
      ``,
      `Acabei de entregar o presente direto no WhatsApp dela, com o link, as orientações e o prazo de validade. Pode descansar: o fluxo agora corre com a gente.`,
      ``,
      `🎟️ *Voucher cortesia* — ${renderVars.combo}`,
      `👤 *Para:* ${renderVars.convidada}`,
      `🔑 *Código:* ${renderVars.token}`,
      `⏰ *Válido até:* ${renderVars.valid_until}`,
      ``,
      `Assim que ela abrir ou agendar, te aviso por aqui, combinado?`,
    ]
    if (renderVars.painel_parceira) {
      lines.push(
        ``,
        `📊 *Acompanhe em tempo real no seu painel:* 👇`,
        String(renderVars.painel_parceira),
      )
    }
    lines.push(
      ``,
      `${renderVars.parceira_first}, obrigada pela confiança de sempre 💜`,
      `— *Mira*, da Clínica Mirian de Paula`,
    )
    text = lines.join('\n')
    via = 'fallback'
  }

  try {
    const r = await fetch(`${ch.apiUrl}/message/sendText/${ch.instance}`, {
      method: 'POST',
      headers: { 'apikey': ch.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: partnerPhone, text }),
    })
    if (!r.ok) {
      const body = await r.text()
      return {
        waId: null,
        err: `partner_confirm ${r.status}: ${body.slice(0, 200)}`,
        text,
        waNumberId: ch.waNumberId,
        instance: ch.instance,
        templateId,
        via,
      }
    }
    const d = await r.json().catch(() => null)
    // Retorna waNumberId/instance do canal usado · permite ao caller logar
    // sem re-resolver o canal (audit 2026-05-06 · evita divergência de config).
    return {
      waId: d?.key?.id || null,
      text,
      waNumberId: ch.waNumberId,
      instance: ch.instance,
      templateId,
      via,
    }
  } catch (e) {
    return {
      waId: null,
      err: (e as Error).message.slice(0, 200),
      text,
      waNumberId: ch.waNumberId,
      instance: ch.instance,
      templateId,
      via,
    }
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
): Promise<{ waId: string | null; err?: string; via?: 'template' | 'fallback'; text?: string; templateId?: string | null }> {
  const first = firstName(recipientName)
  const link = `${VOUCHER_LINK_BASE}?t=${encodeURIComponent(token)}`

  // 1. Tenta template oficial DB
  const tpl = await fetchTemplate('voucher_issued_beneficiary', 'text', 'beneficiary').catch(() => null)
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
    // Fallback hardcoded · ultimo recurso se template foi removido por engano.
    // Audit 2026-05-06: alinhado com texto oficial · zero abertura duplicada
    // (audio ja diz "Oi {nome}") · assinatura "— Clínica Mirian de Paula" ·
    // link em linha propria pra clicabilidade no dash.
    const expiraDays = validityDays ?? 30
    text = [
      `${first}, seu Voucher Presente foi liberado 🎁`,
      ``,
      `A ${partnerName || 'parceira'} escolheu te presentear com uma experiência especial na Clínica Mirian de Paula:`,
      ``,
      `✨ ${combo}`,
      ``,
      `Acesse seu voucher aqui:`,
      link,
      ``,
      `Ele é válido por ${expiraDays} dias.`,
      ``,
      `Quando quiser agendar, é só responder esta mensagem que nossa equipe te ajuda. 💛`,
      ``,
      `— Clínica Mirian de Paula`,
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
      return { waId: null, err: `send_link ${r.status}: ${body.slice(0, 200)}`, via, text, templateId: tpl?.id ?? null }
    }
    const d = await r.json().catch(() => null)
    return { waId: d?.key?.id || null, via, text, templateId: tpl?.id ?? null }
  } catch (e) {
    return { waId: null, err: (e as Error).message.slice(0, 200), via, text, templateId: tpl?.id ?? null }
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

/**
 * Helper canônico (audit 2026-05-06): chama RPC b2b_log_outbound_message que:
 *   1. Resolve/cria lead
 *   2. Resolve/cria wa_conversations (com wa_number_id correto · inbox_role auto)
 *   3. INSERT wa_messages (idempotente via UNIQUE provider_msg_id)
 *   4. INSERT b2b_comm_dispatch_log
 *   5. Trigger trg_sync_wa_conversation_preview_v2 atualiza last_message_at/preview
 *
 * Substitui o logMessage legado que dependia de wa_find_conversation
 * (retornava null pra phones novos · skip silencioso · voucher fora do dash novo).
 *
 * Best-effort: NUNCA derruba o envio. Se a RPC falhar mas o WhatsApp já saiu,
 * apenas retorna { ok:false, error } pra inclusão no canonical_logs do response.
 */
type CanonicalPayload = {
  clinic_id?: string
  voucher_id?: string
  partnership_id?: string | null
  template_id?: string | null
  wa_number_id?: string | null
  recipient_phone: string
  recipient_name?: string | null
  recipient_role: 'beneficiary' | 'partner'
  event_key: string
  channel: 'evolution'
  sender: 'sistema'
  sender_instance?: string | null
  content_type: 'audio' | 'text'
  content: string
  media_url?: string | null
  audio_url?: string | null
  provider_msg_id?: string | null
  wa_message_id?: string | null
  status?: 'sent' | 'failed'
  error_message?: string | null
  meta?: Record<string, unknown>
  dispatch_meta?: Record<string, unknown>
}

/**
 * Contrato real da RPC b2b_log_outbound_message (audit 2026-05-06):
 *   { ok, lead_id, conversation_id, message_id, dispatch_id,
 *     provider_msg_id, idempotent_message }
 *
 * NOTA: a RPC usa o nome `dispatch_id` (não `dispatch_log_id`). O alias
 * `dispatch_log_id` é mantido aqui só pra compat de leitores externos · ambos
 * apontam pro mesmo valor.
 */
type CanonicalResult = {
  ok: boolean
  error?: string
  lead_id?: string
  conversation_id?: string
  message_id?: string
  dispatch_id?: string
  /** Alias defensivo · ambos espelham o id retornado pela RPC. */
  dispatch_log_id?: string
  provider_msg_id?: string
  idempotent_message?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw?: any
}

async function logOutboundCanonical(payload: CanonicalPayload): Promise<CanonicalResult> {
  try {
    const r = await fetch(`${_SB_URL}/rest/v1/rpc/b2b_log_outbound_message`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY,
        'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_payload: payload }),
    })
    const text = await r.text()
    if (!r.ok) {
      console.warn('[canonical_log] http_error', {
        status: r.status,
        step: payload.meta?.step,
        recipient_role: payload.recipient_role,
        body: text.slice(0, 300),
      })
      return { ok: false, error: `http_${r.status}: ${text.slice(0, 200)}` }
    }
    let parsed: Record<string, unknown> | null = null
    try { parsed = JSON.parse(text) } catch { /* noop */ }
    if (!parsed || parsed.ok !== true) {
      console.warn('[canonical_log] rpc_not_ok', {
        step: payload.meta?.step,
        recipient_role: payload.recipient_role,
        result: parsed,
      })
      return {
        ok: false,
        error: typeof parsed?.error === 'string' ? parsed.error : 'rpc_returned_not_ok',
        raw: parsed,
      }
    }
    // Mapeia dispatch_id da RPC · expõe também alias dispatch_log_id pra compat.
    // Se versão futura da RPC trocar pra dispatch_log_id, fallback `?? raw.dispatch_log_id`
    // mantém o helper funcionando sem mudança de código.
    const dispatchId =
      (typeof parsed.dispatch_id === 'string' ? parsed.dispatch_id : undefined) ??
      (typeof parsed.dispatch_log_id === 'string' ? parsed.dispatch_log_id : undefined)
    return {
      ok: true,
      lead_id: typeof parsed.lead_id === 'string' ? parsed.lead_id : undefined,
      conversation_id: typeof parsed.conversation_id === 'string' ? parsed.conversation_id : undefined,
      message_id: typeof parsed.message_id === 'string' ? parsed.message_id : undefined,
      dispatch_id: dispatchId,
      dispatch_log_id: dispatchId,
      provider_msg_id: typeof parsed.provider_msg_id === 'string' ? parsed.provider_msg_id : undefined,
      idempotent_message: typeof parsed.idempotent_message === 'boolean' ? parsed.idempotent_message : undefined,
      raw: parsed,
    }
  } catch (e) {
    console.warn('[canonical_log] exception', {
      step: payload.meta?.step,
      recipient_role: payload.recipient_role,
      error: (e as Error).message,
    })
    return { ok: false, error: (e as Error).message }
  }
}

// logMessage legado (wa_find_conversation + INSERT direto wa_messages) APOSENTADO
// em 2026-05-06 · substituído por logOutboundCanonical que vai pela RPC
// b2b_log_outbound_message. Mantemos a function removida do flow · zero callers.

/**
 * Variante direta pra partner_confirmation (audit 2026-05-06 · caso Rachel/Dani).
 *
 * Problema: RPC b2b_log_outbound_message resolveu conversation pelo phone
 * sem honrar wa_number_id do payload · partner confirmation enviada via
 * mira-mirian (chip 7673) caía na conversa Mih/Secretaria existente da Dani.
 * Resultado: dispatch_log com sender_instance='mira-mirian' mas wa_messages
 * vinculada à conv da Secretaria · histórico no canal errado.
 *
 * Solução defensiva sem mexer no banco: edge faz INSERT direto em
 * wa_conversations (resolve OU cria scoped por wa_number_id) + wa_messages
 * + b2b_comm_dispatch_log. Mantém a RPC pra beneficiária (caso novo · RPC
 * cria conversa nova com Mih · funciona).
 *
 * Trigger trg_sync_wa_conversation_preview_v2 (mig 116) cuida do preview
 * automaticamente · zero double-write.
 */
async function logPartnerConfirmationDirect(payload: {
  clinic_id?: string
  voucher_id: string
  partnership_id: string | null
  template_id?: string | null
  wa_number_id: string | null
  recipient_phone: string
  recipient_name: string | null
  sender_instance: string | null
  content: string
  provider_msg_id: string | null
  meta: Record<string, unknown>
}): Promise<CanonicalResult> {
  try {
    const cid = payload.clinic_id || (await clinicId())

    // 1. Resolve conversation por (phone + wa_number_id) — scope correto.
    let convId: string | null = null
    if (payload.wa_number_id) {
      const r = await fetch(
        `${_SB_URL}/rest/v1/wa_conversations?clinic_id=eq.${cid}&phone=eq.${payload.recipient_phone}&wa_number_id=eq.${payload.wa_number_id}&select=id&limit=1`,
        { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
      )
      if (r.ok) {
        const arr = await r.json()
        if (Array.isArray(arr) && arr[0]?.id) convId = String(arr[0].id)
      }
    }

    // 2. Cria conversation nova SCOPED por wa_number_id se não achou.
    //    Trigger fn_wa_conversations_inbox_role_sync (mig 91) propaga
    //    inbox_role correto do wa_numbers · Mira → 'sdr' default.
    if (!convId) {
      const insertConvR = await fetch(`${_SB_URL}/rest/v1/wa_conversations`, {
        method: 'POST',
        headers: {
          'apikey': _SB_KEY,
          'Authorization': `Bearer ${_SB_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation',
        },
        body: JSON.stringify({
          clinic_id: cid,
          phone: payload.recipient_phone,
          wa_number_id: payload.wa_number_id,
          status: 'active',
          ai_enabled: true,
          display_name: payload.recipient_name,
          last_message_at: new Date().toISOString(),
        }),
      })
      if (insertConvR.ok) {
        const arr = await insertConvR.json()
        const row = Array.isArray(arr) ? arr[0] : arr
        if (row?.id) convId = String(row.id)
      } else {
        const errText = await insertConvR.text()
        console.warn('[partner_log_direct] wa_conversations insert failed', insertConvR.status, errText.slice(0, 200))
      }
    }

    if (!convId) {
      return { ok: false, error: 'conversation_resolve_failed' }
    }

    // 3. INSERT wa_messages (idempotent · UNIQUE provider_msg_id captura 23505).
    const msgPayload: Record<string, unknown> = {
      conversation_id: convId,
      clinic_id:       cid,
      phone:           payload.recipient_phone,
      direction:       'outbound',
      sender:          'sistema',
      content:         payload.content,
      content_type:    'text',
      ai_generated:    true,
      status:          'sent',
      sent_at:         new Date().toISOString(),
      channel:         'evolution',
    }
    if (payload.template_id) {
      // Audit 2026-05-06: template_id propagado pra wa_messages permite o dash
      // novo (resolveOutboundLabel) detectar B2B/voucher via whitelist.
      msgPayload.template_id = payload.template_id
    }
    if (payload.provider_msg_id) {
      msgPayload.provider_msg_id = payload.provider_msg_id
      msgPayload.wa_message_id   = payload.provider_msg_id
    }

    let messageId: string | undefined
    let idempotent = false
    const insertMsgR = await fetch(`${_SB_URL}/rest/v1/wa_messages`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY,
        'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(msgPayload),
    })
    if (insertMsgR.ok) {
      const arr = await insertMsgR.json()
      const row = Array.isArray(arr) ? arr[0] : arr
      if (row?.id) messageId = String(row.id)
    } else if (insertMsgR.status === 409 && payload.provider_msg_id) {
      // 23505 unique_violation (uq_wa_messages_provider_id) · busca existente.
      idempotent = true
      const existR = await fetch(
        `${_SB_URL}/rest/v1/wa_messages?clinic_id=eq.${cid}&provider_msg_id=eq.${payload.provider_msg_id}&select=id&limit=1`,
        { headers: { 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}`, 'Accept': 'application/json' } },
      )
      if (existR.ok) {
        const arr = await existR.json()
        if (Array.isArray(arr) && arr[0]?.id) messageId = String(arr[0].id)
      }
    } else {
      const errText = await insertMsgR.text()
      console.warn('[partner_log_direct] wa_messages insert failed', insertMsgR.status, errText.slice(0, 200))
    }

    // 4. INSERT b2b_comm_dispatch_log.
    let dispatchId: string | undefined
    const dispatchR = await fetch(`${_SB_URL}/rest/v1/b2b_comm_dispatch_log`, {
      method: 'POST',
      headers: {
        'apikey': _SB_KEY,
        'Authorization': `Bearer ${_SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        clinic_id:       cid,
        partnership_id:  payload.partnership_id,
        template_id:     payload.template_id ?? null,
        event_key:       'voucher_issued_partner_confirmation',
        channel:         'text',
        recipient_role:  'partner',
        recipient_phone: payload.recipient_phone,
        sender_instance: payload.sender_instance,
        text_content:    payload.content,
        wa_message_id:   payload.provider_msg_id,
        status:          'sent',
        meta:            payload.meta,
      }),
    })
    if (dispatchR.ok) {
      const arr = await dispatchR.json()
      const row = Array.isArray(arr) ? arr[0] : arr
      if (row?.id) dispatchId = String(row.id)
    } else {
      const errText = await dispatchR.text()
      console.warn('[partner_log_direct] b2b_comm_dispatch_log insert failed', dispatchR.status, errText.slice(0, 200))
    }

    return {
      ok: true,
      conversation_id: convId,
      message_id: messageId,
      dispatch_id: dispatchId,
      dispatch_log_id: dispatchId,
      provider_msg_id: payload.provider_msg_id ?? undefined,
      idempotent_message: idempotent || undefined,
    }
  } catch (e) {
    console.warn('[partner_log_direct] exception', (e as Error).message)
    return { ok: false, error: (e as Error).message }
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
    const audioTpl = await fetchTemplate('voucher_issued_beneficiary', 'audio', 'beneficiary')
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
    let partnerConfirm: {
      waId: string | null
      err?: string
      phone?: string
      panel_url?: string | null
      text?: string
      waNumberId?: string | null
      instance?: string | null
      templateId?: string | null
      via?: 'template' | 'fallback'
    } = { waId: null }
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
    }

    // ─── Log canônico no dash novo (audit 2026-05-06) ───────────────────────
    // RPC b2b_log_outbound_message resolve/cria conversation, INSERT wa_messages
    // (com provider_msg_id idempotente), INSERT b2b_comm_dispatch_log. Trigger
    // trg_sync_wa_conversation_preview_v2 atualiza last_message_at/preview.
    // Best-effort: WhatsApp já saiu · falha aqui apenas vira warning + entry
    // em canonical_logs. NUNCA reenviar WhatsApp por falha de log.
    const canonicalLogs: Record<string, CanonicalResult | null> = {
      beneficiary_audio: null,
      beneficiary_text: null,
      partner_confirmation: null,
    }
    const canonicalWarnings: string[] = []

    // 1. Beneficiária · áudio
    if (waId) {
      canonicalLogs.beneficiary_audio = await logOutboundCanonical({
        clinic_id: voucher.clinic_id,
        voucher_id: voucher.id,
        partnership_id: voucher.partnership_id ?? null,
        template_id: audioTpl?.id ?? null,
        wa_number_id: channel.waNumberId,
        recipient_phone: voucher.recipient_phone,
        recipient_name: voucher.recipient_name ?? null,
        recipient_role: 'beneficiary',
        event_key: 'voucher_issued_beneficiary',
        channel: 'evolution',
        sender: 'sistema',
        sender_instance: channel.instance,
        content_type: 'audio',
        content: '[áudio] ' + (script || '').slice(0, 200),
        media_url: storagePath,
        audio_url: storagePath,
        provider_msg_id: waId,
        wa_message_id: waId,
        status: 'sent',
        meta: {
          source: 'b2b-voucher-audio',
          step: 'beneficiary_audio',
          combo: voucher.combo,
          token: voucher.token,
          channel_source: channel.source,
        },
      })
      if (!canonicalLogs.beneficiary_audio.ok) {
        canonicalWarnings.push(`beneficiary_audio: ${canonicalLogs.beneficiary_audio.error ?? 'unknown'}`)
      }
    }

    // 2. Beneficiária · texto com link
    if (linkRes.waId) {
      canonicalLogs.beneficiary_text = await logOutboundCanonical({
        clinic_id: voucher.clinic_id,
        voucher_id: voucher.id,
        partnership_id: voucher.partnership_id ?? null,
        template_id: linkRes.templateId ?? null,
        wa_number_id: channel.waNumberId,
        recipient_phone: voucher.recipient_phone,
        recipient_name: voucher.recipient_name ?? null,
        recipient_role: 'beneficiary',
        event_key: 'voucher_issued_beneficiary',
        channel: 'evolution',
        sender: 'sistema',
        sender_instance: channel.instance,
        content_type: 'text',
        content: linkRes.text ?? '',
        provider_msg_id: linkRes.waId,
        wa_message_id: linkRes.waId,
        status: 'sent',
        meta: {
          source: 'b2b-voucher-audio',
          step: 'beneficiary_text',
          combo: voucher.combo,
          token: voucher.token,
          via: linkRes.via ?? null,
          channel_source: channel.source,
        },
      })
      if (!canonicalLogs.beneficiary_text.ok) {
        canonicalWarnings.push(`beneficiary_text: ${canonicalLogs.beneficiary_text.error ?? 'unknown'}`)
      }
    }

    // 3. Parceiro · confirmação. Só loga se efetivamente enviou (waId).
    //    Audit 2026-05-06: usa logPartnerConfirmationDirect (bypass RPC) pra
    //    GARANTIR scope correto (mira-mirian) · RPC b2b_log_outbound_message
    //    estava resolvendo conversation pelo phone sem honrar wa_number_id ·
    //    msgs do parceiro caíam na conversa Mih/Secretaria existente da Dani.
    //    Direct insert via REST resolve/cria conv scoped por wa_number_id.
    //    Beneficiária continua via RPC normalmente (caso novo · cria conv Mih).
    if (partnerConfirm.waId && partnerConfirm.phone) {
      canonicalLogs.partner_confirmation = await logPartnerConfirmationDirect({
        clinic_id:       voucher.clinic_id,
        voucher_id:      voucher.id,
        partnership_id:  voucher.partnership_id ?? null,
        template_id:     partnerConfirm.templateId ?? null,
        wa_number_id:    partnerConfirm.waNumberId ?? null,
        recipient_phone: partnerConfirm.phone,
        recipient_name:  partnership?.name ?? null,
        sender_instance: partnerConfirm.instance ?? null,
        content:         partnerConfirm.text ?? '',
        provider_msg_id: partnerConfirm.waId,
        meta: {
          source:           'b2b-voucher-audio',
          step:             'partner_confirmation',
          beneficiary_name: voucher.recipient_name,
          combo:            voucher.combo,
          token:            voucher.token,
          via:              partnerConfirm.via ?? null,
        },
      })
      if (!canonicalLogs.partner_confirmation.ok) {
        canonicalWarnings.push(`partner_confirmation: ${canonicalLogs.partner_confirmation.error ?? 'unknown'}`)
      }
    }

    return ok({
      ok: true,
      voucher_id: voucherId,
      phone: voucher.recipient_phone,
      wa_message_id: waId,
      audio_wa_id: waId,
      audio_bytes: audioBytes?.length || 0,
      audio_err: audioErr,
      audio_storage_path: storagePath,
      link_wa_id: linkRes.waId,
      link_err: linkRes.err || null,
      partner_wa_id: partnerConfirm.waId,
      partner_confirm: partnerConfirm,
      canonical_logs: canonicalLogs,
      warnings: canonicalWarnings.length > 0 ? canonicalWarnings : undefined,
      script,
    })
  } catch (e) {
    return err((e as Error).message, 500)
  }
})
